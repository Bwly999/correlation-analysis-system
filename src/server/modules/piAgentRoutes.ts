/**
 * Pi Agent 路由
 */
import type {
  WorkflowAiPlanRequest,
} from '../../ai/types.js'
import type { ServerDependencies } from '../bootstrap/serverDependencies.js'
import type { HttpDomainHandler } from '../http/types.js'
import { requireWorkflowUser } from '../http/workflowUser.js'
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
import type { PiAgentSafeToolResult } from '../../ai/types.js'
import { PI_AGENT_RAW_ROWS_ERROR_MESSAGE, assertPiAgentSafeRequest } from '../piAgent/safePayload.js'

export const createPiAgentRoutes = (): HttpDomainHandler<ServerDependencies> => async (context) => {
  const { pathname, method } = context
  const logger = createServerLogger({
    module: 'pi-agent.routes',
    requestId: context.requestId,
    userId: context.userId,
    method: context.method,
    pathname: context.pathname,
  })
  if (method === 'GET' && pathname === '/api/pi-agent/model-profiles') {
    context.sendJson(200, { profiles: getSystemModelProfiles().map(toPublicModelProfile) })
    return true
  }

  if (method === 'POST' && pathname === '/api/pi-agent/model-profiles/test') {
    const body = await context.readJsonBody<{ profile?: WorkflowAiPlanRequest['profile'] }>()
    if (!body.profile) {
      context.sendJson(400, { message: '缺少模型配置' })
      return true
    }

    const result = await testPiAgentRuntimeProfile(resolveModelProfile(body.profile), buildSystemPrompt)
    context.sendJson(200, result)
    return true
  }

  // POST /api/pi-agent/sessions - 创建会话
  if (method === 'POST' && pathname === '/api/pi-agent/sessions') {
    try {
      const user = requireWorkflowUser(context)
      const body = await context.readJsonBody<WorkflowAiPlanRequest>()
      assertPiAgentSafeRequest(body)
      const result = await createPiAgentSession(body, user.id)
      logger.info('创建 Pi Agent 会话', { sessionId: result.sessionId, userId: user.id })
      context.sendJson(200, result)
    } catch (error) {
      if (error instanceof Error && error.message === PI_AGENT_RAW_ROWS_ERROR_MESSAGE) {
        context.sendJson(400, { message: error.message })
        return true
      }
      throw error
    }
    return true
  }

  // POST /api/pi-agent/sessions/:id/messages - 发送消息
  const messagesMatch = pathname.match(/^\/api\/pi-agent\/sessions\/([^/]+)\/messages$/)
  if (method === 'POST' && messagesMatch) {
    const sessionId = decodeURIComponent(messagesMatch[1] ?? '')
    const body = await context.readJsonBody<{ content: string }>()
    const result = await sendPiAgentMessage(sessionId, body.content)
    logger.info('发送 Pi Agent 消息', { sessionId })
    context.sendJson(200, result)
    return true
  }

  // GET /api/pi-agent/sessions/:id/events - SSE 事件流
  const eventsMatch = pathname.match(/^\/api\/pi-agent\/sessions\/([^/]+)\/events$/)
  if (method === 'GET' && eventsMatch) {
    const sessionId = decodeURIComponent(eventsMatch[1] ?? '')
    const session = getPiAgentSession(sessionId)
    if (!session) {
      context.sendJson(404, { message: '未找到 Pi Agent 会话' })
      return true
    }

    // 使用 NDJSON 格式推送事件
    context.startNdjson(200)
    logger.info('订阅 Pi Agent 事件流', { sessionId })

    const unsubscribe = subscribePiAgentEvents(sessionId, (event) => {
      context.writeNdjson(event)
    })

    if (!unsubscribe) {
      context.response.end()
      return true
    }

    context.request.on('close', () => {
      unsubscribe()
      context.response.end()
    })
    return true
  }

  // POST /api/pi-agent/sessions/:id/tool-result - 前端返回工具执行结果
  const toolResultMatch = pathname.match(/^\/api\/pi-agent\/sessions\/([^/]+)\/tool-result$/)
  if (method === 'POST' && toolResultMatch) {
    const sessionId = decodeURIComponent(toolResultMatch[1] ?? '')
    const body = await context.readJsonBody<{
      toolCallId: string
      result: { content: Array<{ type: 'text'; text: string }>; details: PiAgentSafeToolResult; isError?: boolean }
    }>()
    const ok = resolvePiAgentToolResult(sessionId, body.toolCallId, body.result)
    logger.info('处理 Pi Agent 工具结果', { sessionId, requestId: context.requestId })
    context.sendJson(ok ? 200 : 404, { ok })
    return true
  }

  // POST /api/pi-agent/sessions/:id/canvas-sync - 同步当前画布快照
  const canvasSyncMatch = pathname.match(/^\/api\/pi-agent\/sessions\/([^/]+)\/canvas-sync$/)
  if (method === 'POST' && canvasSyncMatch) {
    const sessionId = decodeURIComponent(canvasSyncMatch[1] ?? '')
    try {
      const body = await context.readJsonBody<{
        workflowSnapshot: {
          name: string
          nodes: unknown[]
          edges: unknown[]
        }
      }>()
      const result = await syncPiAgentCanvas({
        sessionId,
        workflowSnapshot: body.workflowSnapshot,
      })
      logger.info('同步 Pi Agent 画布', { sessionId })
      context.sendJson(200, result)
    } catch (error) {
      if (error instanceof Error && error.message === '未找到 Pi Agent 会话') {
        context.sendJson(404, { message: error.message })
        return true
      }
      throw error
    }
    return true
  }

  // GET /api/pi-agent/sessions/:id - 获取会话状态
  const sessionDetailMatch = pathname.match(/^\/api\/pi-agent\/sessions\/([^/]+)$/)
  if (method === 'GET' && sessionDetailMatch) {
    const sessionId = decodeURIComponent(sessionDetailMatch[1] ?? '')
    const session = getPiAgentSession(sessionId)
    if (!session) {
      context.sendJson(404, { message: '未找到 Pi Agent 会话' })
      return true
    }
    logger.info('读取 Pi Agent 会话', { sessionId })
    context.sendJson(200, session)
    return true
  }

  return false
}
