import { generateText } from 'ai'
import type { WorkflowAiStreamEvent } from '../../ai/types.js'
import { resolveModelProfile, createProvider } from '../workflowAi/profiles.js'
import type { AgentConclusion, AgentLoopIteration, AgentLoopStreamEmitter } from './types.js'

const WORKFLOW_AI_MODEL_TIMEOUT_MS = 45_000
const CONCLUSION_MAX_RESULT_CHARS = 4000

export const runConclusionPhase = async (
  userPrompt: string,
  iterations: AgentLoopIteration[],
  profile: any,
  emitEvent: AgentLoopStreamEmitter,
): Promise<AgentConclusion> => {
  emitEvent({ type: 'conclusion_started' } as WorkflowAiStreamEvent)

  const resolvedProfile = resolveModelProfile(profile)
  if (!resolvedProfile.enabled || !resolvedProfile.apiKey) {
    const fallback = buildFallbackConclusion(iterations)
    emitEvent({
      type: 'conclusion_completed',
      conclusion: fallback,
    } as WorkflowAiStreamEvent)
    return fallback
  }

  const provider = createProvider(resolvedProfile)

  const analysisSummary = iterations
    .map((it) => {
      const resultsText = it.executionResults
        .map((r) =>
          r.success
            ? `  ✓ ${r.nodeLabel}: ${truncateText(r.resultSummary, 300)}`
            : `  ✗ ${r.nodeLabel}: 失败 - ${truncateText(r.error ?? '未知错误', 200)}`,
        )
        .join('\n')
      return `第${it.iteration}轮:\n计划: ${truncateText(it.plan.summary, 300)}\n结果:\n${resultsText}`
    })
    .join('\n\n')
    .slice(0, CONCLUSION_MAX_RESULT_CHARS)

  const systemPrompt = [
    '你是数据分析助手。请根据以下分析过程和结果，生成完整的分析结论。',
    '你必须返回一个 JSON 对象，包含以下字段：',
    '- summary: 分析总结（2-3句话，用中文）',
    '- findings: 关键发现列表（字符串数组，每条用中文）',
    '- recommendations: 建议列表（字符串数组，每条用中文）',
    '- caveats: 注意事项列表（字符串数组，每条用中文）',
    '',
    '要求：',
    '1. 结论必须有数据支撑，不要编造',
    '2. 如果分析结果不足以得出确定结论，要在 caveats 中说明',
    '3. 所有内容使用中文',
    '4. 只返回 JSON，不要返回其他内容',
  ].join('\n')

  const userPromptText = [
    `用户问题: ${userPrompt}`,
    '',
    '分析过程与结果:',
    analysisSummary,
  ].join('\n')

  try {
    const result = await generateText({
      model: provider.chatModel(resolvedProfile.model),
      system: systemPrompt,
      prompt: userPromptText,
      temperature: 0.2,
      maxOutputTokens: 1024,
      timeout: { totalMs: WORKFLOW_AI_MODEL_TIMEOUT_MS },
    })

    const conclusion = parseConclusion(result.text)

    emitEvent({
      type: 'conclusion_completed',
      conclusion,
    } as WorkflowAiStreamEvent)

    return conclusion
  } catch {
    const fallback = buildFallbackConclusion(iterations)
    emitEvent({
      type: 'conclusion_completed',
      conclusion: fallback,
    } as WorkflowAiStreamEvent)
    return fallback
  }
}

export const parseConclusion = (rawText: string): AgentConclusion => {
  try {
    const stripped = rawText
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```$/i, '')
      .trim()

    const startIndex = stripped.indexOf('{')
    const endIndex = stripped.lastIndexOf('}')
    if (startIndex < 0 || endIndex < 0) {
      return buildTextConclusion(stripped)
    }

    const jsonStr = stripped.slice(startIndex, endIndex + 1)
    const parsed = JSON.parse(jsonStr)

    return {
      summary: typeof parsed.summary === 'string' ? parsed.summary : '分析已完成',
      findings: Array.isArray(parsed.findings)
        ? parsed.findings.filter((f: unknown) => typeof f === 'string')
        : [],
      recommendations: Array.isArray(parsed.recommendations)
        ? parsed.recommendations.filter((r: unknown) => typeof r === 'string')
        : [],
      caveats: Array.isArray(parsed.caveats)
        ? parsed.caveats.filter((c: unknown) => typeof c === 'string')
        : [],
    }
  } catch {
    return buildTextConclusion(rawText)
  }
}

const buildTextConclusion = (text: string): AgentConclusion => ({
  summary: text.slice(0, 500),
  findings: [],
  recommendations: [],
  caveats: ['此结论由模型文本输出自动生成，未经结构化解析'],
})

const buildFallbackConclusion = (iterations: AgentLoopIteration[]): AgentConclusion => {
  const allResults = iterations.flatMap((it) => it.executionResults)
  const successCount = allResults.filter((r) => r.success).length
  const failCount = allResults.length - successCount

  return {
    summary: `共完成 ${iterations.length} 轮分析，执行了 ${allResults.length} 个节点（成功 ${successCount} 个，失败 ${failCount} 个）`,
    findings: allResults
      .filter((r) => r.success)
      .map((r) => `${r.nodeLabel}: ${r.resultSummary}`),
    recommendations: [],
    caveats: failCount > 0 ? [`${failCount} 个节点执行失败，部分结果可能不完整`] : [],
  }
}

const truncateText = (text: string, maxLen: number) =>
  text.length <= maxLen ? text : `${text.slice(0, maxLen)}...`
