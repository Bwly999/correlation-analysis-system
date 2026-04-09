import type { WorkflowAiPlanRequest, WorkflowAiStreamEvent } from '../../ai/types.js'
import type {
  AgentLoopConfig,
  AgentLoopIteration,
  AgentLoopOutput,
  AgentLoopStreamEmitter,
} from './types.js'
import { DEFAULT_AGENT_LOOP_CONFIG } from './types.js'
import {
  runIntentPhase,
  runPlanningPhase,
  runExecutionPhase,
  runInterpretationPhase,
  buildNextIterationRequest,
} from './phases.js'
import { runConclusionPhase } from './conclusionGenerator.js'

export const runAgentLoop = async (
  request: WorkflowAiPlanRequest,
  config: Partial<AgentLoopConfig> = {},
  emitEvent: AgentLoopStreamEmitter,
): Promise<AgentLoopOutput> => {
  const mergedConfig: AgentLoopConfig = {
    ...DEFAULT_AGENT_LOOP_CONFIG,
    ...config,
  }

  const iterations: AgentLoopIteration[] = []
  const startedAt = Date.now()

  emitEvent({
    type: 'loop_started',
    maxIterations: mergedConfig.maxIterations,
  } as WorkflowAiStreamEvent)

  // Phase 1: 意图理解
  const enrichedRequest = await runIntentPhase(request, emitEvent)
  let currentRequest = enrichedRequest

  // Phase 2-4 循环
  for (let i = 0; i < mergedConfig.maxIterations; i++) {
    emitEvent({
      type: 'loop_iteration_started',
      iteration: i + 1,
    } as WorkflowAiStreamEvent)

    // Phase 2: 结构化规划
    const planResult = await runPlanningPhase(currentRequest, emitEvent)

    if (mergedConfig.autoExecute && planResult.plan.operations.length > 0) {
      // Phase 3: 自动执行
      const executionResults = await runExecutionPhase(
        planResult.plan,
        currentRequest,
        emitEvent,
      )

      // Phase 4: 结果分析
      const interpretation = await runInterpretationPhase(
        currentRequest,
        planResult.plan.summary,
        executionResults,
        i + 1,
        emitEvent,
      )

      iterations.push({
        iteration: i + 1,
        plan: planResult.plan,
        executionResults,
        interpretation,
      })

      emitEvent({
        type: 'interpretation_completed',
        iteration: i + 1,
        shouldContinue: interpretation.shouldContinue,
      } as WorkflowAiStreamEvent)

      if (!interpretation.shouldContinue) break

      // 准备下一轮请求
      currentRequest = buildNextIterationRequest(
        currentRequest,
        planResult.plan.summary,
        executionResults,
        interpretation,
      )
    } else {
      // 不自动执行，直接结束
      iterations.push({
        iteration: i + 1,
        plan: planResult.plan,
        executionResults: [],
        interpretation: null,
      })
      break
    }
  }

  // Phase 5: 结论生成
  let conclusion = null
  if (mergedConfig.generateConclusion && iterations.length > 0) {
    conclusion = await runConclusionPhase(
      request.prompt,
      iterations,
      request.profile,
      emitEvent,
    )
  }

  const totalDurationMs = Date.now() - startedAt

  emitEvent({
    type: 'loop_completed',
    totalIterations: iterations.length,
    totalDurationMs,
  } as WorkflowAiStreamEvent)

  return {
    iterations,
    conclusion,
    totalDurationMs,
    totalIterations: iterations.length,
  }
}
