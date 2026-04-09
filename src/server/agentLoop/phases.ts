import { generateText, stepCountIs } from 'ai'
import type { WorkflowAiPlanRequest, WorkflowAiStreamEvent } from '../../ai/types.js'
import { streamWorkflowAiPlan, resolveModelProfile, createProvider } from '../workflowAi/profiles.js'
import type {
  AgentExecutionResult,
  AgentInterpretationResult,
  AgentLoopStreamEmitter,
} from './types.js'
import { agentLoopTools } from './toolRegistry.js'
import { executeNodesForAgent } from './nodeExecutor.js'

const WORKFLOW_AI_MODEL_TIMEOUT_MS = 45_000

// ─── Phase 1: 意图理解 ───

export const runIntentPhase = async (
  request: WorkflowAiPlanRequest,
  emitEvent: AgentLoopStreamEmitter,
): Promise<WorkflowAiPlanRequest> => {
  emitEvent({ type: 'stage_changed', stage: 'model_request', attempt: 0, message: '正在理解分析意图' })

  const resolvedProfile = resolveModelProfile(request.profile)
  if (!resolvedProfile.enabled || !resolvedProfile.apiKey) {
    return request
  }

  const provider = createProvider(resolvedProfile)

  try {
    const result = await generateText({
      model: provider.chatModel(resolvedProfile.model),
      system: [
        '你是数据分析助手。用户会描述一个数据分析需求，你需要提取以下信息并返回 JSON：',
        '- analysis_goal: 分析目标（相关性分析/特征筛选/回归分析/探索性分析/其他）',
        '- target_hint: 用户可能想预测或关注的目标变量提示（如果有的话）',
        '- data_hint: 用户提到的数据来源提示',
        '只返回 JSON，不要返回其他内容。',
      ].join('\n'),
      prompt: request.prompt,
      temperature: 0.1,
      maxOutputTokens: 256,
      timeout: { totalMs: 15_000 },
    })

    const parsed = JSON.parse(result.text)
    if (parsed.analysis_goal || parsed.target_hint) {
      const enrichedPrompt = [
        request.prompt,
        '',
        '[系统补充]',
        parsed.analysis_goal ? `分析目标: ${parsed.analysis_goal}` : '',
        parsed.target_hint ? `目标变量提示: ${parsed.target_hint}` : '',
        parsed.data_hint ? `数据来源提示: ${parsed.data_hint}` : '',
      ]
        .filter(Boolean)
        .join('\n')

      return { ...request, prompt: enrichedPrompt }
    }
  } catch {
    // 意图理解失败不阻塞流程，直接使用原始 prompt
  }

  return request
}

// ─── Phase 2: 结构化规划 ───

export const runPlanningPhase = async (
  request: WorkflowAiPlanRequest,
  emitEvent: AgentLoopStreamEmitter,
): Promise<{ plan: any; diagnostics: any }> => {
  const planResult = await streamWorkflowAiPlan(request, (event) => {
    emitEvent(event)
  })
  return planResult
}

// ─── Phase 3: 自动执行 ───

export const runExecutionPhase = async (
  plan: any,
  request: WorkflowAiPlanRequest,
  emitEvent: AgentLoopStreamEmitter,
): Promise<AgentExecutionResult[]> => {
  return executeNodesForAgent(plan, request, emitEvent)
}

// ─── Phase 4: 结果分析（LLM 决策） ───

const CONTINUE_KEYWORDS = /继续|追加|还需要|进一步|不够|补充|额外|更多|深入|细化|扩展/
const STOP_KEYWORDS = /完成|足够|充分|已得出|结论|结束|无需/

