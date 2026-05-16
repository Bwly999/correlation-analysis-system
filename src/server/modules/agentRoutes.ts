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
  sendAgentSessionMessage,
  subscribeToAgentSessionEvents,
  syncAgentCanvas,
} from '../opencode/gateway.js'
import type { ServerDependencies } from '../bootstrap/serverDependencies.js'
import { requireWorkflowUser } from '../http/workflowUser.js'
import type { HttpDomainHandler } from '../http/types.js'

const isAgentObservabilityEnabled = () => process.env.NODE_ENV === 'development'
const LEGACY_AGENT_DISABLED_MESSAGE = '通用助手链路已停用，请改用 Pi Agent 主链 /api/pi-agent/sessions'

export const createAgentRoutes = (): HttpDomainHandler<ServerDependencies> => async (context) => {
  const { pathname, method } = context
  const debugHealthMatch = pathname === '/api/agent/debug/health'
  const agentSessionMessagesMatch = pathname.match(/^\/api\/agent\/sessions\/([^/]+)\/messages$/)
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
    context.sendJson(410, { message: LEGACY_AGENT_DISABLED_MESSAGE })
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
    context.sendJson(410, { message: LEGACY_AGENT_DISABLED_MESSAGE })
    return true
  }

  if (method === 'GET' && agentSessionEventsMatch) {
    context.sendJson(410, { message: LEGACY_AGENT_DISABLED_MESSAGE })
    return true
  }

  if (method === 'GET' && agentSessionProjectionMatch) {
    context.sendJson(410, { message: LEGACY_AGENT_DISABLED_MESSAGE })
    return true
  }

  if (method === 'POST' && agentSessionCanvasSyncMatch) {
    context.sendJson(410, { message: LEGACY_AGENT_DISABLED_MESSAGE })
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

  return false
}
