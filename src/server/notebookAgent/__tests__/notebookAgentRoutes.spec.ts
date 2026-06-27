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
  ensureNotebookAgentSessionRecordMock,
  ensureNotebookSessionsRehydratedMock,
  startNdjsonStreamMock,
  switchNotebookAgentModelMock,
  getSystemModelProfilesMock,
  toPublicModelProfileMock,
  testPiAgentRuntimeProfileMock,
  listNotebookUserModelProfilesMock,
  createNotebookUserModelProfileMock,
  updateNotebookUserModelProfileMock,
  deleteNotebookUserModelProfileMock,
  loadWorkspaceSnapshotMock,
  saveWorkspaceSnapshotMock,
  workspaceSnapshotExistsMock,
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
  ensureNotebookAgentSessionRecordMock: vi.fn().mockResolvedValue(null),
  ensureNotebookSessionsRehydratedMock: vi.fn().mockResolvedValue(undefined),
  startNdjsonStreamMock: vi.fn(),
  switchNotebookAgentModelMock: vi.fn(),
  getSystemModelProfilesMock: vi.fn(),
  toPublicModelProfileMock: vi.fn((p: unknown) => p),
  testPiAgentRuntimeProfileMock: vi.fn(),
  listNotebookUserModelProfilesMock: vi.fn().mockResolvedValue([]),
  createNotebookUserModelProfileMock: vi.fn(),
  updateNotebookUserModelProfileMock: vi.fn(),
  deleteNotebookUserModelProfileMock: vi.fn(),
  loadWorkspaceSnapshotMock: vi.fn(),
  saveWorkspaceSnapshotMock: vi.fn(),
  workspaceSnapshotExistsMock: vi.fn(),
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
  ensureNotebookAgentSessionRecord: ensureNotebookAgentSessionRecordMock,
  switchNotebookAgentModel: switchNotebookAgentModelMock,
}))

vi.mock('../../http/ndjson.js', () => ({
  startNdjsonStream: startNdjsonStreamMock,
}))

vi.mock('../sessionPersistence.js', () => ({
  ensureNotebookSessionsRehydrated: ensureNotebookSessionsRehydratedMock,
}))

vi.mock('../../piAgent/modelProfiles.js', () => ({
  getSystemModelProfiles: getSystemModelProfilesMock,
  toPublicModelProfile: toPublicModelProfileMock,
}))

vi.mock('../../piAgent/runtimeFactory.js', () => ({
  testPiAgentRuntimeProfile: testPiAgentRuntimeProfileMock,
}))

vi.mock('../systemPrompt.js', () => ({
  buildNotebookSystemPrompt: vi.fn(() => 'sys'),
}))

vi.mock('../notebookUserModelProfilesStore.js', () => ({
  listNotebookUserModelProfiles: listNotebookUserModelProfilesMock,
  createNotebookUserModelProfile: createNotebookUserModelProfileMock,
  updateNotebookUserModelProfile: updateNotebookUserModelProfileMock,
  deleteNotebookUserModelProfile: deleteNotebookUserModelProfileMock,
}))

