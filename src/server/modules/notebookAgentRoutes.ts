/**
 * Notebook Agent HTTP 路由（M1 最小骨架）。
 *
 * 端点：
 *   POST   /api/notebook-agent/sessions                  创建 session + 返回 systemPrompt
 *   GET    /api/notebook-agent/sessions                  列出当前用户最近会话（用于「继续上次分析」）
 *   GET    /api/notebook-agent/sessions/:sessionId       拿 session 概览（含 messages/toolCalls，供历史回放）
 *   GET    /api/notebook-agent/sessions/:sessionId/events NDJSON 事件流
 *   POST   /api/notebook-agent/sessions/:sessionId/resume 恢复已归档会话（重建 runtime）
 *   POST   /api/notebook-agent/sessions/:sessionId/messages
 *   POST   /api/notebook-agent/sessions/:sessionId/abort    终止当前轮 Agent 推理
 *   POST   /api/notebook-agent/sessions/:sessionId/compact  手动触发上下文压缩
 *   POST   /api/notebook-agent/sessions/:sessionId/tool-result
 *   PUT    /api/notebook-agent/sessions/:sessionId/workspace-snapshot  上传 workspace zip 快照（≤50MB）
 *   GET    /api/notebook-agent/sessions/:sessionId/workspace-snapshot  下载 workspace zip 快照
 *   HEAD   /api/notebook-agent/sessions/:sessionId/workspace-snapshot  探测快照是否存在
 *   DELETE /api/notebook-agent/sessions/:sessionId       彻底删除会话（runtime + record + 审计 + 文件快照）
 */

