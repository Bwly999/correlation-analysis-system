import type { WorkflowAiPlanRequest } from '../../../ai/types.js'

export const hasAgentKernelDataContext = (request: WorkflowAiPlanRequest) =>
  Boolean(request.dataSources?.length)
  || Boolean(request.contextHints?.schemaSummaries?.length)

export const shouldAgentKernelAskForDataSource = (request: WorkflowAiPlanRequest) =>
  !hasAgentKernelDataContext(request)
