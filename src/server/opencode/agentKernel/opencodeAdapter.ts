import type { AgentKernelIntent, AgentKernelObservation, AgentKernelSkill } from './types.js'
import type { WorkflowAiPlanRequest } from '../../../ai/types.js'
import type { AgentKernelVerificationResult } from './types.js'

export type AgentKernelRuntimePromptInput = {
  sessionId: string
  message: string
  request: WorkflowAiPlanRequest
  intent: AgentKernelIntent
  skill: AgentKernelSkill
  iteration?: number
  previousObservations?: AgentKernelObservation[]
  verification?: AgentKernelVerificationResult
}

export type AgentKernelRuntimePromptOutput = {
  observations: AgentKernelObservation[]
}

export type AgentKernelRuntimeAdapter = {
  runPrompt(input: AgentKernelRuntimePromptInput): Promise<AgentKernelRuntimePromptOutput>
}

export const createNoopAgentKernelAdapter = (): AgentKernelRuntimeAdapter => ({
  async runPrompt() {
    return {
      observations: [],
    }
  },
})