export const runInterpretationPhase = async (
  request: WorkflowAiPlanRequest,
  planSummary: string,
  executionResults: AgentExecutionResult[],
  iteration: number,
  emitEvent: AgentLoopStreamEmitter,
): Promise<AgentInterpretationResult> => {
  const resolvedProfile = resolveModelProfile(request.profile)
  if (!resolvedProfile.enabled || !resolvedProfile.apiKey) {
    return { text: '模型不可用，默认结束分析', shouldContinue: false }
  }

  const provider = createProvider(resolvedProfile)

  const resultsSummary = executionResults
    .map((r) =>
      r.success
        ? `✓ ${r.nodeLabel}(${r.nodeType}): ${r.resultSummary}`
        : `✗ ${r.nodeLabel}(${r.nodeType}): 失败 - ${r.error}`,
    )
    .join('\n')

  const systemPrompt = [
    '你是数据分析助手。以下是第 {iteration} 轮分析的结果摘要。',
    '用户原始需求：{userPrompt}',
    '',
    '当前轮次计划摘要：{planSummary}',
    '',
    '执行结果：',
    resultsSummary,
    '',
    '请判断分析结果是否已经充分回答了用户的问题。',
    '如果充分，调用 conclude_analysis 工具生成结论。',
    '如果不够充分，调用 request_additional_analysis 工具说明需要追加什么分析。',
    '你必须调用其中一个工具来做出决策。',
  ]
    .join('\n')
    .replace('{iteration}', String(iteration))
    .replace('{userPrompt}', request.prompt.slice(0, 500))
    .replace('{planSummary}', planSummary.slice(0, 500))

  const userPrompt = '请分析上述结果并做出决策：是结束分析还是追加分析？'

  try {
    const result = await generateText({
      model: provider.chatModel(resolvedProfile.model),
      system: systemPrompt,
      prompt: userPrompt,
      tools: agentLoopTools,
      stopWhen: stepCountIs(3),
      temperature: 0.1,
      timeout: { totalMs: WORKFLOW_AI_MODEL_TIMEOUT_MS },
    })

    // 检查 tool results
    for (const step of result.steps) {
      for (const toolCall of step.toolCalls) {
        if (toolCall.toolName === 'conclude_analysis') {
          const input = (toolCall as any).input as { summary: string; should_continue: false }
          return {
            text: input.summary,
            shouldContinue: false,
          }
        }
        if (toolCall.toolName === 'request_additional_analysis') {
          const input = (toolCall as any).input as {
            reason: string
            analysis_type: string
            target_fields?: string[]
            should_continue: true
          }
          return {
            text: input.reason,
            shouldContinue: true,
            continueReason: `${input.analysis_type}${input.target_fields ? `，关注字段: ${input.target_fields.join(', ')}` : ''}`,
          }
        }
      }
    }

    // LLM 没有调用工具，回退到文本分析
    return parseInterpretationFromText(result.text)
  } catch (error) {
    // AI SDK 可能不支持 tools，回退到纯文本模式
    try {
      const fallbackResult = await generateText({
        model: provider.chatModel(resolvedProfile.model),
        system: systemPrompt,
        prompt: userPrompt + '\n\n请直接回答"需要继续分析"或"分析已完成"。',
        temperature: 0.1,
        timeout: { totalMs: WORKFLOW_AI_MODEL_TIMEOUT_MS },
      })
      return parseInterpretationFromText(fallbackResult.text)
    } catch {
      return { text: '结果分析调用失败，默认结束', shouldContinue: false }
    }
  }
}

const parseInterpretationFromText = (text: string): AgentInterpretationResult => {
  if (STOP_KEYWORDS.test(text)) {
    return { text, shouldContinue: false }
  }
  if (CONTINUE_KEYWORDS.test(text)) {
    return { text, shouldContinue: true, continueReason: text.slice(0, 200) }
  }
  // 默认结束
  return { text, shouldContinue: false }
}

// ─── 辅助：构建下一轮请求 ───

export const buildNextIterationRequest = (
  previousRequest: WorkflowAiPlanRequest,
  previousPlanSummary: string,
  executionResults: AgentExecutionResult[],
  interpretation: AgentInterpretationResult,
): WorkflowAiPlanRequest => {
  const successResults = executionResults.filter((r) => r.success)
  const resultContext = successResults
    .map((r) => `${r.nodeLabel}: ${r.resultSummary}`)
    .join('\n')

  const enrichedPrompt = [
    `基于上一轮分析结果，追加分析步骤。`,
    `上一轮已完成: ${resultContext}`,
    `追加原因: ${interpretation.continueReason ?? interpretation.text}`,
    ``,
    `原始需求: ${previousRequest.prompt}`,
  ].join('\n')

  return {
    ...previousRequest,
    prompt: enrichedPrompt,
    mode: 'edit',
    workflowSnapshot: previousRequest.workflowSnapshot,
  }
}
