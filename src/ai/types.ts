import type { AiDraftGraph } from './draft/types.js'

export type WorkflowAiPlanMode = 'create' | 'edit'

export interface WorkflowAiNodeCatalogItem {
  name: string
  displayName: string
  category: string
  description: string
  inputMode: 'single' | 'multiple'
  minInputs: number
  maxInputs: number | null
  allowedNextCategories: string[]
  properties: Array<{
    name: string
    displayName: string
    type: string
    required: boolean
    isRuntimeInput: boolean
    defaultValue: unknown
    description: string
  }>
  help: unknown
  assistantHints: unknown
}

export type WorkflowAiOperation =
  | {
      id: string
      type: 'createNode'
      nodeType: string
      nodeLabel?: string
      position?: { x: number; y: number }
      config?: Record<string, unknown>
    }
  | {
      id: string
      type: 'updateNodeConfig'
      nodeRef: string
      config: Record<string, unknown>
    }
  | {
      id: string
      type: 'renameNode'
      nodeRef: string
      label: string
    }
  | {
      id: string
      type: 'removeNode'
      nodeRef: string
    }
  | {
      id: string
      type: 'connectNodes'
      sourceRef: string
      targetRef: string
      sourceHandle?: string
      targetHandle?: string
    }
  | {
      id: string
      type: 'disconnectEdge'
      edgeRef: string
    }
  | {
      id: string
      type: 'moveNode'
      nodeRef: string
      position: { x: number; y: number }
    }

export interface WorkflowAiPlan {
  summary: string
  assumptions: string[]
  warnings: string[]
  questions?: string[]
  operations: WorkflowAiOperation[]
}

export interface WorkflowAiContextRecipeHint {
  id: string
  name: string
  reason: string
  minimalPattern: string[]
}

export interface WorkflowAiContextSchemaSummary {
  nodeId: string
  nodeLabel: string
  sourceKind?: 'canvas-cache' | 'canvas-ephemeral-run' | 'draft-ephemeral-run'
  resultKind: 'table' | 'tableCollection' | 'json' | 'unknown'
  rowCount?: number
  numericColumns: string[]
  categoricalColumns?: string[]
  datetimeColumns?: string[]
  candidateTargetColumns: string[]
  candidateFeatureColumns: string[]
  blockedReasons: string[]
}

export interface WorkflowAiContextUserAnswer {
  key: string
  value: string
  label?: string
  reason?: string
}

export interface WorkflowAiContextHints {
  recipes?: WorkflowAiContextRecipeHint[]
  schemaSummaries?: WorkflowAiContextSchemaSummary[]
  userAnswers?: WorkflowAiContextUserAnswer[]
}

export interface WorkflowAiDataSourceDescriptor {
  id: string
  kind: 'file' | 'kanban-recording'
  entryNodeType: 'file-import' | 'neighbor-system'
  label: string
  sourceMeta?: Record<string, unknown>
  schemaSummary: WorkflowAiContextSchemaSummary
  bindingPayload: Record<string, unknown>
}

export interface WorkflowAiToolTraceItem {
  id?: string
  toolName: string
  summary: string
  status: 'success' | 'failed'
  startedAt?: number
  finishedAt?: number
  inputSummary?: string
  outputSummary?: string
}

export interface WorkflowAiSelectedRecipe {
  id: string
  name: string
  reason: string
}

export interface WorkflowAiSessionIssue {
  code: string
  message: string
  level: 'info' | 'warn' | 'error'
}

export interface WorkflowAiMissingInfoItem {
  key: string
  label: string
  reason: string
  blocking: boolean
  suggestions?: string[]
}

export interface WorkflowAiSessionState {
  sessionId: string
  mode: WorkflowAiPlanMode
  status: 'idle' | 'running' | 'waiting_user' | 'completed' | 'failed'
  prompt: string
  selectedRecipe?: WorkflowAiSelectedRecipe
  draft: AiDraftGraph
  trace: WorkflowAiToolTraceItem[]
  diagnostics: {
    issues: WorkflowAiSessionIssue[]
    lastFailedTool?: string
  }
  missingInfo: WorkflowAiMissingInfoItem[]
  finalizedPlan?: WorkflowAiPlan
  contextHints?: WorkflowAiContextHints
  updatedAt?: number
}

export type AnalysisAgentPhase =
  | 'intent'
  | 'planning'
  | 'executing'
  | 'interpreting'
  | 'waiting_for_input'
  | 'completed'
  | 'failed'

export type AnalysisAgentExecutionTab = 'execution' | 'result' | 'report'

