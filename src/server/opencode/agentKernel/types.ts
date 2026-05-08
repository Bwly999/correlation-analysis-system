import type { WorkflowAiPlanRequest } from '../../../ai/types.js'

export type AgentKernelAutonomy = 'chat' | 'assist' | 'agentic' | 'review'

export type AgentKernelIntentKind =
  | 'chat'
  | 'analysis_advice'
  | 'agentic_analysis'
  | 'workflow_repair'
  | 'reporting'

export type AgentKernelIntent = {
  kind: AgentKernelIntentKind
  autonomy: AgentKernelAutonomy
  skillName: string
  requiresToolLoop: boolean
  reason: string
}

export type AgentKernelSkill = {
  name: string
  description: string
  systemPrompt: string
  recommendedTools: string[]
  guardrails: string[]
  exitCriteria: string[]
}

export type AgentKernelObservation =
  | {
      type: 'assistant_message'
      content: string
    }
  | {
      type: 'tool_result'
      toolName: string
      structuredContent: Record<string, unknown>
    }

export type AgentKernelVerificationStatus =
  | 'continue'
  | 'waiting_user'
  | 'needs_evidence'
  | 'requires_approval'
  | 'completed'
  | 'failed'

export type AgentKernelVerificationResult = {
  status: AgentKernelVerificationStatus
  message: string
}

export type RouteAgentIntentInput = {
  message: string
  request: WorkflowAiPlanRequest
  autonomy: AgentKernelAutonomy
}

export type VerifyAgentKernelProgressInput = {
  intentKind: AgentKernelIntentKind
  autonomy: AgentKernelAutonomy
  request: WorkflowAiPlanRequest
  observations: AgentKernelObservation[]
}
