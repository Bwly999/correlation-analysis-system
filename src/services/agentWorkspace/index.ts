import type {
  AgentLoopOutput,
  WorkflowAiPlanRequest,
  WorkflowAiSessionInputRequest,
  WorkflowAiModelProfile,
  WorkflowAiModelTestResult,
} from '@/ai/types'
import {
  WorkflowAiRequestError,
  fetchSystemModelProfiles as fetchSystemModelProfilesFromWorkflowAi,
  requestWorkflowAiPlan as requestWorkflowAiPlanFromWorkflowAi,
  runAnalysisAgentLoop as runAnalysisAgentLoopFromWorkflowAi,
  runWorkflowAiSession as runWorkflowAiSessionFromWorkflowAi,
  startWorkflowAiSession as startWorkflowAiSessionFromWorkflowAi,
  streamWorkflowAiPlan as streamWorkflowAiPlanFromWorkflowAi,
  submitWorkflowAiSessionInput as submitWorkflowAiSessionInputFromWorkflowAi,
  testWorkflowAiModelProfile as testWorkflowAiModelProfileFromWorkflowAi,
} from '@/services/workflowAi'

export { WorkflowAiRequestError }
export type { AgentLoopConfig, AgentLoopOutput } from '@/services/workflowAi'

export const requestWorkflowAiPlan = (request: WorkflowAiPlanRequest) =>
  requestWorkflowAiPlanFromWorkflowAi(request)

export const streamWorkflowAiPlan = (
  request: WorkflowAiPlanRequest,
  options?: Parameters<typeof streamWorkflowAiPlanFromWorkflowAi>[1],
) => streamWorkflowAiPlanFromWorkflowAi(request, options)

export const startWorkflowAiSession = (request: WorkflowAiPlanRequest) =>
  startWorkflowAiSessionFromWorkflowAi(request)

export const runWorkflowAiSession = (
  sessionId: string,
  options?: Parameters<typeof runWorkflowAiSessionFromWorkflowAi>[1],
) => runWorkflowAiSessionFromWorkflowAi(sessionId, options)

export const submitWorkflowAiSessionInput = (
  sessionId: string,
  request: WorkflowAiSessionInputRequest,
) => submitWorkflowAiSessionInputFromWorkflowAi(sessionId, request)

export const fetchSystemModelProfiles = (): Promise<WorkflowAiModelProfile[]> =>
  fetchSystemModelProfilesFromWorkflowAi()

export const testWorkflowAiModelProfile = (
  profile: WorkflowAiModelProfile,
): Promise<WorkflowAiModelTestResult> => testWorkflowAiModelProfileFromWorkflowAi(profile)

export const runAnalysisAgentLoop = (
  sessionId: string,
  config?: Parameters<typeof runAnalysisAgentLoopFromWorkflowAi>[1],
  options?: Parameters<typeof runAnalysisAgentLoopFromWorkflowAi>[2],
): Promise<AgentLoopOutput> => runAnalysisAgentLoopFromWorkflowAi(sessionId, config, options)
