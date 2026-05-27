/**
 * Pi Agent 路由
 */
import type {
  PiAgentSafeToolResult,
  WorkflowAiPlanRequest,
} from '../../ai/types.js'
import type { FastifyPluginAsync } from 'fastify'
import { requireWorkflowUser } from '../http/workflowUser.js'
import { startNdjsonStream } from '../http/ndjson.js'
import { createServerLogger } from '../logging/serverLogger.js'
import {
  createPiAgentSession,
  sendPiAgentMessage,
  subscribePiAgentEvents,
  getPiAgentSession,
  resolvePiAgentToolResult,
  syncPiAgentCanvas,
} from '../piAgent/gateway.js'
import {
  getSystemModelProfiles,
  resolveModelProfile,
  toPublicModelProfile,
} from '../piAgent/modelProfiles.js'
import { testPiAgentRuntimeProfile } from '../piAgent/runtimeFactory.js'
import { buildSystemPrompt } from '../piAgent/systemPrompt.js'
import { PI_AGENT_RAW_ROWS_ERROR_MESSAGE, assertPiAgentSafeRequest } from '../piAgent/safePayload.js'

const createRouteLogger = (request: {
  id: string
  workflowUser?: { id: string }
  method: string
  url: string
}) => createServerLogger({
  module: 'pi-agent.routes',
  requestId: request.id,
  userId: request.workflowUser?.id,
  method: request.method,
  pathname: new URL(request.url, 'http://127.0.0.1').pathname,
})

export const createPiAgentRoutes = (): FastifyPluginAsync => async (app) => {
  app.get('/api/pi-agent/model-profiles', async () => ({
    profiles: getSystemModelProfiles().map(toPublicModelProfile),
  }))

  app.post('/api/pi-agent/model-profiles/test', async (request, reply) => {
    const body = request.body as { profile?: WorkflowAiPlanRequest['profile'] }
    if (!body.profile) {
      reply.code(400)
      return { message: '缺少模型配置' }
    }

    return testPiAgentRuntimeProfile(resolveModelProfile(body.profile), buildSystemPrompt)
  })

  app.post('/api/pi-agent/sessions', async (request, reply) => {
    const logger = createRouteLogger(request)

    try {
      const user = requireWorkflowUser(request)
      const body = request.body as WorkflowAiPlanRequest
      assertPiAgentSafeRequest(body)
      const result = await createPiAgentSession(body, user.id)
      logger.info('创建 Pi Agent 会话', { sessionId: result.sessionId, userId: user.id })
      return result
    } catch (error) {
      if (error instanceof Error && error.message === PI_AGENT_RAW_ROWS_ERROR_MESSAGE) {
        reply.code(400)
        return { message: error.message }
      }
      throw error
    }
  })

  app.post('/api/pi-agent/sessions/:sessionId/messages', async (request) => {
    const logger = createRouteLogger(request)
    const { sessionId } = request.params as { sessionId: string }
    const body = request.body as { content: string }
    const result = await sendPiAgentMessage(sessionId, body.content)
    logger.info('发送 Pi Agent 消息', { sessionId })
    return result
  })

  app.get('/api/pi-agent/sessions/:sessionId/events', async (request, reply) => {
    const logger = createRouteLogger(request)
    const { sessionId } = request.params as { sessionId: string }
    const session = getPiAgentSession(sessionId)
    if (!session) {
      reply.code(404)
      return { message: '未找到 Pi Agent 会话' }
    }

    reply.hijack()
    logger.info('订阅 Pi Agent 事件流', { sessionId })
    startNdjsonStream(reply.raw, (write) => subscribePiAgentEvents(sessionId, write))
    return reply
  })

  app.post('/api/pi-agent/sessions/:sessionId/tool-result', async (request, reply) => {
    const logger = createRouteLogger(request)
    const { sessionId } = request.params as { sessionId: string }
    const body = request.body as {
      toolCallId: string
      result: { content: Array<{ type: 'text'; text: string }>; details: PiAgentSafeToolResult; isError?: boolean }
    }
    const ok = resolvePiAgentToolResult(sessionId, body.toolCallId, body.result)
    logger.info('处理 Pi Agent 工具结果', { sessionId, requestId: request.id })
    reply.code(ok ? 200 : 404)
    return { ok }
  })

  app.post('/api/pi-agent/sessions/:sessionId/canvas-sync', async (request, reply) => {
    const logger = createRouteLogger(request)
    const { sessionId } = request.params as { sessionId: string }

    try {
      const body = request.body as {
        workflowSnapshot: {
          name: string
          nodes: unknown[]
          edges: unknown[]
        }
      }
      const result = await syncPiAgentCanvas({
        sessionId,
        workflowSnapshot: body.workflowSnapshot,
      })
      logger.info('同步 Pi Agent 画布', { sessionId })
      return result
    } catch (error) {
      if (error instanceof Error && error.message === '未找到 Pi Agent 会话') {
        reply.code(404)
        return { message: error.message }
      }
      throw error
    }
  })

  app.get('/api/pi-agent/sessions/:sessionId', async (request, reply) => {
    const logger = createRouteLogger(request)
    const { sessionId } = request.params as { sessionId: string }
    const session = getPiAgentSession(sessionId)
    if (!session) {
      reply.code(404)
      return { message: '未找到 Pi Agent 会话' }
    }
    logger.info('读取 Pi Agent 会话', { sessionId })
    return session
  })
}
