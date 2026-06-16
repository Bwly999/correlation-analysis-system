/**
 * Notebook Agent HTTP 路由（M1 最小骨架）。
 *
 * 端点：
 *   POST   /api/notebook-agent/sessions                  创建 session + 返回 systemPrompt
 *   GET    /api/notebook-agent/sessions/:sessionId       拿 session 概览
 *   GET    /api/notebook-agent/sessions/:sessionId/events NDJSON 事件流
 *   POST   /api/notebook-agent/sessions/:sessionId/messages
 *   POST   /api/notebook-agent/sessions/:sessionId/tool-result
 *   DELETE /api/notebook-agent/sessions/:sessionId       结束 session
 */

import type { FastifyPluginAsync } from 'fastify'
import { requireWorkflowUser } from '../http/workflowUser.js'
import { startNdjsonStream } from '../http/ndjson.js'
import { assertSessionOwner } from '../piAgent/sessionAccess.js'
import {
  appendNotebookAuditEntries,
  closeNotebookAgentSession,
  createNotebookAgentSession,
  finishNotebookAgentToolCall,
  getNotebookAgentSessionOwner,
  getNotebookAgentSessionView,
  injectNotebookSystemMessage,
  markNotebookAgentSessionReady,
  sendNotebookAgentMessage,
  subscribeNotebookAgentEvents,
} from '../notebookAgent/gateway.js'
import type { ImportCsvMeta } from '../../notebook/shared/parentBridge.js'

const validateImportCsvMeta = (meta: unknown): meta is ImportCsvMeta => {
  if (!meta || typeof meta !== 'object') return false
  const m = meta as Partial<ImportCsvMeta>
  return (
    (m.sourceKind === 'canvas-node' || m.sourceKind === 'data-source') &&
    typeof m.sourceLabel === 'string' &&
    typeof m.rowCount === 'number' &&
    typeof m.columnCount === 'number'
  )
}

export const createNotebookAgentRoutes = (): FastifyPluginAsync => async (app) => {
  const requireOwnedSession = (sessionId: string, userId: string) =>
    assertSessionOwner({
      sessionId,
      currentUserId: userId,
      resolveOwnerId: getNotebookAgentSessionOwner,
      missingMessage: '未找到 Notebook Agent 会话',
      forbiddenMessage: '无权访问该 Notebook Agent 会话',
    })

  app.post('/api/notebook-agent/sessions', async (request, reply) => {
    const user = requireWorkflowUser(request)
    const body = request.body as {
      initialDataMeta?: unknown
      origin?: string
    }
    if (!validateImportCsvMeta(body.initialDataMeta)) {
      reply.code(400)
      return { message: '缺少或非法 initialDataMeta' }
    }
    const result = await createNotebookAgentSession({
      userId: user.id,
      initialDataMeta: body.initialDataMeta,
      origin: typeof body.origin === 'string' ? body.origin : '',
    })
    return result
  })

  app.get('/api/notebook-agent/sessions/:sessionId', async (request, reply) => {
    const user = requireWorkflowUser(request)
    const { sessionId } = request.params as { sessionId: string }
    requireOwnedSession(sessionId, user.id)
    const view = getNotebookAgentSessionView(sessionId)
    if (!view) {
      reply.code(404)
      return { message: '未找到 Notebook Agent 会话' }
    }
    return view
  })

  app.get('/api/notebook-agent/sessions/:sessionId/events', async (request, reply) => {
    const user = requireWorkflowUser(request)
    const { sessionId } = request.params as { sessionId: string }
    requireOwnedSession(sessionId, user.id)
    const view = getNotebookAgentSessionView(sessionId)
    if (!view) {
      reply.code(404)
      return { message: '未找到 Notebook Agent 会话' }
    }

    reply.hijack()
    startNdjsonStream(reply.raw, (write) => {
      const unsubscribe = subscribeNotebookAgentEvents(sessionId, write)
      return () => unsubscribe?.()
    })
    return reply
  })

  app.post('/api/notebook-agent/sessions/:sessionId/messages', async (request, reply) => {
    const user = requireWorkflowUser(request)
    const { sessionId } = request.params as { sessionId: string }
    requireOwnedSession(sessionId, user.id)
    const body = request.body as { id?: string; content?: string }
    if (!body.id || !body.content) {
      reply.code(400)
      return { message: '缺少 id 或 content' }
    }
    const ok = await sendNotebookAgentMessage(sessionId, {
      id: body.id,
      content: body.content,
    })
    if (!ok) {
      reply.code(404)
      return { message: '会话不存在' }
    }
    return { ok: true }
  })

  app.post('/api/notebook-agent/sessions/:sessionId/ready', async (request, reply) => {
    const user = requireWorkflowUser(request)
    const { sessionId } = request.params as { sessionId: string }
    requireOwnedSession(sessionId, user.id)
    const ok = markNotebookAgentSessionReady(sessionId)
    if (!ok) {
      reply.code(404)
      return { message: '会话不存在' }
    }
    return { ok: true }
  })

  app.post('/api/notebook-agent/sessions/:sessionId/system-message', async (request, reply) => {
    const user = requireWorkflowUser(request)
    const { sessionId } = request.params as { sessionId: string }
    requireOwnedSession(sessionId, user.id)
    const body = request.body as { message?: string }
    if (!body.message || typeof body.message !== 'string') {
      reply.code(400)
      return { message: '缺少 message' }
    }
    const ok = await injectNotebookSystemMessage(sessionId, body.message)
    if (!ok) {
      reply.code(404)
      return { message: '会话不存在或注入失败' }
    }
    return { ok: true }
  })

  app.post('/api/notebook-agent/sessions/:sessionId/audit', async (request, reply) => {
    const user = requireWorkflowUser(request)
    const { sessionId } = request.params as { sessionId: string }
    requireOwnedSession(sessionId, user.id)
    const body = request.body as { entries?: unknown[] }
    if (!Array.isArray(body.entries)) {
      reply.code(400)
      return { message: '缺少 entries' }
    }
    appendNotebookAuditEntries(sessionId, body.entries as never[])
    return { ok: true, received: body.entries.length }
  })

  app.post('/api/notebook-agent/sessions/:sessionId/tool-result', async (request, reply) => {
    const user = requireWorkflowUser(request)
    const { sessionId } = request.params as { sessionId: string }
    requireOwnedSession(sessionId, user.id)
    const body = request.body as {
      toolCallId?: string
      result?: {
        content?: Array<{ type: 'text'; text: string }>
        details?: Record<string, unknown>
        isError?: boolean
      }
    }
    if (!body.toolCallId) {
      reply.code(400)
      return { message: '缺少 toolCallId' }
    }
    const ok = finishNotebookAgentToolCall(sessionId, body.toolCallId, {
      content: body.result?.content,
      details: body.result?.details,
      isError: !!body.result?.isError,
    })
    if (!ok) {
      reply.code(404)
      return { message: '会话不存在' }
    }
    return { ok }
  })

  app.delete('/api/notebook-agent/sessions/:sessionId', async (request, reply) => {
    const user = requireWorkflowUser(request)
    const { sessionId } = request.params as { sessionId: string }
    requireOwnedSession(sessionId, user.id)
    const ok = closeNotebookAgentSession(sessionId)
    if (!ok) {
      reply.code(404)
      return { message: '会话不存在' }
    }
    return { ok }
  })
}
