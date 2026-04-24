import type {
  AgentSessionCanvasSyncRequest,
  AgentSessionMessageRequest,
  WorkflowAiPlanRequest,
} from '../../ai/types.js'
import {
  createAgentSession,
  getAgentProjection,
  getAgentSession,
  sendAgentSessionMessage,
  subscribeToAgentSessionEvents,
  syncAgentCanvas,
} from '../opencode/gateway.js'
import type { ServerDependencies } from '../bootstrap/serverDependencies.js'
import type { HttpDomainHandler } from '../http/types.js'

export const createAgentRoutes = (): HttpDomainHandler<ServerDependencies> => async (context) => {
  const { pathname, method } = context
  const agentSessionMessagesMatch = pathname.match(/^\/api\/agent\/sessions\/([^/]+)\/messages$/)
  const agentSessionEventsMatch = pathname.match(/^\/api\/agent\/sessions\/([^/]+)\/events$/)
  const agentSessionProjectionMatch = pathname.match(/^\/api\/agent\/sessions\/([^/]+)\/projection$/)
  const agentSessionCanvasSyncMatch = pathname.match(/^\/api\/agent\/sessions\/([^/]+)\/canvas-sync$/)
  const agentSessionDetailMatch = pathname.match(/^\/api\/agent\/sessions\/([^/]+)$/)

  if (method === 'POST' && pathname === '/api/agent/sessions') {
    const currentUser = context.dependencies.resolveStorageUser(context.request.headers)
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
