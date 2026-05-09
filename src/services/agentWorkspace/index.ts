import type {
  AgentObservabilityDebugFilesResponse,
  AgentObservabilityDebugHealth,
  AgentObservabilityDebugReplayResponse,
  AgentObservabilityDebugTraceResponse,
  AgentSessionCanvasSyncRequest,
  AgentSessionCanvasSyncResponse,
  AgentSessionEvent,
  AgentSessionGetResponse,
  AgentSessionMessageRequest,
  AgentSessionMessageResponse,
  AgentSessionStartResponse,
  AgentProjectionSnapshot,
  WorkflowAiPlanRequest,
  WorkflowAiSessionInputRequest,
  WorkflowAiModelProfile,
  WorkflowAiModelTestResult,
} from '@/ai/types'
import {
  WorkflowAiRequestError,
  fetchSystemModelProfiles as fetchSystemModelProfilesFromWorkflowAi,
  createAgentSession as createAgentSessionFromWorkflowAi,
  getAgentObservabilityDebugFiles as getAgentObservabilityDebugFilesFromWorkflowAi,
  getAgentObservabilityDebugHealth as getAgentObservabilityDebugHealthFromWorkflowAi,
  getAgentObservabilityDebugReplay as getAgentObservabilityDebugReplayFromWorkflowAi,
  getAgentObservabilityDebugTrace as getAgentObservabilityDebugTraceFromWorkflowAi,
  getAgentProjection as getAgentProjectionFromWorkflowAi,
  getAgentSession as getAgentSessionFromWorkflowAi,
  requestWorkflowAiPlan as requestWorkflowAiPlanFromWorkflowAi,
  runAgenticAnalysisSession as runAgenticAnalysisSessionFromWorkflowAi,
  runWorkflowAiSession as runWorkflowAiSessionFromWorkflowAi,
  sendAgentSessionMessage as sendAgentSessionMessageFromWorkflowAi,
  streamAgentSessionEvents as streamAgentSessionEventsFromWorkflowAi,
  startWorkflowAiSession as startWorkflowAiSessionFromWorkflowAi,
  streamWorkflowAiPlan as streamWorkflowAiPlanFromWorkflowAi,
  submitWorkflowAiSessionInput as submitWorkflowAiSessionInputFromWorkflowAi,
  syncAgentCanvas as syncAgentCanvasFromWorkflowAi,
  testWorkflowAiModelProfile as testWorkflowAiModelProfileFromWorkflowAi,
} from '@/services/workflowAi'

export { WorkflowAiRequestError }
export type {
  AgentObservabilityDebugFilesResponse,
  AgentObservabilityDebugHealth,
  AgentObservabilityDebugReplayResponse,
  AgentObservabilityDebugTraceResponse,
  AgentSessionCanvasSyncRequest,
  AgentSessionCanvasSyncResponse,
  AgentSessionEvent,
  AgentSessionGetResponse,
  AgentSessionMessageRequest,
  AgentSessionMessageResponse,
  AgentSessionStartResponse,
  AgentProjectionSnapshot,
}

export const requestWorkflowAiPlan = (request: WorkflowAiPlanRequest) =>
  requestWorkflowAiPlanFromWorkflowAi(request)

export const streamWorkflowAiPlan = (
  request: WorkflowAiPlanRequest,
  options?: Parameters<typeof streamWorkflowAiPlanFromWorkflowAi>[1],
) => streamWorkflowAiPlanFromWorkflowAi(request, options)

export const startWorkflowAiSession = (request: WorkflowAiPlanRequest) =>
  startWorkflowAiSessionFromWorkflowAi(request)

export const createAgentSession = (request: WorkflowAiPlanRequest): Promise<AgentSessionStartResponse> =>
  createAgentSessionFromWorkflowAi(request)

export const getAgentSession = (sessionId: string): Promise<AgentSessionGetResponse> =>
  getAgentSessionFromWorkflowAi(sessionId)

export const sendAgentSessionMessage = (
  sessionId: string,
  request: AgentSessionMessageRequest,
): Promise<AgentSessionMessageResponse> => sendAgentSessionMessageFromWorkflowAi(sessionId, request)

export const runAgenticAnalysisSession = (
  sessionId: string,
  request: AgentSessionMessageRequest,
): Promise<AgentSessionMessageResponse> => runAgenticAnalysisSessionFromWorkflowAi(sessionId, request)

export const streamAgentSessionEvents = (
  sessionId: string,
  options?: Parameters<typeof streamAgentSessionEventsFromWorkflowAi>[1],
) => streamAgentSessionEventsFromWorkflowAi(sessionId, options)

export const getAgentProjection = (sessionId: string): Promise<AgentProjectionSnapshot> =>
  getAgentProjectionFromWorkflowAi(sessionId)

export const getAgentObservabilityDebugTrace = (
  sessionId: string,
  options?: { limit?: number, offset?: number },
): Promise<AgentObservabilityDebugTraceResponse> =>
  getAgentObservabilityDebugTraceFromWorkflowAi(sessionId, options)

export const getAgentObservabilityDebugReplay = (
  sessionId: string,
  seq?: number,
): Promise<AgentObservabilityDebugReplayResponse> =>
  getAgentObservabilityDebugReplayFromWorkflowAi(sessionId, seq)

export const getAgentObservabilityDebugFiles = (
  sessionId: string,
): Promise<AgentObservabilityDebugFilesResponse> =>
  getAgentObservabilityDebugFilesFromWorkflowAi(sessionId)

export const getAgentObservabilityDebugHealth = (): Promise<AgentObservabilityDebugHealth> =>
  getAgentObservabilityDebugHealthFromWorkflowAi()

export const syncAgentCanvas = (
  sessionId: string,
  request: AgentSessionCanvasSyncRequest,
): Promise<AgentSessionCanvasSyncResponse> => syncAgentCanvasFromWorkflowAi(sessionId, request)

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
