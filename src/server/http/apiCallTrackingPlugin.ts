/**
 * API 调用打点 Fastify hook 注册。
 *
 * 采用与 registerNotebookHeaders 相同的模式：直接 addHook 到根实例，
 * 对所有 /api/* 路由全局生效，零侵入各路由模块（根级 hook 全局生效，
 * 与路由注册顺序无关）。
 *
 * 双 hook 协作：
 *   - preHandler（在 app.ts 鉴权 hook 之后注册）：INSERT 一条 status='streaming'
 *     记录。普通接口和流式接口（reply.hijack）都会执行。
 *   - onResponse：UPDATE 同 request_id 行，补状态码/耗时/status。仅普通接口
 *     触发；流式接口因 hijack 不触发 onResponse，记录自然停在 'streaming'，
 *     符合"流式接口只记请求开始"的需求。
 *
 * 容错：所有逻辑 try/catch 包裹，打点异常绝不影响业务请求。
 */

import type { FastifyInstance, FastifyRequest } from 'fastify'
import { createServerLogger } from '../logging/serverLogger.js'
import type { ApiCallTracker } from '../apiCallTracking/apiCallTracker.js'

const logger = createServerLogger({ module: 'apiCallTracking' })

const MAX_FULL_PATH_LENGTH = 2048

const isTrackableApiRequest = (request: FastifyRequest): boolean => {
  if (request.method === 'OPTIONS') return false
  const pathname = request.url.split('?')[0] ?? request.url
  return pathname.startsWith('/api/')
}

const resolveRouteTemplate = (request: FastifyRequest): string => {
  const routeUrl = request.routeOptions?.url
  if (typeof routeUrl === 'string' && routeUrl.length > 0) {
    return routeUrl
  }
  // 404 等未命中路由的情况兜底用 pathname
  return request.url.split('?')[0] ?? request.url
}

const resolveParams = (request: FastifyRequest): Record<string, unknown> | null => {
  const params = request.params
  if (params && typeof params === 'object' && Object.keys(params).length > 0) {
    return params as Record<string, unknown>
  }
  return null
}

const truncate = (value: string, maxLength: number): string =>
  value.length > maxLength ? `${value.slice(0, maxLength - 3)}...` : value

export const registerApiCallTracking = async (
  app: FastifyInstance,
  tracker: ApiCallTracker,
): Promise<void> => {
  app.addHook('preHandler', async (request) => {
    if (!isTrackableApiRequest(request)) {
      return
    }

    try {
      const startTimeMs = Date.now()
      request.apiCallStartTime = startTimeMs

      tracker.recordStart({
        requestId: request.id,
        userId: request.workflowUser?.id ?? null,
        method: request.method,
        route: resolveRouteTemplate(request),
        fullPath: truncate(request.url, MAX_FULL_PATH_LENGTH),
        paramsJson: resolveParams(request),
        startTimeMs,
        clientIp: request.ip ?? null,
      })
    } catch (error) {
      logger.error('打点 preHandler 失败', { requestId: request.id, error })
    }
  })

  app.addHook('onResponse', async (request, reply) => {
    if (!isTrackableApiRequest(request)) {
      return
    }

    const startTime = request.apiCallStartTime
    if (typeof startTime !== 'number') {
      return
    }

    try {
      const statusCode = reply.statusCode
      const durationMs = Date.now() - startTime
      const status = statusCode < 400 ? 'ok' : 'error'
      tracker.recordCompletion(request.id, statusCode, durationMs, status)
    } catch (error) {
      logger.error('打点 onResponse 失败', { requestId: request.id, error })
    }
  })
}
