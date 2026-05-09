import type {
  AgentSessionCanvasSyncRequest,
  AgentSessionMessageRequest,
  WorkflowAiPlanRequest,
} from '../../ai/types.js'
import {
  createAgentSession,
  getAgentObservabilityDebugFiles,
  getAgentObservabilityDebugHealth,
  getAgentObservabilityDebugReplay,
  getAgentObservabilityDebugTrace,
  getAgentProjection,
  getAgentSession,
  runAgenticAnalysisSession,
  sendAgentSessionMessage,
  subscribeToAgentSessionEvents,
  syncAgentCanvas,
} from '../opencode/gateway.js'
import type { ServerDependencies } from '../bootstrap/serverDependencies.js'
import { requireWorkflowUser } from '../http/workflowUser.js'
import type { HttpDomainHandler } from '../http/types.js'

const isAgentObservabilityEnabled = () => process.env.NODE_ENV === 'development'

export const createAgentRoutes = (): HttpDomainHandler<ServerDependencies> => async (context) => {
  const { pathname, method } = context
  const debugHealthMatch = pathname === '/api/agent/debug/health'
  const agentSessionMessagesMatch = pathname.match(/^\/api\/agent\/sessions\/([^/]+)\/messages$/)
  const agenticRunMatch = pathname.match(/^\/api\/agent\/sessions\/([^/]+)\/agentic-run$/)
  const agentSessionEventsMatch = pathname.match(/^\/api\/agent\/sessions\/([^/]+)\/events$/)
  const agentSessionDebugTraceReplayMatch = pathname.match(/^\/api\/agent\/sessions\/([^/]+)\/debug-trace\/replay$/)
  const agentSessionDebugTraceFilesMatch = pathname.match(/^\/api\/agent\/sessions\/([^/]+)\/debug-trace\/files$/)
  const agentSessionDebugTraceMatch = pathname.match(/^\/api\/agent\/sessions\/([^/]+)\/debug-trace$/)
  const agentSessionProjectionMatch = pathname.match(/^\/api\/agent\/sessions\/([^/]+)\/projection$/)
  const agentSessionCanvasSyncMatch = pathname.match(/^\/api\/agent\/sessions\/([^/]+)\/canvas-sync$/)
  const agentSessionDetailMatch = pathname.match(/^\/api\/agent\/sessions\/([^/]+)$/)

  if (method === 'GET' && debugHealthMatch) {
    if (!isAgentObservabilityEnabled()) return false
    context.sendJson(200, getAgentObservabilityDebugHealth())
    return true
  }

  if (method === 'POST' && pathname === '/api/agent/sessions') {
    const currentUser = requireWorkflowUser(context)
    const body = await context.readJsonBody<WorkflowAiPlanRequest>()
    const result = await createAgentSession({
      request: body,
      userId: currentUser.id,
    })
    context.sendJson(200, result)
    return true
  }

  if (method === 'GET' && agentSessionDetailMatch) {
    const sessionId = decodeURIComponent(agentSessionDetailMatch[1] ?? '')
    const result = getAgentSession(sessionId)
    if (!result) {
      context.sendJson(404, { message: '未找到 Agent 会话' })
      return true
    }
    context.sendJson(200, result)
    return true
  }

  if (method === 'POST' && agentSessionMessagesMatch) {
    const sessionId = decodeURIComponent(agentSessionMessagesMatch[1] ?? '')
    const body = await context.readJsonBody<AgentSessionMessageRequest>()
    const result = await sendAgentSessionMessage(
      {
        sessionId,
        message: body.content,
      },
      () => undefined,
    )
    context.sendJson(200, result)
    return true
  }

  if (method === 'POST' && agenticRunMatch) {
    const sessionId = decodeURIComponent(agenticRunMatch[1] ?? '')
    const body = await context.readJsonBody<AgentSessionMessageRequest>()
    const result = await runAgenticAnalysisSession(
      {
        sessionId,
        message: body.content,
      },
      () => undefined,
    )
    context.sendJson(200, result)
    return true
  }

  if (method === 'GET' && agentSessionEventsMatch) {
    const sessionId = decodeURIComponent(agentSessionEventsMatch[1] ?? '')
    const snapshot = getAgentSession(sessionId)
    if (!snapshot) {
      context.sendJson(404, { message: '未找到 Agent 会话' })
      return true
    }

    context.startNdjson(200)
    const unsubscribe = subscribeToAgentSessionEvents(sessionId, (event) => {
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

  if (method === 'GET' && agentSessionDebugTraceReplayMatch) {
    if (!isAgentObservabilityEnabled()) return false
    const sessionId = decodeURIComponent(agentSessionDebugTraceReplayMatch[1] ?? '')
    const seq = Number(context.url.searchParams.get('seq'))
    const replay = getAgentObservabilityDebugReplay(sessionId, Number.isFinite(seq) ? seq : undefined)
    if (!replay) {
      context.sendJson(404, { message: '未找到 Agent 调试回放' })
      return true
    }
    context.sendJson(200, replay)
    return true
  }

  if (method === 'GET' && agentSessionDebugTraceFilesMatch) {
    if (!isAgentObservabilityEnabled()) return false
    const sessionId = decodeURIComponent(agentSessionDebugTraceFilesMatch[1] ?? '')
    const files = getAgentObservabilityDebugFiles(sessionId)
    if (!files) {
      context.sendJson(404, { message: '未找到 Agent 调试日志文件' })
      return true
    }
    context.sendJson(200, files)
    return true
  }

  if (method === 'GET' && agentSessionDebugTraceMatch) {
    if (!isAgentObservabilityEnabled()) return false
    const sessionId = decodeURIComponent(agentSessionDebugTraceMatch[1] ?? '')
    const limit = Number(context.url.searchParams.get('limit'))
    const offset = Number(context.url.searchParams.get('offset'))
    const trace = getAgentObservabilityDebugTrace(sessionId, {
      limit: Number.isFinite(limit) ? limit : undefined,
      offset: Number.isFinite(offset) ? offset : undefined,
    })
    if (!trace) {
      context.sendJson(404, { message: '未找到 Agent 调试 Trace' })
      return true
    }
    context.sendJson(200, trace)
    return true
  }

  if (method === 'GET' && agentSessionProjectionMatch) {
    const sessionId = decodeURIComponent(agentSessionProjectionMatch[1] ?? '')
    const projection = getAgentProjection(sessionId)
    if (!projection) {
      context.sendJson(404, { message: '未找到 Agent 会话' })
      return true
    }
    context.sendJson(200, { projection })
    return true
  }

  if (method === 'POST' && agentSessionCanvasSyncMatch) {
    const sessionId = decodeURIComponent(agentSessionCanvasSyncMatch[1] ?? '')
    const body = await context.readJsonBody<AgentSessionCanvasSyncRequest>()
    const result = await syncAgentCanvas({
      sessionId,
      workflowSnapshot: body.workflowSnapshot,
    })
    context.sendJson(200, result)
    return true
  }

  return false
}
