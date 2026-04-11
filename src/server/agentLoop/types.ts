import type {
  WorkflowAiPlanRequest,
  WorkflowAiStreamEvent,
} from '../../ai/types.js'

export type {
  AgentConclusion,
  AgentExecutionResult,
  AgentInterpretationResult,
  AgentLoopIteration,
  AgentLoopOutput,
} from '../../ai/types.js'

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

export interface AgentLoopRequest {
  sessionRequest: WorkflowAiPlanRequest
  config: AgentLoopConfig
}

export type AgentLoopStreamEmitter = (event: WorkflowAiStreamEvent) => void
