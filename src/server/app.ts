import Fastify from 'fastify'
import cors from '@fastify/cors'
import { randomUUID } from 'node:crypto'
import { createServerDependencies, type CreateServerDependenciesOptions } from './bootstrap/serverDependencies.js'
import { createJwtAuthGuard, type JwtAuthGuard } from './auth/jwtAuth.js'
import './http/fastify.js'
import { isMissingWorkflowUserError } from './http/workflowUser.js'
import { createServerLogger } from './logging/serverLogger.js'
import { createAnalysisRoutes } from './modules/analysisRoutes.js'
import { createJsTransformAgentRoutes } from './modules/jsTransformAgentRoutes.js'
import { createStorageRoutes } from './modules/storageRoutes.js'
import { createPiAgentRoutes } from './modules/piAgentRoutes.js'
import { createNotebookAgentRoutes } from './modules/notebookAgentRoutes.js'
import { registerNotebookHeaders } from './notebookHeadersPlugin.js'
import { registerApiCallTracking } from './http/apiCallTrackingPlugin.js'
import { createApiCallTracker, type ApiCallTracker } from './apiCallTracking/apiCallTracker.js'
import { WORKFLOW_USER_ID_HEADER, WORKFLOW_USER_NAME_HEADER } from './http/workflowHeaders.js'
import { disposeAllPiAgentSessions } from './piAgent/gateway.js'
import { disposeAllJsTransformAgentSessions } from './piAgent/jsTransformAgentGateway.js'

export type { ServerDependencies } from './bootstrap/serverDependencies.js'
export { createServerDependencies } from './bootstrap/serverDependencies.js'

export interface CreateServerAppOptions extends CreateServerDependenciesOptions {
  authGuard?: JwtAuthGuard
  apiCallTracker?: ApiCallTracker
}

const resolveErrorStatusCode = (error: unknown): number =>
  typeof error === 'object' && error !== null && 'statusCode' in error && typeof error.statusCode === 'number'
    ? error.statusCode
    : 500

const resolveErrorDiagnostics = (error: unknown): unknown =>
  typeof error === 'object' && error !== null && 'diagnostics' in error ? error.diagnostics : undefined

const resolveErrorMessage = (error: unknown): string => (error instanceof Error ? error.message : '服务处理失败')

const CORS_ALLOWED_HEADERS = ['Content-Type', 'Authorization', WORKFLOW_USER_ID_HEADER, WORKFLOW_USER_NAME_HEADER]
const CORS_ALLOWED_METHODS = 'GET,POST,OPTIONS'

export const createServerApp = (
  options: CreateServerAppOptions = {},
) => {
  const { authGuard, apiCallTracker, ...dependencyOptions } = options
  const dependencies = createServerDependencies(dependencyOptions)
  const guard = authGuard ?? createJwtAuthGuard()
  const apiTracking = apiCallTracker ?? createApiCallTracker()
  const app = Fastify({
    logger: false,
    bodyLimit: 20 * 1024 * 1024,
    genReqId: (request) =>
      typeof request.headers['x-request-id'] === 'string' ? request.headers['x-request-id'] : randomUUID(),
  })

  app.decorate('serverDependencies', dependencies)
  app.decorateRequest('workflowUser', undefined)

  void app.register(cors, {
    origin: '*',
    allowedHeaders: CORS_ALLOWED_HEADERS,
    methods: ['GET', 'POST', 'OPTIONS'],
    preflight: false,
  })

  app.addHook('onRequest', async (request, reply) => {
    if (request.method !== 'OPTIONS') {
      return
    }

    reply.header('Access-Control-Allow-Origin', '*')
    reply.header('Access-Control-Allow-Headers', CORS_ALLOWED_HEADERS.join(', '))
    reply.header('Access-Control-Allow-Methods', CORS_ALLOWED_METHODS)
    reply.code(204).send()
  })

  app.addHook('preHandler', async (request) => {
    if (request.method === 'OPTIONS') {
      return
    }

    await guard.authenticate(request.headers)

    try {
      request.workflowUser = dependencies.resolveStorageUser(request.headers)
    } catch (error) {
      if (!isMissingWorkflowUserError(error)) {
        throw error
      }
      request.workflowUser = undefined
    }
  })

  app.setNotFoundHandler((_request, reply) => {
    reply.code(404).send({ message: '未找到接口' })
  })

  app.setErrorHandler((error, request, reply) => {
    const diagnostics = resolveErrorDiagnostics(error)
    createServerLogger({
      module: 'http.error',
      requestId: request.id,
      userId: request.workflowUser?.id,
      method: request.method,
      pathname: new URL(request.url, 'http://127.0.0.1').pathname,
    }).error('请求处理失败', { error })

    reply.status(resolveErrorStatusCode(error)).send(
      diagnostics
        ? {
            message: resolveErrorMessage(error),
            diagnostics,
          }
        : {
            message: resolveErrorMessage(error),
          },
    )
  })

  app.addHook('onClose', async () => {
    disposeAllPiAgentSessions()
    disposeAllJsTransformAgentSessions()
    await apiTracking.close()
  })

  void app.register(createJsTransformAgentRoutes())
  void app.register(createPiAgentRoutes())
  void app.register(createNotebookAgentRoutes())
  void app.register(createStorageRoutes())
  void app.register(createAnalysisRoutes())

  // API 调用打点：根级 preHandler + onResponse hook，全局生效
  void registerApiCallTracking(app, apiTracking)

  // 生产 COI 头（Notebook SharedArrayBuffer 前提）
  // 直接 addHook 到根实例，覆盖所有路由与静态资源响应
  void registerNotebookHeaders(app)

  return app
}
