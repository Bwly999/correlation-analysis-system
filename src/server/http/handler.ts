import { createHttpRequestContext } from './context.js'
import type { HttpDomainHandler, HttpRequestHandler } from './types.js'

export interface HttpHandlerOptions<TDependencies> {
  dependencies: TDependencies
  domains: Array<HttpDomainHandler<TDependencies>>
}

export const createHttpHandler = <TDependencies>(
  options: HttpHandlerOptions<TDependencies>,
): HttpRequestHandler => async (request, response) => {
  const context = createHttpRequestContext(request, response, options.dependencies)

  if (context.method === 'OPTIONS') {
    context.sendNoContent(204)
    return
  }

  try {
    for (const domain of options.domains) {
      const handled = await domain(context)
      if (handled) return
    }

    context.sendJson(404, { message: '未找到接口' })
  } catch (error) {
    context.sendError(error)
  }
}
