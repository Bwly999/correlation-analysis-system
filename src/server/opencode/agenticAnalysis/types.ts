export type AgenticAnalysisStage =
  | 'intent'
  | 'data_profile'
  | 'method_planning'
  | 'workflow_build'
  | 'workflow_validation'
  | 'execution'
  | 'debugging'
  | 'interpretation'
  | 'reporting'
  | 'waiting_user'
  | 'completed'
  | 'failed'

export type AgenticAnalysisStageHistoryItem = {
  stage: AgenticAnalysisStage
  status: 'started' | 'completed' | 'failed'
  message: string
  at: number
}

export interface AgenticAnalysisRunState {
  runId: string
  sessionId: string
  stage: AgenticAnalysisStage
  goal: string
  iteration: number
  maxIterations: number
  startedAt: number
  updatedAt: number
  workflowId?: string | null
  latestExecutionId?: string | null
  stageHistory: AgenticAnalysisStageHistoryItem[]
}

export const AGENTIC_ANALYSIS_STAGE_ORDER = [
  'intent',
  'data_profile',
  'method_planning',
  'workflow_build',
  'workflow_validation',
  'execution',
  'debugging',
  'interpretation',
  'reporting',
  'completed',
] as const satisfies AgenticAnalysisStage[]

export const getNextAgenticStage = (stage: AgenticAnalysisStage): AgenticAnalysisStage | null => {
  const index = AGENTIC_ANALYSIS_STAGE_ORDER.indexOf(stage as typeof AGENTIC_ANALYSIS_STAGE_ORDER[number])
  if (index < 0) return null
  return AGENTIC_ANALYSIS_STAGE_ORDER[index + 1] ?? null
}

export const createAgenticRunState = (input: {
  runId: string
  sessionId: string
  goal: string
  now?: number
  maxIterations?: number
}): AgenticAnalysisRunState => {
  const now = input.now ?? Date.now()
  return {
    runId: input.runId,
    sessionId: input.sessionId,
    stage: 'intent',
    goal: input.goal,
    iteration: 0,
    maxIterations: input.maxIterations ?? 3,
    startedAt: now,
    updatedAt: now,
    workflowId: null,
    latestExecutionId: null,
    stageHistory: [],
  }
}

const appendStageHistory = (
  run: AgenticAnalysisRunState,
  item: AgenticAnalysisStageHistoryItem,
): AgenticAnalysisRunState => ({
  ...run,
  updatedAt: item.at,
  stageHistory: [...run.stageHistory, item],
})

export const startAgenticStage = (
  run: AgenticAnalysisRunState,
  stage: AgenticAnalysisStage,
  message: string,
  now = Date.now(),
): AgenticAnalysisRunState =>
  appendStageHistory(
    {
      ...run,
      stage,
      iteration: stage === 'workflow_build' ? run.iteration + 1 : run.iteration,
    },
    {
      stage,
      status: 'started',
      message,
      at: now,
    },
  )

export const completeAgenticStage = (
  run: AgenticAnalysisRunState,
  message: string,
  now = Date.now(),
): AgenticAnalysisRunState =>
  appendStageHistory(run, {
    stage: run.stage,
    status: 'completed',
    message,
    at: now,
  })

export const failAgenticStage = (
  run: AgenticAnalysisRunState,
  message: string,
  now = Date.now(),
): AgenticAnalysisRunState =>
  appendStageHistory(
    {
      ...run,
      stage: 'failed',
    },
    {
      stage: run.stage,
      status: 'failed',
      message,
      at: now,
    },
  )
