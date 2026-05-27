import type {
  JsTransformAgentSafeDebugResult,
  JsTransformAgentSessionRequest,
} from '../../ai/types.js'
import type { FastifyPluginAsync } from 'fastify'
import { startNdjsonStream } from '../http/ndjson.js'
import { requireWorkflowUser } from '../http/workflowUser.js'
import { createServerLogger } from '../logging/serverLogger.js'
import {
  abortJsTransformAgentRun,
  createJsTransformAgentSession,
  getJsTransformAgentSession,
  resolveJsTransformAgentToolResult,
  sendJsTransformAgentMessage,
  subscribeJsTransformAgentEvents,
  updateJsTransformAgentMode,
} from '../piAgent/jsTransformAgentGateway.js'

const createRouteLogger = (request: {
  id: string
  workflowUser?: { id: string }
  method: string
  url: string
}) => createServerLogger({
  module: 'js-transform-agent.routes',
  requestId: request.id,
  userId: request.workflowUser?.id,
  method: request.method,
  pathname: new URL(request.url, 'http://127.0.0.1').pathname,
})

export const createJsTransformAgentRoutes = (): FastifyPluginAsync => async (app) => {
  app.post('/api/js-transform-agent/sessions', async (request) => {
    const logger = createRouteLogger(request)
    const user = requireWorkflowUser(request)
    const body = request.body as JsTransformAgentSessionRequest
    const result = await createJsTransformAgentSession(body, user.id)
    logger.info('创建 JS Transform Agent 会话', { sessionId: result.sessionId, userId: user.id })
    return result
  })

  app.post('/api/js-transform-agent/sessions/:sessionId/messages', async (request) => {
    const { sessionId } = request.params as { sessionId: string }
    const body = request.body as { content: string }
    return sendJsTransformAgentMessage(sessionId, body.content)
  })

  app.post('/api/js-transform-agent/sessions/:sessionId/mode', async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string }
    const body = request.body as { mode: 'ask' | 'agent' }
    const result = await updateJsTransformAgentMode(sessionId, body.mode)
    reply.code(result.ok ? 200 : 404)
    return result
  })

  app.post('/api/js-transform-agent/sessions/:sessionId/abort', async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string }
    const result = await abortJsTransformAgentRun(sessionId)
    reply.code(result.ok ? 200 : 404)
    return result
  })

  app.get('/api/js-transform-agent/sessions/:sessionId/events', async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string }
    const session = getJsTransformAgentSession(sessionId)
    if (!session) {
      reply.code(404)
      return { message: '未找到 JS Transform Agent 会话' }
    }

    reply.hijack()
    startNdjsonStream(reply.raw, (write) => subscribeJsTransformAgentEvents(sessionId, write))
    return reply
  })

  app.post('/api/js-transform-agent/sessions/:sessionId/tool-result', async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string }
    const body = request.body as {
      toolCallId: string
      result: {
        content: Array<{ type: 'text'; text: string }>
        details: JsTransformAgentSafeDebugResult
        isError?: boolean
      }
    }
    const ok = resolveJsTransformAgentToolResult(sessionId, body.toolCallId, body.result)
    reply.code(ok ? 200 : 404)
    return { ok }
  })

  app.get('/api/js-transform-agent/sessions/:sessionId', async (request, reply) => {
    const logger = createRouteLogger(request)
    const { sessionId } = request.params as { sessionId: string }
    const session = getJsTransformAgentSession(sessionId)
    if (!session) {
      reply.code(404)
      return { message: '未找到 JS Transform Agent 会话' }
    }
    logger.info('读取 JS Transform Agent 会话', { sessionId })
    return session
  })
}