vi.mock('../workspaceFileStorage.js', () => ({
  WORKSPACE_SNAPSHOT_LIMIT_BYTES: 50 * 1024 * 1024,
  loadWorkspaceSnapshot: loadWorkspaceSnapshotMock,
  saveWorkspaceSnapshot: saveWorkspaceSnapshotMock,
  workspaceSnapshotExists: workspaceSnapshotExistsMock,
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
  ensureNotebookAgentSessionRecordMock.mockReset().mockResolvedValue(null)
  ensureNotebookSessionsRehydratedMock.mockReset().mockResolvedValue(undefined)
  getNotebookAgentSessionOwnerMock.mockReset()
  updateNotebookAgentSessionTitleMock.mockReset()
  finishNotebookAgentToolCallMock.mockReset()
  destroyNotebookAgentSessionMock.mockReset()
  startNdjsonStreamMock.mockReset()
  switchNotebookAgentModelMock.mockReset()
  getSystemModelProfilesMock.mockReset()
  testPiAgentRuntimeProfileMock.mockReset()
  createNotebookUserModelProfileMock.mockReset()
  updateNotebookUserModelProfileMock.mockReset()
  deleteNotebookUserModelProfileMock.mockReset()
  listNotebookUserModelProfilesMock.mockReset().mockResolvedValue([])
  loadWorkspaceSnapshotMock.mockReset()
  saveWorkspaceSnapshotMock.mockReset()
  workspaceSnapshotExistsMock.mockReset()

  while (apps.length > 0) {
    await apps.pop()!.close()
  }
})

beforeEach(() => {
  getNotebookAgentSessionOwnerMock.mockReturnValue('notebook-route-user')
  loadWorkspaceSnapshotMock.mockResolvedValue(null)
  saveWorkspaceSnapshotMock.mockResolvedValue(undefined)
  workspaceSnapshotExistsMock.mockResolvedValue(false)
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
    expect(ensureNotebookSessionsRehydratedMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'notebook-route-user' }),
    )
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
    ensureNotebookAgentSessionRecordMock.mockResolvedValueOnce({
      sessionId: 'notebook-session-1',
    })
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
    expect(ensureNotebookAgentSessionRecordMock).toHaveBeenCalledWith('notebook-session-1')
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

describe('workspace snapshot routes', () => {
  it('活跃会话 owner 已知时，GET 不触发 rehydrate 并返回 zip 字节', async () => {
    loadWorkspaceSnapshotMock.mockResolvedValueOnce({
      buffer: Buffer.from([0x50, 0x4b, 0x03, 0x04]),
      source: 'local',
    })

    const app = await createTestApp()
    const res = await app.inject({
      method: 'GET',
      url: '/api/notebook-agent/sessions/notebook-session-1/workspace-snapshot',
      headers: userHeaders(),
    })

    expect(res.statusCode).toBe(200)
    expect(ensureNotebookSessionsRehydratedMock).not.toHaveBeenCalled()
    expect(loadWorkspaceSnapshotMock).toHaveBeenCalledWith('notebook-session-1')
    expect(res.headers['content-type']).toContain('application/zip')
    expect(Buffer.from(res.rawPayload)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]))
  })

  it('owner 初次未命中时，HEAD 会回退到 rehydrate 再做存在性探测', async () => {
    getNotebookAgentSessionOwnerMock
      .mockReturnValueOnce(null)
      .mockReturnValueOnce('notebook-route-user')
    workspaceSnapshotExistsMock.mockResolvedValueOnce(true)

    const app = await createTestApp()
    const res = await app.inject({
      method: 'HEAD',
      url: '/api/notebook-agent/sessions/notebook-session-1/workspace-snapshot',
      headers: userHeaders(),
    })

    expect(res.statusCode).toBe(200)
    expect(ensureNotebookSessionsRehydratedMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'notebook-route-user' }),
    )
    expect(workspaceSnapshotExistsMock).toHaveBeenCalledWith('notebook-session-1')
  })

  it('PUT 上传快照时 owner 已知则跳过 rehydrate 并写入存储', async () => {
    const app = await createTestApp()
    const payload = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14])
    const res = await app.inject({
      method: 'PUT',
      url: '/api/notebook-agent/sessions/notebook-session-1/workspace-snapshot',
      headers: {
        ...userHeaders(),
        'content-type': 'application/zip',
      },
      payload,
    })

    expect(res.statusCode).toBe(200)
    expect(ensureNotebookSessionsRehydratedMock).not.toHaveBeenCalled()
    expect(saveWorkspaceSnapshotMock).toHaveBeenCalledWith('notebook-session-1', payload)
  })
})

// ── 模型配置端点 ──────────────────────────────────────────────
const systemProfileFixture = {
  id: 'sys-1',
  name: '内置模型',
  baseUrl: 'https://api.deepseek.com',
  model: 'deepseek-chat',
  apiKey: 'k',
  enabled: true,
  isDefault: true,
  source: 'system' as const,
}
const customProfileFixture = {
  id: 'custom-1',
  name: '我的模型',
  baseUrl: 'https://api.deepseek.com',
  model: 'deepseek-chat',
  apiKey: 'k2',
  enabled: true,
  source: 'custom' as const,
}

describe('GET /api/notebook-agent/model-profiles', () => {
  it('合并后台 + 用户自定义模型并返回（apiKey 经 toPublicModelProfile 处理）', async () => {
    getSystemModelProfilesMock.mockReturnValue([systemProfileFixture])
    listNotebookUserModelProfilesMock.mockResolvedValue([customProfileFixture])

    const app = await createTestApp()
    const res = await app.inject({
      method: 'GET',
      url: '/api/notebook-agent/model-profiles',
      headers: userHeaders(),
    })

    expect(res.statusCode).toBe(200)
    const body = res.json() as { profiles: unknown[] }
    expect(body.profiles).toHaveLength(2)
    expect(getSystemModelProfilesMock).toHaveBeenCalledOnce()
    expect(listNotebookUserModelProfilesMock).toHaveBeenCalledWith('notebook-route-user')
  })
})

describe('POST /api/notebook-agent/model-profiles', () => {
  it('校验通过 → 新增并返回 profile', async () => {
    createNotebookUserModelProfileMock.mockResolvedValueOnce(customProfileFixture)

    const app = await createTestApp()
    const res = await app.inject({
      method: 'POST',
      url: '/api/notebook-agent/model-profiles',
      headers: userHeaders(),
      payload: {
        name: '我的模型',
        baseUrl: 'https://api.deepseek.com',
        model: 'deepseek-chat',
        apiKey: 'k2',
      },
    })

    expect(res.statusCode).toBe(200)
    expect(createNotebookUserModelProfileMock).toHaveBeenCalledWith('notebook-route-user', expect.objectContaining({ name: '我的模型' }))
  })

  it('缺 apiKey → 400', async () => {
    const app = await createTestApp()
    const res = await app.inject({
      method: 'POST',
      url: '/api/notebook-agent/model-profiles',
      headers: userHeaders(),
      payload: { name: 'x', baseUrl: 'https://x', model: 'm', apiKey: '' },
    })
    expect(res.statusCode).toBe(400)
  })
})

