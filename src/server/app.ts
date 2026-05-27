import { createServerDependencies, type CreateServerDependenciesOptions } from './bootstrap/serverDependencies.js'
import { createJwtAuthGuard, type JwtAuthGuard } from './auth/jwtAuth.js'
import { createHttpHandler } from './http/handler.js'
import { createAnalysisRoutes } from './modules/analysisRoutes.js'
import { createJsTransformAgentRoutes } from './modules/jsTransformAgentRoutes.js'
import { createStorageRoutes } from './modules/storageRoutes.js'
import { createPiAgentRoutes } from './modules/piAgentRoutes.js'

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
    resolveRequestUser: dependencies.resolveStorageUser,
    authGuard: authGuard ?? createJwtAuthGuard(),
    domains: [
      createJsTransformAgentRoutes(),
      createPiAgentRoutes(),
      createStorageRoutes(),
      createAnalysisRoutes(),
    ],
  })
}
