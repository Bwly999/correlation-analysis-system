import type { WorkflowAiPlanRequest } from '../../../ai/types.js'

export const hasAnalysisContext = (request: WorkflowAiPlanRequest) =>
  Boolean(request.dataSources?.length)
  || Boolean(request.contextHints?.schemaSummaries?.length)

export const shouldAskForDataSource = (request: WorkflowAiPlanRequest) => !hasAnalysisContext(request)
