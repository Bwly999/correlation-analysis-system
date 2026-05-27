import type {
  JsTransformAgentSafeDebugResult,
  JsTransformAgentSessionRequest,
} from '../../ai/types.js'
import type { ServerDependencies } from '../bootstrap/serverDependencies.js'
import type { HttpDomainHandler } from '../http/types.js'
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

export const createJsTransformAgentRoutes = (): HttpDomainHandler<ServerDependencies> => async (context) => {
  const { pathname, method } = context
  const logger = createServerLogger({
    module: 'js-transform-agent.routes',
    requestId: context.requestId,
    userId: context.userId,
    method: context.method,
    pathname: context.pathname,
  })

  if (method === 'POST' && pathname === '/api/js-transform-agent/sessions') {
    const user = requireWorkflowUser(context)
    const body = await context.readJsonBody<JsTransformAgentSessionRequest>()
    const result = await createJsTransformAgentSession(body, user.id)
    logger.info('创建 JS Transform Agent 会话', { sessionId: result.sessionId, userId: user.id })
    context.sendJson(200, result)
    return true
  }

  const messagesMatch = pathname.match(/^\/api\/js-transform-agent\/sessions\/([^/]+)\/messages$/)
  if (method === 'POST' && messagesMatch) {
    const sessionId = decodeURIComponent(messagesMatch[1] ?? '')
    const body = await context.readJsonBody<{ content: string }>()
    const result = await sendJsTransformAgentMessage(sessionId, body.content)
    context.sendJson(200, result)
    return true
  }

  const modeMatch = pathname.match(/^\/api\/js-transform-agent\/sessions\/([^/]+)\/mode$/)
  if (method === 'POST' && modeMatch) {
    const sessionId = decodeURIComponent(modeMatch[1] ?? '')
    const body = await context.readJsonBody<{ mode: 'ask' | 'agent' }>()
    const result = await updateJsTransformAgentMode(sessionId, body.mode)
    context.sendJson(result.ok ? 200 : 404, result)
    return true
  }

  const abortMatch = pathname.match(/^\/api\/js-transform-agent\/sessions\/([^/]+)\/abort$/)
  if (method === 'POST' && abortMatch) {
    const sessionId = decodeURIComponent(abortMatch[1] ?? '')
    const result = await abortJsTransformAgentRun(sessionId)
    context.sendJson(result.ok ? 200 : 404, result)
    return true
  }

  const eventsMatch = pathname.match(/^\/api\/js-transform-agent\/sessions\/([^/]+)\/events$/)
  if (method === 'GET' && eventsMatch) {
    const sessionId = decodeURIComponent(eventsMatch[1] ?? '')
    const session = getJsTransformAgentSession(sessionId)
    if (!session) {
      context.sendJson(404, { message: '未找到 JS Transform Agent 会话' })
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

  const toolResultMatch = pathname.match(/^\/api\/js-transform-agent\/sessions\/([^/]+)\/tool-result$/)
  if (method === 'POST' && toolResultMatch) {
    const sessionId = decodeURIComponent(toolResultMatch[1] ?? '')
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

  const sessionDetailMatch = pathname.match(/^\/api\/js-transform-agent\/sessions\/([^/]+)$/)
  if (method === 'GET' && sessionDetailMatch) {
    const sessionId = decodeURIComponent(sessionDetailMatch[1] ?? '')
    const session = getJsTransformAgentSession(sessionId)
    if (!session) {
      context.sendJson(404, { message: '未找到 JS Transform Agent 会话' })
      return true
    }
    logger.info('读取 JS Transform Agent 会话', { sessionId })
    context.sendJson(200, session)
    return true
  }

  return false
}
