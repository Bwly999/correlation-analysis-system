import type { WorkflowAiPlan, WorkflowAiPlanRequest, WorkflowAiStreamEvent } from '../../ai/types.js'

export type AgentLoopPhase =
  | 'intent'
  | 'planning'
  | 'executing'
  | 'interpreting'
  | 'concluding'
  | 'completed'
  | 'failed'

export interface AgentLoopConfig {
  maxIterations: number
  autoExecute: boolean
  generateConclusion: boolean
}

export const DEFAULT_AGENT_LOOP_CONFIG: AgentLoopConfig = {
  maxIterations: 3,
  autoExecute: true,
  generateConclusion: true,
}

export interface AgentLoopIteration {
  iteration: number
  plan: WorkflowAiPlan
  executionResults: AgentExecutionResult[]
  interpretation: AgentInterpretationResult | null
}

export interface AgentExecutionResult {
  nodeId: string
  nodeLabel: string
  nodeType: string
  success: boolean
  resultKind: string | null
  resultSummary: string
  rowCount?: number
  sampleRows?: Record<string, unknown>[]
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

export interface AgentLoopOutput {
  iterations: AgentLoopIteration[]
  conclusion: AgentConclusion | null
  totalDurationMs: number
  totalIterations: number
}

export interface AgentLoopRequest {
  sessionRequest: WorkflowAiPlanRequest
  config: AgentLoopConfig
}

export type AgentLoopStreamEmitter = (event: WorkflowAiStreamEvent) => void