import type { FastifyPluginAsync } from 'fastify'
import { requireWorkflowUser, type WorkflowRequestUser } from '../http/workflowUser.js'
import { startNdjsonStream } from '../http/ndjson.js'
import { assertSessionOwner } from '../piAgent/sessionAccess.js'
import {
  appendNotebookAuditEntries,
  compactNotebookAgentSession,
  createNotebookAgentSession,
  destroyNotebookAgentSession,
  ensureNotebookAgentSessionRecord,
  ensureNotebookAgentRuntime,
  finishNotebookAgentToolCall,
  getNotebookAgentSessionOwner,
  getNotebookAgentSessionView,
  injectNotebookSystemMessage,
  listNotebookAgentSessionsByUser,
  markNotebookAgentSessionReady,
  sendNotebookAgentMessage,
  abortNotebookAgentSession,
  subscribeNotebookAgentEvents,
  updateNotebookAgentSessionTitle,
} from '../notebookAgent/gateway.js'
import type { ImportCsvMeta } from '../../notebook/shared/parentBridge.js'
import { ensureNotebookSessionsRehydrated } from '../notebookAgent/sessionPersistence.js'
import {
  WORKSPACE_SNAPSHOT_LIMIT_BYTES,
  loadWorkspaceSnapshot,
  saveWorkspaceSnapshot,
  workspaceSnapshotExists,
} from '../notebookAgent/workspaceFileStorage.js'

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
  const verifyOwnedSession = async (
    sessionId: string,
    userId: string,
    workflowUser: WorkflowRequestUser,
  ) => {
    await ensureNotebookSessionsRehydrated(workflowUser)
    await ensureNotebookAgentSessionRecord(sessionId)
    assertSessionOwner({
      sessionId,
      currentUserId: userId,
      resolveOwnerId: getNotebookAgentSessionOwner,
      missingMessage: '未找到 Notebook Agent 会话',
      forbiddenMessage: '无权访问该 Notebook Agent 会话',
    })
  }

  app.post('/api/notebook-agent/sessions', async (request, reply) => {
    const user = requireWorkflowUser(request)
    const body = request.body as {
      initialDataMeta?: unknown
      origin?: string
    }
    // 缺失 initialDataMeta = 空白笔记本（不导入数据直接进入）；存在则必须合法
    let validatedMeta: ImportCsvMeta | undefined
    if (body.initialDataMeta !== undefined) {
      if (!validateImportCsvMeta(body.initialDataMeta)) {
        reply.code(400)
        return { message: 'initialDataMeta 非法' }
      }
      validatedMeta = body.initialDataMeta
    }
    const result = await createNotebookAgentSession({
      userId: user.id,
      initialDataMeta: validatedMeta,
      origin: typeof body.origin === 'string' ? body.origin : '',
    })
    return result
  })

  // 列出当前用户最近的 notebook 会话（用于「继续上次分析」入口探测）
  app.get('/api/notebook-agent/sessions', async (request) => {
    const user = requireWorkflowUser(request)
    await ensureNotebookSessionsRehydrated(user)
    const sessions = listNotebookAgentSessionsByUser(user.id)
    return { sessions }
  })

  app.get('/api/notebook-agent/sessions/:sessionId', async (request, reply) => {
    const user = requireWorkflowUser(request)
    const { sessionId } = request.params as { sessionId: string }
    await verifyOwnedSession(sessionId, user.id, user)
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
    await verifyOwnedSession(sessionId, user.id, user)
    const view = getNotebookAgentSessionView(sessionId)
    if (!view) {
      reply.code(404)
      return { message: '未找到 Notebook Agent 会话' }
    }

    // resume 场景：runtime 可能已被软关闭释放，订阅前确保 runtime 在线。
    // record 存在但 runtime 不在时重建（保留历史 messages）。
    await ensureNotebookAgentRuntime(sessionId)

    reply.hijack()
    startNdjsonStream(reply.raw, (write) => {
      const unsubscribe = subscribeNotebookAgentEvents(sessionId, write)
      return () => unsubscribe?.()
    })
    return reply
  })

  // 显式恢复已归档会话（重建 runtime，保留历史 record）。
  // 刷新页面后前端「继续上次分析」会调用，随后再订阅 events 流。
  app.post('/api/notebook-agent/sessions/:sessionId/resume', async (request, reply) => {
    const user = requireWorkflowUser(request)
    const { sessionId } = request.params as { sessionId: string }
    await verifyOwnedSession(sessionId, user.id, user)
    const ok = await ensureNotebookAgentRuntime(sessionId)
    if (!ok) {
      reply.code(404)
      return { message: '未找到 Notebook Agent 会话' }
    }
    return { ok: true }
  })

  app.post('/api/notebook-agent/sessions/:sessionId/messages', async (request, reply) => {
    const user = requireWorkflowUser(request)
    const { sessionId } = request.params as { sessionId: string }
    await verifyOwnedSession(sessionId, user.id, user)
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

  app.post('/api/notebook-agent/sessions/:sessionId/abort', async (request, reply) => {
    const user = requireWorkflowUser(request)
    const { sessionId } = request.params as { sessionId: string }
    await verifyOwnedSession(sessionId, user.id, user)
    const result = await abortNotebookAgentSession(sessionId)
    if (!result.ok) {
      reply.code(404)
      return { message: result.error ?? '会话不存在' }
    }
    return { ok: true }
  })

  // 手动触发上下文压缩（SDK 用 LLM 总结早期对话）。
  // 压缩过程的 compaction_start/end 事件会经 events 流推给前端。
  app.post('/api/notebook-agent/sessions/:sessionId/compact', async (request, reply) => {
    const user = requireWorkflowUser(request)
    const { sessionId } = request.params as { sessionId: string }
    await verifyOwnedSession(sessionId, user.id, user)
    const body = (request.body as { customInstructions?: string }) ?? {}
    const result = await compactNotebookAgentSession(
      sessionId,
      typeof body.customInstructions === 'string' ? body.customInstructions : undefined,
    )
    if (!result.ok) {
      reply.code(404)
      return { message: result.error ?? '会话不存在' }
    }
    return { ok: true }
  })

  app.post('/api/notebook-agent/sessions/:sessionId/ready', async (request, reply) => {
    const user = requireWorkflowUser(request)
    const { sessionId } = request.params as { sessionId: string }
    await verifyOwnedSession(sessionId, user.id, user)
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
    await verifyOwnedSession(sessionId, user.id, user)
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

  app.post('/api/notebook-agent/sessions/:sessionId/title', async (request, reply) => {
    const user = requireWorkflowUser(request)
    const { sessionId } = request.params as { sessionId: string }
    await verifyOwnedSession(sessionId, user.id, user)
    const body = request.body as { title?: string }
    const title = typeof body.title === 'string' ? body.title.trim() : ''
    if (!title) {
      reply.code(400)
      return { message: '缺少 title' }
    }
    const ok = updateNotebookAgentSessionTitle(sessionId, title)
    if (!ok) {
      reply.code(404)
      return { message: '会话不存在' }
    }
    return { ok: true }
  })

  app.post('/api/notebook-agent/sessions/:sessionId/audit', async (request, reply) => {
    const user = requireWorkflowUser(request)
    const { sessionId } = request.params as { sessionId: string }
    await verifyOwnedSession(sessionId, user.id, user)
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
    await verifyOwnedSession(sessionId, user.id, user)
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
    await verifyOwnedSession(sessionId, user.id, user)
    const ok = destroyNotebookAgentSession(sessionId)
    if (!ok) {
      reply.code(404)
      return { message: '会话不存在' }
    }
    return { ok }
  })

  // ── workspace 文件快照（浏览器优先 + 服务端降级兜底）──────────────────
  // 包进独立子插件：addContentTypeParser + bodyLimit 的作用域被封装在此处，
  // 不污染主 app 的其它 application/zip 请求（fastify encapsulation）。
  // bodyLimit 单独提到 50MB（全局是 20MB），与前端 SINGLE_WRITE_LIMIT_BYTES 对齐。
  void app.register(
    async (subApp) => {
      subApp.addContentTypeParser(
        'application/zip',
        { parseAs: 'buffer' },
        (_req, body, done) => done(null, body),
      )

      subApp.put(
        '/api/notebook-agent/sessions/:sessionId/workspace-snapshot',
        async (request, reply) => {
          const user = requireWorkflowUser(request)
          const { sessionId } = request.params as { sessionId: string }
          await verifyOwnedSession(sessionId, user.id, user)
          const buffer = request.body
          if (!Buffer.isBuffer(buffer)) {
            reply.code(400)
            return { message: '请求体必须是 application/zip 二进制' }
          }
          if (buffer.byteLength > WORKSPACE_SNAPSHOT_LIMIT_BYTES) {
            reply.code(413)
            return { message: `workspace 快照超过 ${WORKSPACE_SNAPSHOT_LIMIT_BYTES} 字节上限` }
          }
          await saveWorkspaceSnapshot(sessionId, buffer)
          return { ok: true, bytes: buffer.byteLength }
        },
      )

      // exposeHeadRoute: false —— 关掉 fastify 给 GET 自动生成 HEAD 的默认行为，
      // 改用下面显式注册的轻量 HEAD（只探测存在性，不读/返回快照字节）。
      subApp.get(
        '/api/notebook-agent/sessions/:sessionId/workspace-snapshot',
        { exposeHeadRoute: false },
        async (request, reply) => {
          const user = requireWorkflowUser(request)
          const { sessionId } = request.params as { sessionId: string }
          await verifyOwnedSession(sessionId, user.id, user)
          const snapshot = await loadWorkspaceSnapshot(sessionId)
          if (!snapshot) {
            reply.code(404)
            return { message: '该会话暂无 workspace 快照' }
          }
          reply.header('Content-Type', 'application/zip')
          reply.header('Content-Length', String(snapshot.buffer.byteLength))
          return reply.send(snapshot.buffer)
        },
      )

      subApp.head(
        '/api/notebook-agent/sessions/:sessionId/workspace-snapshot',
        async (request, reply) => {
          const user = requireWorkflowUser(request)
          const { sessionId } = request.params as { sessionId: string }
          await verifyOwnedSession(sessionId, user.id, user)
          const exists = await workspaceSnapshotExists(sessionId)
          reply.code(exists ? 200 : 404)
          return reply
        },
      )
    },
    { bodyLimit: WORKSPACE_SNAPSHOT_LIMIT_BYTES },
  )
}
