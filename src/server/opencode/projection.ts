import type {
  AgentProjectionErrorState,
  AgentProjectionSnapshot,
  AnalysisAgentApprovalRequest,
  AnalysisAgentToolCall,
  WorkflowAiPlan,
  WorkflowAiPlanRequest,
} from '../../ai/types.js'

export type AgentStructuredResponse = {
  assistantMessage?: string | null
  workflowSummary?: string | null
  findings: string[]
  methods: string[]
  risks: string[]
  recommendations: string[]
  workflowPlan?: WorkflowAiPlan | null
}

const dedupe = (items: string[]) => [...new Set(items.filter(Boolean))]

export const resolveAssistantMessageText = (response: AgentStructuredResponse) =>
  response.assistantMessage?.trim()
  || response.workflowSummary?.trim()
  || response.workflowPlan?.summary?.trim()
  || '本轮分析已完成'

export const resolveWorkflowSummaryText = (response: AgentStructuredResponse) =>
  response.workflowSummary?.trim()
  || response.workflowPlan?.summary?.trim()
  || resolveAssistantMessageText(response)

const buildInitialToolCalls = (): AnalysisAgentToolCall[] => []

const buildInitialApprovalRequests = (): AnalysisAgentApprovalRequest[] => []

export const buildInitialProjection = (request: WorkflowAiPlanRequest): AgentProjectionSnapshot => {
  const schemaSummaries = request.contextHints?.schemaSummaries ?? []
  const candidateTargets = dedupe(schemaSummaries.flatMap((item) => item.candidateTargetColumns))
  const candidateFactors = dedupe(schemaSummaries.flatMap((item) => item.candidateFeatureColumns))

  return {
    workflow: {
      workflowId: null,
      workflowName: request.workflowSnapshot?.name || '未命名分析流程',
      draftNodeCount: request.workflowSnapshot?.nodes.length ?? 0,
      draftEdgeCount: request.workflowSnapshot?.edges.length ?? 0,
      draftSummary: request.mode === 'edit' ? '已载入当前画布，等待开始分析。' : '将创建新的分析流程草案。',
      versionCount: 0,
      latestVersionId: null,
      proposedPlan: null,
    },
    analysis: {
      goal: request.prompt,
      summary: '系统已记录当前分析目标，等待模型开始处理。',
      candidateTargets,
      candidateFactors,
      methods: [],
      findings: [],
      risks: [],
      recommendations: [],
    },
    execution: {
      status: 'idle',
      latestAction: '等待用户发送分析指令',
      toolCalls: buildInitialToolCalls(),
      pendingApprovals: buildInitialApprovalRequests(),
      latestToolSummary: '',
    },
    canvasSync: {
      status: 'idle',
      message: '当前草案尚未同步到画布',
    },
    error: null,
    updatedAt: Date.now(),
  }
}

export const applyStructuredResponseToProjection = (
  projection: AgentProjectionSnapshot,
  response: AgentStructuredResponse,
): AgentProjectionSnapshot => {
  const assistantMessage = resolveAssistantMessageText(response)
  const workflowSummary = resolveWorkflowSummaryText(response)

  return {
    ...projection,
    workflow: {
      ...projection.workflow,
      draftSummary: workflowSummary,
      proposedPlan: response.workflowPlan ?? null,
    },
    analysis: {
      ...projection.analysis,
      summary: assistantMessage,
      findings: response.findings,
      methods: response.methods,
      risks: response.risks,
      recommendations: response.recommendations,
    },
    execution: {
      ...projection.execution,
      status: 'completed',
      latestAction: '本轮分析已完成',
    },
    error: projection.error,
    updatedAt: Date.now(),
  }
}

export const applyExecutionState = (
  projection: AgentProjectionSnapshot,
  status: AgentProjectionSnapshot['execution']['status'],
  latestAction: string,
  toolCalls?: AnalysisAgentToolCall[],
): AgentProjectionSnapshot => ({
  ...projection,
  execution: {
    ...projection.execution,
    status,
    latestAction,
    toolCalls: toolCalls ?? projection.execution.toolCalls,
  },
  updatedAt: Date.now(),
})

export const applyToolCallState = (
  projection: AgentProjectionSnapshot,
  toolCall: AnalysisAgentToolCall,
): AgentProjectionSnapshot => {
  const existingIndex = projection.execution.toolCalls.findIndex((item) => item.id === toolCall.id)
  const toolCalls = [...projection.execution.toolCalls]

  if (existingIndex >= 0) {
    toolCalls.splice(existingIndex, 1, {
      ...toolCalls[existingIndex],
      ...toolCall,
    })
  } else {
    toolCalls.push(toolCall)
  }

  return {
    ...projection,
    execution: {
      ...projection.execution,
      toolCalls,
      latestToolSummary: toolCall.summary ?? toolCall.outputSummary ?? toolCall.inputSummary ?? '',
    },
    updatedAt: Date.now(),
  }
}

export const applyProjectionError = (
  projection: AgentProjectionSnapshot,
  message: string,
  detail?: string,
): AgentProjectionSnapshot => ({
  ...projection,
  execution: {
    ...projection.execution,
    status: projection.execution.status === 'completed' ? 'completed' : 'failed',
    lastFailure: message,
  },
  error: {
    message,
    detail,
    occurredAt: Date.now(),
  } satisfies AgentProjectionErrorState,
  updatedAt: Date.now(),
})

export const applyCanvasSyncState = (
  projection: AgentProjectionSnapshot,
  input: {
    status: 'synced' | 'failed'
    message: string
  },
): AgentProjectionSnapshot => ({
  ...projection,
  canvasSync: {
    status: input.status,
    message: input.message,
    syncedAt: Date.now(),
  },
  updatedAt: Date.now(),
})
