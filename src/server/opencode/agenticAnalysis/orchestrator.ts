import { randomUUID } from 'node:crypto'
import type { AgentSessionEvent, WorkflowAiPlanRequest } from '../../../ai/types.js'
import { shouldAskForDataSource } from './checkpoints.js'
import { createRepairPlan, type AgenticRepairPlan } from './repairPlanner.js'
import {
  AGENTIC_ANALYSIS_STAGE_ORDER,
  completeAgenticStage,
  createAgenticRunState,
  startAgenticStage,
  type AgenticAnalysisRunState,
  type AgenticAnalysisStage,
} from './types.js'

export type RunAgenticAnalysisInput = {
  sessionId: string
  message: string
  request: WorkflowAiPlanRequest
  emitEvent?: (event: AgentSessionEvent) => void
  now?: () => number
  stageRunner?: (stage: AgenticAnalysisStage, run: AgenticAnalysisRunState) => Promise<AgenticStageRunResult>
}

export type RunAgenticAnalysisOutput = {
  run: AgenticAnalysisRunState
  repairPlan?: AgenticRepairPlan
}

export type AgenticStageRunResult =
  | { ok: true }
  | {
      ok: false
      failedNodeId: string
      nodeType: string
      error: string
      upstreamTrace?: unknown[]
    }

const publishStageEvent = (
  run: AgenticAnalysisRunState,
  message: string,
  emitEvent?: (event: AgentSessionEvent) => void,
) => {
  emitEvent?.({
    type: 'agentic.stage.updated',
    run: {
      runId: run.runId,
      stage: run.stage,
      message,
      iteration: run.iteration,
    },
  } as AgentSessionEvent)
}

const runStage = (
  run: AgenticAnalysisRunState,
  stage: AgenticAnalysisStage,
  message: string,
  now: () => number,
  emitEvent?: (event: AgentSessionEvent) => void,
) => {
  const started = startAgenticStage(run, stage, message, now())
  publishStageEvent(started, message, emitEvent)
  const completed = completeAgenticStage(started, `${message}完成`, now())
  publishStageEvent(completed, `${message}完成`, emitEvent)
  return completed
}

const runStageWithOptionalRunner = async (
  run: AgenticAnalysisRunState,
  stage: AgenticAnalysisStage,
  message: string,
  now: () => number,
  emitEvent?: (event: AgentSessionEvent) => void,
  stageRunner?: RunAgenticAnalysisInput['stageRunner'],
) => {
  const started = startAgenticStage(run, stage, message, now())
  publishStageEvent(started, message, emitEvent)
  const result = stageRunner ? await stageRunner(stage, started) : { ok: true as const }
  if (!result.ok) {
    return {
      run: started,
      result,
    }
  }

  const completed = completeAgenticStage(started, `${message}完成`, now())
  publishStageEvent(completed, `${message}完成`, emitEvent)
  return {
    run: completed,
    result,
  }
}

export const runAgenticAnalysis = async (
  input: RunAgenticAnalysisInput,
): Promise<RunAgenticAnalysisOutput> => {
  const now = input.now ?? Date.now
  let run = createAgenticRunState({
    runId: `agentic_${randomUUID()}`,
    sessionId: input.sessionId,
    goal: input.message || input.request.prompt,
    now: now(),
  })

  if (shouldAskForDataSource(input.request)) {
    run = startAgenticStage(run, 'waiting_user', '需要先提供可分析的数据源或字段摘要', now())
    publishStageEvent(run, '需要先提供可分析的数据源或字段摘要', input.emitEvent)
    return { run }
  }

  const stageMessages: Record<Exclude<typeof AGENTIC_ANALYSIS_STAGE_ORDER[number], 'completed'>, string> = {
    intent: '理解分析目标',
    data_profile: '生成数据画像',
    method_planning: '规划分析方法',
    workflow_build: '搭建分析工作流',
    workflow_validation: '校验工作流结构',
    execution: '执行分析工作流',
    debugging: '调试执行问题',
    interpretation: '解释分析结果',
    reporting: '生成分析报告',
  }

  for (const stage of AGENTIC_ANALYSIS_STAGE_ORDER) {
    if (stage === 'completed') {
      run = runStage(run, stage, 'Agentic 分析已完成', now, input.emitEvent)
      break
    }

    if (stage === 'debugging') {
      continue
    }

    const stageResult = await runStageWithOptionalRunner(
      run,
      stage,
      stageMessages[stage],
      now,
      input.emitEvent,
      input.stageRunner,
    )
    run = stageResult.run

    if (!stageResult.result.ok) {
      run = startAgenticStage(run, 'debugging', '正在根据失败节点生成修复计划', now())
      publishStageEvent(run, '正在根据失败节点生成修复计划', input.emitEvent)
      const repairPlan = createRepairPlan({
        failedNodeId: stageResult.result.failedNodeId,
        nodeType: stageResult.result.nodeType,
        error: stageResult.result.error,
        upstreamTrace: stageResult.result.upstreamTrace,
      })
      return {
        run,
        repairPlan,
      }
    }
  }

  return { run }
}