export interface AnalysisAgentConversationItem {
  id: string
  role: 'user' | 'assistant'
  content: string
}

export interface AnalysisAgentArtifact {
  id: string
  type: 'conclusion_card' | 'report' | 'workflow_summary'
  title: string
  summary: string
  bullets?: string[]
}

export interface AnalysisAgentApprovalRequest {
  key: string
  label: string
  reason: string
  blocking: boolean
}

export interface AnalysisAgentToolCall {
  id: string
  toolName: string
  displayName: string
  status: 'success' | 'failed' | 'running'
  inputSummary?: string
  outputSummary?: string
  summary?: string
  startedAt?: number
  finishedAt?: number
  linkedExecutionRef?: string
}

export interface AnalysisAgentTimelineStep {
  id: string
  title: string
  description?: string
  status: 'idle' | 'running' | 'completed' | 'waiting' | 'failed'
  linkedToolCallIds?: string[]
  linkedExecutionRef?: string
}

export type AnalysisAgentMessageBlock =
  | { type: 'text'; content: string }
  | { type: 'stream'; content: string; status: 'streaming' | 'completed' }
  | { type: 'tool_call'; toolCallId: string }
  | { type: 'thinking'; title: string; summary: string; details: string[]; collapsed: boolean }
  | { type: 'artifact'; artifactId: string }
  | { type: 'approval_request'; requestKey: string }
  | { type: 'step_group'; stepIds: string[] }

export interface AnalysisAgentMessage {
  id: string
  role: 'user' | 'assistant'
  blocks: AnalysisAgentMessageBlock[]
  createdAt: number
}

export interface AnalysisAgentSessionState {
  sessionId: string
  userGoal: string
  phase: AnalysisAgentPhase
  workflowSummary?: string
  conversation: AnalysisAgentConversationItem[]
  messages: AnalysisAgentMessage[]
  timeline: AnalysisAgentTimelineStep[]
  toolCalls: AnalysisAgentToolCall[]
  artifacts: AnalysisAgentArtifact[]
  approvalRequests: AnalysisAgentApprovalRequest[]
  workflowSession: WorkflowAiSessionState
}

export interface AgentProjectionWorkflowState {
  workflowId?: string | null
  workflowName: string
  draftNodeCount: number
  draftEdgeCount: number
  draftSummary: string
  versionCount: number
  latestVersionId?: string | null
  proposedPlan: WorkflowAiPlan | null
}

export interface AgentProjectionAnalysisState {
  goal: string
  summary: string
  candidateTargets: string[]
  candidateFactors: string[]
  methods: string[]
  findings: string[]
  risks: string[]
  recommendations: string[]
}

export interface AgentProjectionExecutionState {
  status: 'idle' | 'running' | 'completed' | 'failed'
  latestAction: string
  toolCalls: AnalysisAgentToolCall[]
  pendingApprovals: AnalysisAgentApprovalRequest[]
  latestToolSummary?: string
  lastFailure?: string
}

export interface AgentProjectionCanvasSyncState {
  status: 'idle' | 'synced' | 'failed'
  message: string
  syncedAt?: number
}

export interface AgentProjectionErrorState {
  message: string
  detail?: string
  occurredAt: number
}

export interface AgentProjectionSnapshot {
  workflow: AgentProjectionWorkflowState
  analysis: AgentProjectionAnalysisState
  execution: AgentProjectionExecutionState
  canvasSync: AgentProjectionCanvasSyncState
  error: AgentProjectionErrorState | null
  updatedAt: number
}

export interface AgentSessionMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  status: 'streaming' | 'completed'
  createdAt: number
}

export interface AgentConversationEntry {
  id: string
  kind:
    | 'user'
    | 'assistant'
    | 'workflow_projection'
    | 'analysis_projection'
    | 'execution_projection'
    | 'canvas_sync'
    | 'debug'
  title: string
  content: string
  details?: string[]
  status?: 'streaming' | 'completed' | 'failed'
}

export interface AgentSessionState {
  id: string
  mode: WorkflowAiPlanMode
  prompt: string
  status: 'idle' | 'running' | 'completed' | 'failed'
  profile: Pick<WorkflowAiModelProfile, 'id' | 'name' | 'model'>
  workflowId?: string | null
  createdAt: number
  updatedAt: number
}

export interface AgentSessionDebugEvent {
  eventType: string
  summary: string
  timestamp: number
  payload?: unknown
}

export interface AgentSessionDebugToolCall {
  toolCallId?: string
  toolName: string
  title?: string
  status: 'started' | 'completed' | 'failed'
  timestamp: number
  payload?: unknown
}

