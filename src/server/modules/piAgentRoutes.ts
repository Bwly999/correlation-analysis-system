/**
 * Pi Agent 路由
 */
import type {
  JsTransformAgentSessionRequest,
  JsTransformAgentSafeDebugResult,
  WorkflowAiPlanRequest,
} from '../../ai/types.js'
import type { ServerDependencies } from '../bootstrap/serverDependencies.js'
import type { HttpDomainHandler } from '../http/types.js'
import { requireWorkflowUser } from '../http/workflowUser.js'
import { createServerLogger } from '../logging/serverLogger.js'
import {
  createPiAgentSession,
  createJsTransformAgentSession,
  abortJsTransformAgentRun,
  sendPiAgentMessage,
  sendJsTransformAgentMessage,
  updateJsTransformAgentMode,
  subscribePiAgentEvents,
  subscribeJsTransformAgentEvents,
  getPiAgentSession,
  getJsTransformAgentSession,
  resolvePiAgentToolResult,
  resolveJsTransformAgentToolResult,
  syncPiAgentCanvas,
} from '../piAgent/gateway.js'
import {
  getAgentObservabilityDebugFiles,
  getAgentObservabilityDebugHealth,
  getAgentObservabilityDebugReplay,
  getAgentObservabilityDebugTrace,
} from '../opencode/gateway.js'
import type { PiAgentSafeToolResult } from '../../ai/types.js'
import { PI_AGENT_RAW_ROWS_ERROR_MESSAGE, assertPiAgentSafeRequest } from '../piAgent/safePayload.js'

const isAgentObservabilityEnabled = () => process.env.NODE_ENV === 'development'

