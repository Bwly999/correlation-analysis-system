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

export type WorkflowAiStreamEvent =
  | {
      type: 'started'
      message?: string
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
      diagnostics: WorkflowAiGenerationDiagnostics
    }
  | {
      type: 'failed'
      message: string
      diagnostics?: WorkflowAiGenerationDiagnostics
    }

export interface WorkflowAiPlanRequest {
  mode: WorkflowAiPlanMode
  prompt: string
  workflowSnapshot?: {
    name: string
    nodes: unknown[]
    edges: unknown[]
  }
  profile: WorkflowAiModelProfile
  nodeCatalog: WorkflowAiNodeCatalogItem[]
}