describe('PUT /api/notebook-agent/model-profiles/:id', () => {
  it('更新成功返回 profile', async () => {
    updateNotebookUserModelProfileMock.mockResolvedValueOnce(customProfileFixture)
    const app = await createTestApp()
    const res = await app.inject({
      method: 'PUT',
      url: '/api/notebook-agent/model-profiles/custom-1',
      headers: userHeaders(),
      payload: {
        name: '改名',
        baseUrl: 'https://api.deepseek.com',
        model: 'deepseek-chat',
        apiKey: 'k2',
      },
    })
    expect(res.statusCode).toBe(200)
    expect(updateNotebookUserModelProfileMock).toHaveBeenCalledWith('notebook-route-user', 'custom-1', expect.objectContaining({ name: '改名' }))
  })

  it('不存在 → 404', async () => {
    updateNotebookUserModelProfileMock.mockResolvedValueOnce(null)
    const app = await createTestApp()
    const res = await app.inject({
      method: 'PUT',
      url: '/api/notebook-agent/model-profiles/none',
      headers: userHeaders(),
      payload: { name: 'x', baseUrl: 'https://x', model: 'm', apiKey: 'k' },
    })
    expect(res.statusCode).toBe(404)
  })
})

describe('DELETE /api/notebook-agent/model-profiles/:id', () => {
  it('删除成功', async () => {
    deleteNotebookUserModelProfileMock.mockResolvedValueOnce(true)
    const app = await createTestApp()
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/notebook-agent/model-profiles/custom-1',
      headers: userHeaders(),
    })
    expect(res.statusCode).toBe(200)
    expect(deleteNotebookUserModelProfileMock).toHaveBeenCalledWith('notebook-route-user', 'custom-1')
  })

  it('不存在 → 404', async () => {
    deleteNotebookUserModelProfileMock.mockResolvedValueOnce(false)
    const app = await createTestApp()
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/notebook-agent/model-profiles/none',
      headers: userHeaders(),
    })
    expect(res.statusCode).toBe(404)
  })
})

describe('POST /api/notebook-agent/model-profiles/test', () => {
  it('调用 testPiAgentRuntimeProfile 并返回结果', async () => {
    testPiAgentRuntimeProfileMock.mockResolvedValueOnce({ success: true, message: 'ok', latencyMs: 12 })
    const app = await createTestApp()
    const res = await app.inject({
      method: 'POST',
      url: '/api/notebook-agent/model-profiles/test',
      headers: userHeaders(),
      payload: { profile: { baseUrl: 'https://x', model: 'm', apiKey: 'k' } },
    })
    expect(res.statusCode).toBe(200)
    expect(testPiAgentRuntimeProfileMock).toHaveBeenCalledOnce()
  })

  it('缺 profile → 400', async () => {
    const app = await createTestApp()
    const res = await app.inject({
      method: 'POST',
      url: '/api/notebook-agent/model-profiles/test',
      headers: userHeaders(),
      payload: {},
    })
    expect(res.statusCode).toBe(400)
  })
})

describe('POST /api/notebook-agent/sessions/:id/switch-model', () => {
  it('切换成功返回 ok', async () => {
    switchNotebookAgentModelMock.mockResolvedValueOnce({ ok: true })
    const app = await createTestApp()
    const res = await app.inject({
      method: 'POST',
      url: '/api/notebook-agent/sessions/notebook-session-1/switch-model',
      headers: userHeaders(),
      payload: { profileId: 'sys-1' },
    })
    expect(res.statusCode).toBe(200)
    expect(switchNotebookAgentModelMock).toHaveBeenCalledWith('notebook-session-1', 'sys-1')
  })

  it('缺 profileId → 400', async () => {
    const app = await createTestApp()
    const res = await app.inject({
      method: 'POST',
      url: '/api/notebook-agent/sessions/notebook-session-1/switch-model',
      headers: userHeaders(),
      payload: {},
    })
    expect(res.statusCode).toBe(400)
  })

  it('切换失败 → 400', async () => {
    switchNotebookAgentModelMock.mockResolvedValueOnce({ ok: false, error: '不可用' })
    const app = await createTestApp()
    const res = await app.inject({
      method: 'POST',
      url: '/api/notebook-agent/sessions/notebook-session-1/switch-model',
      headers: userHeaders(),
      payload: { profileId: 'gone' },
    })
    expect(res.statusCode).toBe(400)
  })
})
