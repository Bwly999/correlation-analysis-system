// @vitest-environment node
import Fastify, { type FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  createNotebookAgentSessionMock,
  listNotebookAgentSessionsByUserMock,
  sendNotebookAgentMessageMock,
  markNotebookAgentSessionReadyMock,
  injectNotebookSystemMessageMock,
  appendNotebookAuditEntriesMock,
  subscribeNotebookAgentEventsMock,
  getNotebookAgentSessionViewMock,
  getNotebookAgentSessionOwnerMock,
  updateNotebookAgentSessionTitleMock,
  finishNotebookAgentToolCallMock,
  destroyNotebookAgentSessionMock,
  ensureNotebookAgentRuntimeMock,
  startNdjsonStreamMock,
} = vi.hoisted(() => ({
  createNotebookAgentSessionMock: vi.fn(),
  listNotebookAgentSessionsByUserMock: vi.fn(),
  sendNotebookAgentMessageMock: vi.fn(),
  markNotebookAgentSessionReadyMock: vi.fn(),
  injectNotebookSystemMessageMock: vi.fn(),
  appendNotebookAuditEntriesMock: vi.fn(),
  subscribeNotebookAgentEventsMock: vi.fn(),
  getNotebookAgentSessionViewMock: vi.fn(),
  getNotebookAgentSessionOwnerMock: vi.fn(),
  updateNotebookAgentSessionTitleMock: vi.fn(),
  finishNotebookAgentToolCallMock: vi.fn(),
  destroyNotebookAgentSessionMock: vi.fn(),
  ensureNotebookAgentRuntimeMock: vi.fn().mockResolvedValue(true),
  startNdjsonStreamMock: vi.fn(),
}))

vi.mock('../gateway.js', () => ({
  createNotebookAgentSession: createNotebookAgentSessionMock,
  listNotebookAgentSessionsByUser: listNotebookAgentSessionsByUserMock,
  sendNotebookAgentMessage: sendNotebookAgentMessageMock,
  markNotebookAgentSessionReady: markNotebookAgentSessionReadyMock,
  injectNotebookSystemMessage: injectNotebookSystemMessageMock,
  appendNotebookAuditEntries: appendNotebookAuditEntriesMock,
  subscribeNotebookAgentEvents: subscribeNotebookAgentEventsMock,
  getNotebookAgentSessionView: getNotebookAgentSessionViewMock,
  getNotebookAgentSessionOwner: getNotebookAgentSessionOwnerMock,
  updateNotebookAgentSessionTitle: updateNotebookAgentSessionTitleMock,
  finishNotebookAgentToolCall: finishNotebookAgentToolCallMock,
  destroyNotebookAgentSession: destroyNotebookAgentSessionMock,
  ensureNotebookAgentRuntime: ensureNotebookAgentRuntimeMock,
}))

vi.mock('../../http/ndjson.js', () => ({
  startNdjsonStream: startNdjsonStreamMock,
}))

import '../../http/fastify.js'
import { createNotebookAgentRoutes } from '../../modules/notebookAgentRoutes.js'

const apps: FastifyInstance[] = []

const createTestApp = async (options?: { withDefaultUser?: boolean }) => {
  const app = Fastify()
  if (options?.withDefaultUser !== false) {
    app.decorate('serverDependencies', {
      resolveStorageUser: () => ({
        id: 'notebook-route-user',
        name: 'Notebook 路由测试用户',
      }),
    } as any)
  }

  await app.register(createNotebookAgentRoutes())
  await app.ready()
  apps.push(app)
  return app
}

const userHeaders = (userId = 'notebook-route-user') => ({
  'x-workflow-user-id': userId,
  'x-workflow-user-name': 'Notebook 路由测试用户',
})

afterEach(async () => {
  vi.restoreAllMocks()
  createNotebookAgentSessionMock.mockReset()
  listNotebookAgentSessionsByUserMock.mockReset()
  sendNotebookAgentMessageMock.mockReset()
  markNotebookAgentSessionReadyMock.mockReset()
  injectNotebookSystemMessageMock.mockReset()
  appendNotebookAuditEntriesMock.mockReset()
  subscribeNotebookAgentEventsMock.mockReset()
  getNotebookAgentSessionViewMock.mockReset()
  ensureNotebookAgentRuntimeMock.mockReset().mockResolvedValue(true)
  getNotebookAgentSessionOwnerMock.mockReset()
  updateNotebookAgentSessionTitleMock.mockReset()
  finishNotebookAgentToolCallMock.mockReset()
  destroyNotebookAgentSessionMock.mockReset()
  startNdjsonStreamMock.mockReset()

  while (apps.length > 0) {
    await apps.pop()!.close()
  }
})

