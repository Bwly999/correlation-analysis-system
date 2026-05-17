/**
 * Pi Agent 路由
 */
import type { WorkflowAiPlanRequest } from '../../ai/types.js'
import type { ServerDependencies } from '../bootstrap/serverDependencies.js'
import type { HttpDomainHandler } from '../http/types.js'
import { requireWorkflowUser } from '../http/workflowUser.js'
import {
  createPiAgentSession,
  sendPiAgentMessage,
  subscribePiAgentEvents,
  getPiAgentSession,
  resolvePiAgentToolResult,
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

  // POST /api/pi-agent/sessions - 创建会话
  if (method === 'POST' && pathname === '/api/pi-agent/sessions') {
    try {
      const user = requireWorkflowUser(context)
      const body = await context.readJsonBody<WorkflowAiPlanRequest>()
      assertPiAgentSafeRequest(body)
      const result = await createPiAgentSession(body, user.id, context.dependencies.workflowMcpRuntime)
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
    context.sendJson(ok ? 200 : 404, { ok })
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
    context.sendJson(200, session)
    return true
  }

  return false
}
