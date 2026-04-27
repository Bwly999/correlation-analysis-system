import { createServerDependencies, type CreateServerDependenciesOptions } from './bootstrap/serverDependencies.js'
import { createJwtAuthGuard, type JwtAuthGuard } from './auth/jwtAuth.js'
import { createHttpHandler } from './http/handler.js'
import { createAgentRoutes } from './modules/agentRoutes.js'
import { createAnalysisRoutes } from './modules/analysisRoutes.js'
import { createStorageRoutes } from './modules/storageRoutes.js'
import { createWorkflowAiRoutes } from './modules/workflowAiRoutes.js'
import { createWorkflowMcpRoutes } from './modules/workflowMcpRoutes.js'

export type { ServerDependencies } from './bootstrap/serverDependencies.js'
export { createServerDependencies } from './bootstrap/serverDependencies.js'

export interface CreateServerHandlerOptions extends CreateServerDependenciesOptions {
  authGuard?: JwtAuthGuard
}

export const createServerHandler = (
  options: CreateServerHandlerOptions = {},
) => {
  const { authGuard, ...dependencyOptions } = options
  const dependencies = createServerDependencies(dependencyOptions)
  return createHttpHandler({
    dependencies,
    authGuard: authGuard ?? createJwtAuthGuard(),
    domains: [
      createWorkflowMcpRoutes(),
      createAgentRoutes(),
      createStorageRoutes(),
      createAnalysisRoutes(),
      createWorkflowAiRoutes(),
    ],
  })
}