export interface AgentSessionDebugRawMessage {
  messageId: string
  role: string
  parentId?: string
  timestamp: number
  text?: string
  structured?: unknown
  parts: Array<Record<string, unknown>>
  errorName?: string
  errorMessage?: string
}

export interface AgentSessionDebugParseFailure {
  messageId?: string
  reason: string
  timestamp: number
  rawText?: string
  payload?: unknown
}

export interface AgentSessionDebugTrace {
  events: AgentSessionDebugEvent[]
  toolCalls: AgentSessionDebugToolCall[]
  rawMessages: AgentSessionDebugRawMessage[]
  parseFailures: AgentSessionDebugParseFailure[]
}

export type AgentSessionEvent =
  | {
      type: 'session.status.updated'
      session: AgentSessionState
    }
  | {
      type: 'message.delta'
      sessionId: string
      messageId: string
      delta: string
    }
  | {
      type: 'message.completed'
      sessionId: string
      message: AgentSessionMessage
    }
  | {
      type: 'projection.workflow.updated'
      projection: AgentProjectionWorkflowState
    }
  | {
      type: 'projection.analysis.updated'
      projection: AgentProjectionAnalysisState
    }
  | {
      type: 'projection.execution.updated'
      projection: AgentProjectionExecutionState
    }
  | {
      type: 'projection.canvas_sync.updated'
      projection: AgentProjectionCanvasSyncState
    }
  | {
      type: 'projection.error.updated'
      projection: AgentProjectionErrorState
    }
  | {
      type: 'failed'
      message: string
    }

export interface AgentSessionStartResponse {
  session: AgentSessionState
  projection: AgentProjectionSnapshot
}

export interface AgentSessionGetResponse {
  session: AgentSessionState
  projection: AgentProjectionSnapshot
}

export interface AgentSessionMessageRequest {
  content: string
}

export interface AgentSessionMessageResponse {
  session: AgentSessionState
  projection: AgentProjectionSnapshot
  assistantMessage?: AgentSessionMessage
}

export interface AgentSessionCanvasSyncRequest {
  workflowSnapshot: {
    name: string
    nodes: unknown[]
    edges: unknown[]
  }
}

export interface AgentSessionCanvasSyncResponse {
  projection: AgentProjectionSnapshot
  syncSummary: string
}

export type WorkflowAiGenerationStage = 'model_request' | 'parse' | 'normalize' | 'validate' | 'apply'

export interface WorkflowAiGenerationIssue {
  stage: WorkflowAiGenerationStage
  operationId: string
  message: string
}

export interface WorkflowAiPlanValidationIssue extends WorkflowAiGenerationIssue {}

export interface WorkflowAiPlanValidationResult {
  valid: boolean
  issues: WorkflowAiPlanValidationIssue[]
}

export interface WorkflowAiPlanApplyResult {
  applied: boolean
  snapshotId: string
  nodeIdMap: Record<string, string>
}

export interface WorkflowAiEditableSnapshot {
  id: string
  workflowName: string
  workflowId: string | null
  nodes: unknown[]
  edges: unknown[]
}

export interface WorkflowAiModelProfile {
  id: string
  name: string
  baseUrl: string
  model: string
  apiKey?: string
  enabled: boolean
  isDefault?: boolean
  source: 'system' | 'custom'
  capabilities?: {
    create?: boolean
    edit?: boolean
  }
}

export interface WorkflowAiModelTestResult {
  success: boolean
  message: string
  latencyMs?: number
}

export interface WorkflowAiGenerationAttempt {
  attempt: number
  trigger: 'initial' | 'repair'
  status: 'success' | 'failed'
  stage: WorkflowAiGenerationStage
  message?: string
}

export interface WorkflowAiGenerationDiagnostics {
  status: 'success' | 'failed'
  stage: WorkflowAiGenerationStage
  attempts: WorkflowAiGenerationAttempt[]
  issues: WorkflowAiGenerationIssue[]
  rawOutputExcerpt?: string
}

export interface WorkflowAiPlanResponse {
  plan: WorkflowAiPlan
  diagnostics: WorkflowAiGenerationDiagnostics
}

export interface WorkflowAiSessionStartResponse {
  session: WorkflowAiSessionState
}

export interface WorkflowAiSessionGetResponse {
  session: WorkflowAiSessionState
}

export interface WorkflowAiSessionRunResponse {
  plan: WorkflowAiPlan
  draft: AiDraftGraph
  diagnostics: WorkflowAiGenerationDiagnostics
}

