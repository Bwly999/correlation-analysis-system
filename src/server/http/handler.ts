import { createHttpRequestContext } from './context.js'
import type { HttpDomainHandler, HttpRequestHandler } from './types.js'
import type { WorkflowRequestHeaders } from './workflowHeaders.js'
import { createServerLogger } from '../logging/serverLogger.js'
import { createWorkflowUserResolver } from './workflowUser.js'

export interface HttpAuthGuard {
  authenticate(headers: WorkflowRequestHeaders): Promise<unknown> | unknown
}

export interface HttpHandlerOptions<TDependencies> {
  dependencies: TDependencies
  domains: Array<HttpDomainHandler<TDependencies>>
  authGuard?: HttpAuthGuard
}

export const createHttpHandler = <TDependencies>(
  options: HttpHandlerOptions<TDependencies>,
): HttpRequestHandler => async (request, response) => {
  const resolveWorkflowUser = createWorkflowUserResolver()
  const user = resolveWorkflowUser(request.headers)
  const context = createHttpRequestContext(request, response, options.dependencies, user)
  const logger = createServerLogger({
    module: 'http.handler',
    requestId: context.requestId,
    userId: context.userId,
    method: context.method,
    pathname: context.pathname,
  })

  logger.info('收到请求')

  if (context.method === 'OPTIONS') {
    context.sendNoContent(204)
    logger.info('已处理 OPTIONS 请求')
    return
  }

  try {
    await options.authGuard?.authenticate(request.headers)
    logger.info('鉴权通过')

    for (const domain of options.domains) {
      const handled = await domain(context)
      if (handled) {
        logger.info('路由已处理')
        return
      }
    }

    context.sendJson(404, { message: '未找到接口' })
    logger.warn('未匹配到路由')
  } catch (error) {
    logger.error('请求异常', { error })
    context.sendError(error)
  }
}
