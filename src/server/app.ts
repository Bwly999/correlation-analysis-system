import { createServerDependencies, type CreateServerDependenciesOptions } from './bootstrap/serverDependencies.js'
import { createHttpHandler } from './http/handler.js'
import { createAgentRoutes } from './modules/agentRoutes.js'
import { createAnalysisRoutes } from './modules/analysisRoutes.js'
import { createStorageRoutes } from './modules/storageRoutes.js'
import { createWorkflowAiRoutes } from './modules/workflowAiRoutes.js'
import { createWorkflowMcpRoutes } from './modules/workflowMcpRoutes.js'

export type { ServerDependencies } from './bootstrap/serverDependencies.js'
export { createServerDependencies } from './bootstrap/serverDependencies.js'

export const createServerHandler = (
  options: CreateServerDependenciesOptions = {},
) => {
  const dependencies = createServerDependencies(options)
  return createHttpHandler({
    dependencies,
    domains: [
      createWorkflowMcpRoutes(),
      createAgentRoutes(),
      createStorageRoutes(),
      createAnalysisRoutes(),
      createWorkflowAiRoutes(),
    ],
  })
}