beforeEach(() => {
  getNotebookAgentSessionOwnerMock.mockReturnValue('notebook-route-user')
})

describe('POST /api/notebook-agent/sessions', () => {
  it('返回 sessionId + systemPrompt 字段', async () => {
    createNotebookAgentSessionMock.mockResolvedValueOnce({
      sessionId: 'notebook-session-1',
      systemPrompt: '你是一名资深数据分析师。\n## 工作循环',
    })

    const app = await createTestApp()
    const res = await app.inject({
      method: 'POST',
      url: '/api/notebook-agent/sessions',
      payload: {
        initialDataMeta: {
          sourceKind: 'canvas-node',
          sourceLabel: 'cleanup',
          rowCount: 100,
          columnCount: 4,
        },
        origin: 'http://localhost:5173',
      },
      headers: userHeaders(),
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as { sessionId: string; systemPrompt: string }
    expect(body.sessionId).toBe('notebook-session-1')
    expect(body.systemPrompt).toMatch(/工作循环|分析师/)
  })

  it('缺 initialDataMeta → 视为空白笔记本，正常建会话', async () => {
    createNotebookAgentSessionMock.mockResolvedValueOnce({
      sessionId: 'notebook-session-blank',
      systemPrompt: '你是一名资深数据分析师。',
    })
    const app = await createTestApp()
    const res = await app.inject({
      method: 'POST',
      url: '/api/notebook-agent/sessions',
      payload: { origin: 'http://localhost:5173' },
      headers: userHeaders(),
    })
    expect(res.statusCode).toBe(200)
    expect(createNotebookAgentSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({ initialDataMeta: undefined }),
    )
  })

  it('initialDataMeta 存在但非法 → 400', async () => {
    const app = await createTestApp()
    const res = await app.inject({
      method: 'POST',
      url: '/api/notebook-agent/sessions',
      payload: { initialDataMeta: { sourceKind: 'canvas-node' }, origin: 'http://localhost' },
      headers: userHeaders(),
    })
    expect(res.statusCode).toBe(400)
  })

  it('未带身份头 → 400', async () => {
    const app = await createTestApp({ withDefaultUser: false })
    const res = await app.inject({
      method: 'POST',
      url: '/api/notebook-agent/sessions',
      payload: {
        initialDataMeta: {
          sourceKind: 'canvas-node',
          sourceLabel: '',
          rowCount: 0,
          columnCount: 0,
        },
        origin: 'http://localhost',
      },
    })
    expect(res.statusCode).toBe(400)
  })
})

describe('GET /api/notebook-agent/sessions/:id', () => {
  it('返回 session 概览', async () => {
    getNotebookAgentSessionViewMock.mockReturnValueOnce({
      sessionId: 'notebook-session-1',
      status: 'idle',
      messages: [],
      toolCalls: [],
      initialDataMeta: {
        sourceKind: 'canvas-node',
        sourceLabel: 'x',
        rowCount: 1,
        columnCount: 1,
      },
      origin: 'http://localhost',
      createdAt: 1,
      updatedAt: 1,
    })

    const app = await createTestApp()
    const res = await app.inject({
      method: 'GET',
      url: '/api/notebook-agent/sessions/notebook-session-1',
      headers: userHeaders(),
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as { sessionId: string; status: string; messages: unknown[] }
    expect(body.sessionId).toBe('notebook-session-1')
    expect(body.status).toBe('idle')
    expect(body.messages).toEqual([])
  })

  it('不存在 → 404', async () => {
    getNotebookAgentSessionOwnerMock.mockReturnValueOnce(null)
    const app = await createTestApp()
    const res = await app.inject({
      method: 'GET',
      url: '/api/notebook-agent/sessions/no-such-id',
      headers: userHeaders(),
    })
    expect(res.statusCode).toBe(404)
  })

  it('其他用户访问 → 403', async () => {
    getNotebookAgentSessionOwnerMock.mockReturnValueOnce('alice')
    const app = await createTestApp()
    const res = await app.inject({
      method: 'GET',
      url: '/api/notebook-agent/sessions/notebook-session-1',
      headers: userHeaders('bob'),
    })
    expect(res.statusCode).toBe(403)
  })
})

describe('GET /api/notebook-agent/sessions', () => {
  it('返回当前用户最近会话列表', async () => {
    listNotebookAgentSessionsByUserMock.mockReturnValueOnce([
      {
        sessionId: 'notebook-session-1',
        title: '销量分析',
        initialDataMeta: {
          sourceKind: 'canvas-node',
          sourceLabel: '清洗-Q2',
          rowCount: 100,
          columnCount: 4,
        },
        status: 'idle',
        archivedAt: 123,
        createdAt: 1,
        updatedAt: 2,
        messageCount: 3,
        lastUserMessagePreview: '看下销量',
      },
    ])

    const app = await createTestApp()
    const res = await app.inject({
      method: 'GET',
      url: '/api/notebook-agent/sessions',
      headers: userHeaders(),
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({
      sessions: [
        expect.objectContaining({
          sessionId: 'notebook-session-1',
          title: '销量分析',
          lastUserMessagePreview: '看下销量',
        }),
      ],
    })
  })
})

describe('GET /api/notebook-agent/sessions/:id/events', () => {
  it('调用 ndjson stream 并订阅 notebook 事件', async () => {
    getNotebookAgentSessionViewMock.mockReturnValueOnce({
      sessionId: 'notebook-session-1',
      status: 'idle',
    })
    subscribeNotebookAgentEventsMock.mockImplementationOnce((_sessionId, write) => {
      write({ type: 'message', content: 'hello' })
      return () => undefined
    })
    startNdjsonStreamMock.mockImplementationOnce((raw, subscribe) => {
      const writes: unknown[] = []
      const unsubscribe = subscribe((event: unknown) => {
        writes.push(event)
      })
      unsubscribe?.()
      raw.end()
    })

    const app = await createTestApp()
    const response = await app.inject({
      method: 'GET',
      url: '/api/notebook-agent/sessions/notebook-session-1/events',
      headers: userHeaders(),
    })

    expect(response.statusCode).toBe(200)
    expect(startNdjsonStreamMock).toHaveBeenCalledOnce()
    expect(subscribeNotebookAgentEventsMock).toHaveBeenCalledWith(
      'notebook-session-1',
      expect.any(Function),
    )
  })
})

describe('POST /api/notebook-agent/sessions/:id/messages', () => {
  it('转发用户消息给 gateway', async () => {
    sendNotebookAgentMessageMock.mockResolvedValueOnce(true)

    const app = await createTestApp()
    const response = await app.inject({
      method: 'POST',
      url: '/api/notebook-agent/sessions/notebook-session-1/messages',
      payload: { id: 'msg-1', content: '继续分析' },
      headers: userHeaders(),
    })

    expect(response.statusCode).toBe(200)
    expect(sendNotebookAgentMessageMock).toHaveBeenCalledWith('notebook-session-1', {
      id: 'msg-1',
      content: '继续分析',
    })
  })
})

describe('POST /api/notebook-agent/sessions/:id/ready', () => {
  it('通知 gateway 当前会话数据已导入完成', async () => {
    markNotebookAgentSessionReadyMock.mockReturnValueOnce(true)

    const app = await createTestApp()
    const response = await app.inject({
      method: 'POST',
      url: '/api/notebook-agent/sessions/notebook-session-1/ready',
      headers: userHeaders(),
    })

    expect(response.statusCode).toBe(200)
    expect(markNotebookAgentSessionReadyMock).toHaveBeenCalledWith('notebook-session-1')
  })

  it('会话不存在时返回 404', async () => {
    markNotebookAgentSessionReadyMock.mockReturnValueOnce(false)

    const app = await createTestApp()
    const response = await app.inject({
      method: 'POST',
      url: '/api/notebook-agent/sessions/notebook-session-1/ready',
      headers: userHeaders(),
    })

    expect(response.statusCode).toBe(404)
  })
})

describe('POST /api/notebook-agent/sessions/:id/system-message', () => {
  it('把环境变更通知透传给 gateway', async () => {
    injectNotebookSystemMessageMock.mockResolvedValueOnce(true)

    const app = await createTestApp()
    const response = await app.inject({
      method: 'POST',
      url: '/api/notebook-agent/sessions/notebook-session-1/system-message',
      headers: userHeaders(),
      payload: { message: 'Python 运行时已重启' },
    })

    expect(response.statusCode).toBe(200)
    expect(injectNotebookSystemMessageMock).toHaveBeenCalledWith(
      'notebook-session-1',
      'Python 运行时已重启',
    )
  })

  it('缺少 message → 400', async () => {
    const app = await createTestApp()
    const response = await app.inject({
      method: 'POST',
      url: '/api/notebook-agent/sessions/notebook-session-1/system-message',
      headers: userHeaders(),
      payload: {},
    })

    expect(response.statusCode).toBe(400)
    expect(injectNotebookSystemMessageMock).not.toHaveBeenCalled()
  })

  it('gateway 返回 false（会话不存在或注入失败）→ 404', async () => {
    injectNotebookSystemMessageMock.mockResolvedValueOnce(false)

    const app = await createTestApp()
    const response = await app.inject({
      method: 'POST',
      url: '/api/notebook-agent/sessions/notebook-session-1/system-message',
      headers: userHeaders(),
      payload: { message: 'Python 运行时已重启' },
    })

    expect(response.statusCode).toBe(404)
  })
})

describe('POST /api/notebook-agent/sessions/:id/title', () => {
  it('更新会话标题', async () => {
    updateNotebookAgentSessionTitleMock.mockReturnValueOnce(true)

    const app = await createTestApp()
    const response = await app.inject({
      method: 'POST',
      url: '/api/notebook-agent/sessions/notebook-session-1/title',
      headers: userHeaders(),
      payload: { title: '销量分析' },
    })

    expect(response.statusCode).toBe(200)
    expect(updateNotebookAgentSessionTitleMock).toHaveBeenCalledWith(
      'notebook-session-1',
      '销量分析',
    )
  })

  it('缺少 title 时返回 400', async () => {
    const app = await createTestApp()
    const response = await app.inject({
      method: 'POST',
      url: '/api/notebook-agent/sessions/notebook-session-1/title',
      headers: userHeaders(),
      payload: {},
    })

    expect(response.statusCode).toBe(400)
    expect(updateNotebookAgentSessionTitleMock).not.toHaveBeenCalled()
  })
})

describe('POST /api/notebook-agent/sessions/:id/audit', () => {
  it('把审计条目透传给 gateway，回执含 received 数', async () => {
    const app = await createTestApp()
    const response = await app.inject({
      method: 'POST',
      url: '/api/notebook-agent/sessions/notebook-session-1/audit',
      headers: userHeaders(),
      payload: {
        entries: [
          { ts: 't1', kind: 'worker_restart', reason: 'hard_timeout' },
          { ts: 't2', kind: 'tool_error', tool: 'python_exec_inline', code: 'exec_error' },
        ],
      },
    })

    expect(response.statusCode).toBe(200)
    expect(appendNotebookAuditEntriesMock).toHaveBeenCalledTimes(1)
    expect(appendNotebookAuditEntriesMock.mock.calls[0]![0]).toBe('notebook-session-1')
    expect(appendNotebookAuditEntriesMock.mock.calls[0]![1]).toHaveLength(2)
    const body = JSON.parse(response.body)
    expect(body.received).toBe(2)
  })

  it('缺少 entries → 400', async () => {
    const app = await createTestApp()
    const response = await app.inject({
      method: 'POST',
      url: '/api/notebook-agent/sessions/notebook-session-1/audit',
      headers: userHeaders(),
      payload: {},
    })

    expect(response.statusCode).toBe(400)
    expect(appendNotebookAuditEntriesMock).not.toHaveBeenCalled()
  })

  it('entries 为空数组 → 200（不调 gateway，避免无意义调用）', async () => {
    // gateway.appendNotebookAuditEntries 内部已判空，端点仍允许空数组通过
    const app = await createTestApp()
    const response = await app.inject({
      method: 'POST',
      url: '/api/notebook-agent/sessions/notebook-session-1/audit',
      headers: userHeaders(),
      payload: { entries: [] },
    })

    expect(response.statusCode).toBe(200)
  })
})

describe('POST /api/notebook-agent/sessions/:id/tool-result', () => {
  it('把工具结果回传给 gateway', async () => {
    finishNotebookAgentToolCallMock.mockReturnValueOnce(true)

    const app = await createTestApp()
    const response = await app.inject({
      method: 'POST',
      url: '/api/notebook-agent/sessions/notebook-session-1/tool-result',
      payload: {
        toolCallId: 'tool-1',
        result: {
          content: [{ type: 'text', text: 'ok' }],
          details: { status: 'ok' },
          isError: false,
        },
      },
      headers: userHeaders(),
    })

    expect(response.statusCode).toBe(200)
    expect(finishNotebookAgentToolCallMock).toHaveBeenCalledWith('notebook-session-1', 'tool-1', {
      content: [{ type: 'text', text: 'ok' }],
      details: { status: 'ok' },
      isError: false,
    })
  })
})

describe('DELETE /api/notebook-agent/sessions/:id', () => {
  it('彻底删除会话并返回 ok', async () => {
    destroyNotebookAgentSessionMock.mockReturnValueOnce(true)

    const app = await createTestApp()
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/notebook-agent/sessions/notebook-session-1',
      headers: userHeaders(),
    })

    expect(res.statusCode).toBe(200)
    expect(destroyNotebookAgentSessionMock).toHaveBeenCalledWith('notebook-session-1')
  })
})