export const createPiAgentRoutes = (): HttpDomainHandler<ServerDependencies> => async (context) => {
  const { pathname, method } = context
  const logger = createServerLogger({
    module: 'pi-agent.routes',
    requestId: context.requestId,
    userId: context.userId,
    method: context.method,
    pathname: context.pathname,
  })
  const debugHealthMatch = pathname === '/api/pi-agent/debug/health'
  const debugTraceReplayMatch = pathname.match(/^\/api\/pi-agent\/sessions\/([^/]+)\/debug-trace\/replay$/)
  const debugTraceFilesMatch = pathname.match(/^\/api\/pi-agent\/sessions\/([^/]+)\/debug-trace\/files$/)
  const debugTraceMatch = pathname.match(/^\/api\/pi-agent\/sessions\/([^/]+)\/debug-trace$/)

  if (method === 'GET' && debugHealthMatch) {
    if (!isAgentObservabilityEnabled()) return false
    context.sendJson(200, getAgentObservabilityDebugHealth())
    return true
  }

  if (method === 'GET' && debugTraceReplayMatch) {
    if (!isAgentObservabilityEnabled()) return false
    const sessionId = decodeURIComponent(debugTraceReplayMatch[1] ?? '')
    const seq = Number(context.url.searchParams.get('seq'))
    const replay = getAgentObservabilityDebugReplay(sessionId, Number.isFinite(seq) ? seq : undefined)
    if (!replay) {
      context.sendJson(404, { message: '未找到 Pi Agent 调试回放' })
      return true
    }
    context.sendJson(200, replay)
    return true
  }

  if (method === 'GET' && debugTraceFilesMatch) {
    if (!isAgentObservabilityEnabled()) return false
    const sessionId = decodeURIComponent(debugTraceFilesMatch[1] ?? '')
    const files = getAgentObservabilityDebugFiles(sessionId)
    if (!files) {
      context.sendJson(404, { message: '未找到 Pi Agent 调试日志文件' })
      return true
    }
    context.sendJson(200, files)
    return true
  }

  if (method === 'GET' && debugTraceMatch) {
    if (!isAgentObservabilityEnabled()) return false
    const sessionId = decodeURIComponent(debugTraceMatch[1] ?? '')
    const limitParam = context.url.searchParams.get('limit')
    const offsetParam = context.url.searchParams.get('offset')
    const limit = limitParam === null ? Number.NaN : Number(limitParam)
    const offset = offsetParam === null ? Number.NaN : Number(offsetParam)
    const trace = getAgentObservabilityDebugTrace(sessionId, {
      limit: Number.isFinite(limit) ? limit : undefined,
      offset: Number.isFinite(offset) ? offset : undefined,
    })
    if (!trace) {
      context.sendJson(404, { message: '未找到 Pi Agent 调试 Trace' })
      return true
    }
    context.sendJson(200, trace)
    return true
  }

  if (method === 'POST' && pathname === '/api/pi-agent/js-transform/sessions') {
    const user = requireWorkflowUser(context)
    const body = await context.readJsonBody<JsTransformAgentSessionRequest>()
    const result = await createJsTransformAgentSession(body, user.id)
    logger.info('创建 JS Transform Agent 会话', { sessionId: result.sessionId, userId: user.id })
    context.sendJson(200, result)
    return true
  }

  // POST /api/pi-agent/sessions - 创建会话
  if (method === 'POST' && pathname === '/api/pi-agent/sessions') {
    try {
      const user = requireWorkflowUser(context)
      const body = await context.readJsonBody<WorkflowAiPlanRequest>()
      assertPiAgentSafeRequest(body)
      const result = await createPiAgentSession(body, user.id, context.dependencies.workflowMcpRuntime)
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

  const jsMessagesMatch = pathname.match(/^\/api\/pi-agent\/js-transform\/sessions\/([^/]+)\/messages$/)
  if (method === 'POST' && jsMessagesMatch) {
    const sessionId = decodeURIComponent(jsMessagesMatch[1] ?? '')
    const body = await context.readJsonBody<{ content: string }>()
    const result = await sendJsTransformAgentMessage(sessionId, body.content)
    context.sendJson(200, result)
    return true
  }

  const jsModeMatch = pathname.match(/^\/api\/pi-agent\/js-transform\/sessions\/([^/]+)\/mode$/)
  if (method === 'POST' && jsModeMatch) {
    const sessionId = decodeURIComponent(jsModeMatch[1] ?? '')
    const body = await context.readJsonBody<{ mode: 'ask' | 'agent' }>()
    const result = await updateJsTransformAgentMode(sessionId, body.mode)
    context.sendJson(result.ok ? 200 : 404, result)
    return true
  }

  const jsAbortMatch = pathname.match(/^\/api\/pi-agent\/js-transform\/sessions\/([^/]+)\/abort$/)
  if (method === 'POST' && jsAbortMatch) {
    const sessionId = decodeURIComponent(jsAbortMatch[1] ?? '')
    const result = await abortJsTransformAgentRun(sessionId)
    context.sendJson(result.ok ? 200 : 404, result)
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

  const jsEventsMatch = pathname.match(/^\/api\/pi-agent\/js-transform\/sessions\/([^/]+)\/events$/)
  if (method === 'GET' && jsEventsMatch) {
    const sessionId = decodeURIComponent(jsEventsMatch[1] ?? '')
    const session = getJsTransformAgentSession(sessionId)
    if (!session) {
      context.sendJson(404, { message: '未找到 Pi Agent 会话' })
      return true
    }

    context.startNdjson(200)
    const unsubscribe = subscribeJsTransformAgentEvents(sessionId, (event) => {
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

  const jsToolResultMatch = pathname.match(/^\/api\/pi-agent\/js-transform\/sessions\/([^/]+)\/tool-result$/)
  if (method === 'POST' && jsToolResultMatch) {
    const sessionId = decodeURIComponent(jsToolResultMatch[1] ?? '')
    const body = await context.readJsonBody<{
      toolCallId: string
      result: {
        content: Array<{ type: 'text'; text: string }>
        details: JsTransformAgentSafeDebugResult
        isError?: boolean
      }
    }>()
    const ok = resolveJsTransformAgentToolResult(sessionId, body.toolCallId, body.result)
    context.sendJson(ok ? 200 : 404, { ok })
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

  const jsSessionDetailMatch = pathname.match(/^\/api\/pi-agent\/js-transform\/sessions\/([^/]+)$/)
  if (method === 'GET' && jsSessionDetailMatch) {
    const sessionId = decodeURIComponent(jsSessionDetailMatch[1] ?? '')
    const session = getJsTransformAgentSession(sessionId)
    if (!session) {
      context.sendJson(404, { message: '未找到 Pi Agent 会话' })
      return true
    }
    logger.info('读取 JS Transform Agent 会话', { sessionId })
    context.sendJson(200, session)
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