export interface WorkflowAiSessionInputRequest {
  answers: Record<string, string>
}

export interface WorkflowAiSessionInputResponse {
  session: WorkflowAiSessionState
}

export interface AgentExecutionResult {
  nodeId: string
  nodeLabel: string
  nodeType: string
  success: boolean
  resultKind: string | null
  resultSummary: string
  result?: unknown
  rowCount?: number
  sampleRows?: Record<string, unknown>[]
  error?: string
}

export interface AgentExecutionFinalResult {
  nodeId: string
  nodeLabel: string
  resultKind: string
  result: unknown
}

export interface AgentExecutionRecord {
  executionId: string
  planSummary: string
  status: 'completed' | 'failed'
  bindings: Record<string, string>
  nodeResults: AgentExecutionResult[]
  finalResults: AgentExecutionFinalResult[]
  createdAt: number
  error?: string
}

export interface AgentInterpretationResult {
  text: string
  shouldContinue: boolean
  continueReason?: string
}

export interface AgentConclusion {
  summary: string
  findings: string[]
  recommendations: string[]
  caveats: string[]
}

export interface AgentLoopIteration {
  iteration: number
  plan: WorkflowAiPlan
  executionResults: AgentExecutionResult[]
  interpretation: AgentInterpretationResult | null
}

export interface AgentLoopOutput {
  iterations: AgentLoopIteration[]
  conclusion: AgentConclusion | null
  totalDurationMs: number
  totalIterations: number
}

export type WorkflowAiStreamEvent =
  | {
      type: 'started'
      sessionId?: string
      message?: string
    }
  | {
      type: 'recipe_selected'
      recipeId: string
      recipeName: string
      reason: string
    }
  | {
      type: 'tool_started'
      toolName: string
      traceId: string
      summary: string
    }
  | {
      type: 'tool_completed'
      toolName: string
      traceId: string
      summary: string
    }
  | {
      type: 'draft_updated'
      draft: AiDraftGraph
    }
  | {
      type: 'missing_info'
      items: WorkflowAiMissingInfoItem[]
    }
  | {
      type: 'attempt_started'
      attempt: number
      trigger: 'initial' | 'repair'
      message?: string
    }
  | {
      type: 'stage_changed'
      stage: WorkflowAiGenerationStage
      attempt: number
      message?: string
    }
  | {
      type: 'text_delta'
      attempt: number
      delta: string
    }
  | {
      type: 'diagnostic'
      diagnostics: WorkflowAiGenerationDiagnostics
      message?: string
    }
  | {
      type: 'completed'
      plan: WorkflowAiPlan
      draft?: AiDraftGraph
      diagnostics: WorkflowAiGenerationDiagnostics
    }
  | {
      type: 'failed'
      message: string
      diagnostics?: WorkflowAiGenerationDiagnostics
    }
  | {
      type: 'loop_started'
      maxIterations: number
    }
  | {
      type: 'loop_iteration_started'
      iteration: number
    }
  | {
      type: 'node_execution_started'
      nodeId: string
      nodeLabel: string
    }
  | {
      type: 'node_execution_completed'
      nodeId: string
      nodeLabel: string
      summary: string
    }
  | {
      type: 'node_execution_failed'
      nodeId: string
      nodeLabel: string
      summary: string
    }
  | {
      type: 'interpretation_delta'
      iteration: number
      delta: string
    }
  | {
      type: 'interpretation_completed'
      iteration: number
      shouldContinue: boolean
    }
  | {
      type: 'loop_iteration_completed'
      iteration: number
      plan: WorkflowAiPlan
      executionResults: AgentExecutionResult[]
      interpretation: AgentInterpretationResult | null
    }
  | {
      type: 'conclusion_started'
    }
  | {
      type: 'conclusion_delta'
      delta: string
    }
  | {
      type: 'conclusion_completed'
      conclusion: {
        summary: string
        findings: string[]
        recommendations: string[]
        caveats: string[]
      }
    }
  | {
      type: 'loop_completed'
      totalIterations: number
      totalDurationMs: number
      output?: AgentLoopOutput
    }

export interface WorkflowAiPlanRequest {
  mode: WorkflowAiPlanMode
  prompt: string
  workflowSnapshot?: {
    name: string
    nodes: unknown[]
    edges: unknown[]
  }
  contextHints?: WorkflowAiContextHints
  dataSources?: WorkflowAiDataSourceDescriptor[]
  profile: WorkflowAiModelProfile
  nodeCatalog: WorkflowAiNodeCatalogItem[]
}
