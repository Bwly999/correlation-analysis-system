// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  createAgentSessionMock,
  sessionPromptMock,
  sessionSubscribeMock,
  sessionDisposeMock,
  loaderReloadMock,
  sessionManagerCreateMock,
  sessionManagerOpenMock,
  buildModelFromProfileMock,
  createModelRegistryFromProfileMock,
  createModelRegistryFromProfilesMock,
  createPiAgentResourceLoaderMock,
  persistNotebookSessionMetaMock,
  persistNotebookSessionMessageMock,
  persistNotebookSessionToolCallMock,
  persistNotebookSessionTitleMock,
  ensureNotebookSessionsRehydratedMock,
  loadNotebookSessionRecordMock,
  listPersistedNotebookSessionsByUserMock,
  getPersistedNotebookSessionOwnerMock,
  listNotebookUserModelProfilesMock,
} = vi.hoisted(() => ({
  createAgentSessionMock: vi.fn(),
  sessionPromptMock: vi.fn(),
  sessionSubscribeMock: vi.fn(),
  sessionDisposeMock: vi.fn(),
  loaderReloadMock: vi.fn(),
  sessionManagerCreateMock: vi.fn(),
  sessionManagerOpenMock: vi.fn(),
  buildModelFromProfileMock: vi.fn(),
  createModelRegistryFromProfileMock: vi.fn(),
  createModelRegistryFromProfilesMock: vi.fn(),
  createPiAgentResourceLoaderMock: vi.fn(),
  persistNotebookSessionMetaMock: vi.fn(),
  persistNotebookSessionMessageMock: vi.fn(),
  persistNotebookSessionToolCallMock: vi.fn(),
  persistNotebookSessionTitleMock: vi.fn(),
  ensureNotebookSessionsRehydratedMock: vi.fn(),
  loadNotebookSessionRecordMock: vi.fn(),
  listPersistedNotebookSessionsByUserMock: vi.fn(),
  getPersistedNotebookSessionOwnerMock: vi.fn(),
  listNotebookUserModelProfilesMock: vi.fn(),
}))

vi.mock('@earendil-works/pi-coding-agent', () => ({
  createAgentSession: createAgentSessionMock,
  SessionManager: {
    create: sessionManagerCreateMock,
    open: sessionManagerOpenMock,
  },
  defineTool: vi.fn((config) => config),
}))

vi.mock('../../piAgent/runtimeFactory.js', () => ({
  buildModelFromProfile: buildModelFromProfileMock,
  createModelRegistryFromProfile: createModelRegistryFromProfileMock,
  createModelRegistryFromProfiles: createModelRegistryFromProfilesMock,
  createPiAgentResourceLoader: createPiAgentResourceLoaderMock,
}))

vi.mock('../notebookUserModelProfilesStore.js', () => ({
  listNotebookUserModelProfiles: listNotebookUserModelProfilesMock,
}))

vi.mock('../sessionPersistence.js', () => ({
  ensureNotebookSessionsRehydrated: ensureNotebookSessionsRehydratedMock,
  ensureNotebookSessionDir: vi.fn(() => '/tmp/notebook-agent-sessions'),
  persistNotebookSessionMeta: persistNotebookSessionMetaMock,
  persistNotebookSessionMessage: persistNotebookSessionMessageMock,
  persistNotebookSessionToolCall: persistNotebookSessionToolCallMock,
  persistNotebookSessionTitle: persistNotebookSessionTitleMock,
  resolveNotebookSessionDir: vi.fn(() => '/tmp/notebook-agent-sessions'),
  getPersistedNotebookSessionOwner: getPersistedNotebookSessionOwnerMock,
  listPersistedNotebookSessionsByUser: listPersistedNotebookSessionsByUserMock,
  loadNotebookSessionRecord: loadNotebookSessionRecordMock,
  syncNotebookSessionFileToS3: vi.fn(),
  deleteNotebookSessionFileFromPersistence: vi.fn(),
  deletePersistedNotebookSession: vi.fn().mockReturnValue(true),
}))

import {
  closeNotebookAgentSession,
  createNotebookAgentSession,
  getNotebookAgentSessionView,
  listNotebookAgentSessionsByUser,
  markNotebookAgentSessionReady,
  sendNotebookAgentMessage,
  subscribeNotebookAgentEvents,
  updateNotebookAgentSessionTitle,
  ensureNotebookAgentRuntime,
} from '../gateway.js'
import { __resetNotebookSessionsForTest } from '../sessionStore.js'

let testSessionManager: {
  type: string
  getSessionFile: () => string
  getSessionName: () => string | undefined
}

describe('notebookAgent gateway', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    __resetNotebookSessionsForTest()
    testSessionManager = {
      type: 'persistent-session-manager',
      getSessionFile: () => '/tmp/test-session.jsonl',
      getSessionName: () => undefined,
    }
    sessionManagerCreateMock.mockReturnValue(testSessionManager)
    sessionManagerOpenMock.mockReturnValue(testSessionManager)
    buildModelFromProfileMock.mockReturnValue({
      id: 'glm-4.7',
      provider: 'openai',
      contextWindow: 128000,
      maxTokens: 15000,
    })
    createModelRegistryFromProfileMock.mockReturnValue({
      authStorage: { kind: 'auth' },
      modelRegistry: { kind: 'registry' },
    })
    // createModelRegistryFromProfiles：返回带 models Map + profileMap 的结构，
    // Map 内含一个默认模型（与 getSystemModelProfiles 的兜底 id 对齐）。
    const defaultModel = { id: 'glm-4.7', provider: 'openai', contextWindow: 128000, maxTokens: 15000 }
    const defaultProfile = {
      id: 'system-default-zhipu-glm-4-7',
      name: '默认智谱 GLM-4.7',
      baseUrl: 'https://open.bigmodel.cn/api/coding/paas/v4',
      model: 'glm-4.7',
      apiKey: 'k',
      enabled: true,
      isDefault: true,
      source: 'system' as const,
    }
    createModelRegistryFromProfilesMock.mockReturnValue({
      authStorage: { kind: 'auth' },
      modelRegistry: { kind: 'registry' },
      models: new Map([['system-default-zhipu-glm-4-7', defaultModel]]),
      profileMap: new Map([['system-default-zhipu-glm-4-7', defaultProfile]]),
    })
    listNotebookUserModelProfilesMock.mockResolvedValue([])
    createPiAgentResourceLoaderMock.mockReturnValue({
      reload: loaderReloadMock,
    })
    ensureNotebookSessionsRehydratedMock.mockResolvedValue(undefined)
    listPersistedNotebookSessionsByUserMock.mockImplementation(() => [])
    getPersistedNotebookSessionOwnerMock.mockImplementation(() => 'notebook-route-user')
    loadNotebookSessionRecordMock.mockResolvedValue(null)
    loaderReloadMock.mockResolvedValue(undefined)
    createAgentSessionMock.mockResolvedValue({
      session: {
        prompt: sessionPromptMock,
        subscribe: sessionSubscribeMock,
        dispose: sessionDisposeMock,
        sessionManager: testSessionManager,
      },
    })
    sessionSubscribeMock.mockReturnValue(() => {})
  })

  it('创建会话后返回 systemPrompt 并初始化 SDK session', async () => {
    const result = await createNotebookAgentSession({
      userId: 'u-1',
      origin: 'http://localhost:5173',
      initialDataMeta: {
        sourceKind: 'canvas-node',
        sourceLabel: '清洗-Q2',
        rowCount: 123,
        columnCount: 4,
      },
    })

    expect(result.sessionId).toBeTruthy()
    expect(result.systemPrompt).toContain('工作循环')
    expect(createAgentSessionMock).toHaveBeenCalledOnce()
    expect(loaderReloadMock).toHaveBeenCalledOnce()
    expect(persistNotebookSessionMetaMock).toHaveBeenCalled()
    expect(persistNotebookSessionTitleMock).toHaveBeenCalled()
  })

  it('仅订阅事件流时不会自动触发首轮 bootstrap prompt', async () => {
    const created = await createNotebookAgentSession({
      userId: 'u-1',
      origin: 'http://localhost:5173',
      initialDataMeta: {
        sourceKind: 'canvas-node',
        sourceLabel: '清洗-Q2',
        rowCount: 123,
        columnCount: 4,
      },
    })

    const unsubscribe = subscribeNotebookAgentEvents(created.sessionId, () => undefined)
    expect(unsubscribe).toBeTypeOf('function')
    await Promise.resolve()
    await Promise.resolve()
    expect(sessionPromptMock).not.toHaveBeenCalled()
  })

  it('先订阅事件流，收到 session ready 后才触发首轮 bootstrap prompt', async () => {
    const created = await createNotebookAgentSession({
      userId: 'u-1',
      origin: 'http://localhost:5173',
      initialDataMeta: {
        sourceKind: 'canvas-node',
        sourceLabel: '清洗-Q2',
        rowCount: 123,
        columnCount: 4,
      },
    })

    const unsubscribe = subscribeNotebookAgentEvents(created.sessionId, () => undefined)
    expect(unsubscribe).toBeTypeOf('function')
    expect(sessionPromptMock).not.toHaveBeenCalled()

    const ok = markNotebookAgentSessionReady(created.sessionId)
    expect(ok).toBe(true)

    await vi.waitFor(() => {
      expect(sessionPromptMock).toHaveBeenCalledWith(
        '请先开始需求澄清：用 grill-me 风格向用户提 1-3 个最关键的问题，然后再写 todo_write 计划。',
      )
    })
  })

  it('先收到 session ready，再订阅事件流时才触发 bootstrap prompt', async () => {
    const created = await createNotebookAgentSession({
      userId: 'u-1',
      origin: 'http://localhost:5173',
      initialDataMeta: {
        sourceKind: 'canvas-node',
        sourceLabel: '清洗-Q2',
        rowCount: 123,
        columnCount: 4,
      },
    })

    const ok = markNotebookAgentSessionReady(created.sessionId)
    expect(ok).toBe(true)
    expect(sessionPromptMock).not.toHaveBeenCalled()

    const unsubscribe = subscribeNotebookAgentEvents(created.sessionId, () => undefined)
    expect(unsubscribe).toBeTypeOf('function')

    await vi.waitFor(() => {
      expect(sessionPromptMock).toHaveBeenCalledWith(
        '请先开始需求澄清：用 grill-me 风格向用户提 1-3 个最关键的问题，然后再写 todo_write 计划。',
      )
    })
  })

  it('重复收到 session ready 时不会重复触发 bootstrap prompt', async () => {
    const created = await createNotebookAgentSession({
      userId: 'u-1',
      origin: 'http://localhost:5173',
      initialDataMeta: {
        sourceKind: 'canvas-node',
        sourceLabel: '清洗-Q2',
        rowCount: 123,
        columnCount: 4,
      },
    })

    subscribeNotebookAgentEvents(created.sessionId, () => undefined)

    expect(markNotebookAgentSessionReady(created.sessionId)).toBe(true)
    await vi.waitFor(() => {
      expect(sessionPromptMock).toHaveBeenCalledTimes(1)
    })

    expect(markNotebookAgentSessionReady(created.sessionId)).toBe(true)
    await Promise.resolve()
    await Promise.resolve()
    expect(sessionPromptMock).toHaveBeenCalledTimes(1)
  })

  it('空白笔记本（未导入数据）即便收到 session ready 也不触发 bootstrap prompt', async () => {
    const created = await createNotebookAgentSession({
      userId: 'u-1',
      origin: 'http://localhost:5173',
    })

    subscribeNotebookAgentEvents(created.sessionId, () => undefined)
    expect(markNotebookAgentSessionReady(created.sessionId)).toBe(true)

    await Promise.resolve()
    await Promise.resolve()
    expect(sessionPromptMock).not.toHaveBeenCalled()
  })

  it('发送消息时把用户消息入库并调用 SDK prompt', async () => {
    const created = await createNotebookAgentSession({
      userId: 'u-1',
      origin: 'http://localhost:5173',
      initialDataMeta: {
        sourceKind: 'canvas-node',
        sourceLabel: '清洗-Q2',
        rowCount: 123,
        columnCount: 4,
      },
    })

    const ok = await sendNotebookAgentMessage(created.sessionId, {
      id: 'msg-1',
      content: '先看一下缺失值分布',
    })

    expect(ok).toBe(true)
    await vi.waitFor(() => {
      expect(sessionPromptMock).toHaveBeenCalledWith('先看一下缺失值分布')
    })
    expect(persistNotebookSessionMessageMock).toHaveBeenCalledWith(
      testSessionManager,
      expect.objectContaining({
        id: 'msg-1',
        role: 'user',
        content: '先看一下缺失值分布',
      }),
    )
    const view = getNotebookAgentSessionView(created.sessionId)
    expect(view?.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'msg-1',
          role: 'user',
          content: '先看一下缺失值分布',
        }),
      ]),
    )
  })

  it('Pi SDK 事件会桥接成 notebook 事件流', async () => {
    const created = await createNotebookAgentSession({
      userId: 'u-1',
      origin: 'http://localhost:5173',
      initialDataMeta: {
        sourceKind: 'canvas-node',
        sourceLabel: '清洗-Q2',
        rowCount: 123,
        columnCount: 4,
      },
    })
    const events: Array<Record<string, unknown>> = []
    const unsubscribe = subscribeNotebookAgentEvents(created.sessionId, (event) => {
      events.push(event as Record<string, unknown>)
    })
    if (!unsubscribe) throw new Error('缺少事件订阅')

    sessionSubscribeMock.mock.calls[0]?.[0]?.({ type: 'agent_start' })
    sessionSubscribeMock.mock.calls[0]?.[0]?.({
      type: 'message_start',
      message: { role: 'assistant' },
    })
    sessionSubscribeMock.mock.calls[0]?.[0]?.({
      type: 'message_update',
      assistantMessageEvent: { type: 'text_delta', delta: '先看概览。' },
    })
    sessionSubscribeMock.mock.calls[0]?.[0]?.({
      type: 'tool_execution_start',
      toolCallId: 'tool-1',
      toolName: 'fs_list',
      args: { path: 'inputs' },
    })
    sessionSubscribeMock.mock.calls[0]?.[0]?.({
      type: 'tool_execution_end',
      toolCallId: 'tool-1',
      toolName: 'fs_list',
      result: { content: [{ type: 'text', text: '{"path":"inputs"}' }] },
      isError: false,
    })
    sessionSubscribeMock.mock.calls[0]?.[0]?.({
      type: 'message_end',
      message: {
        role: 'assistant',
        content: [{ type: 'text', text: '先看概览。' }],
      },
    })
    sessionSubscribeMock.mock.calls[0]?.[0]?.({ type: 'agent_end' })

    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'session.status', status: 'running' }),
        expect.objectContaining({ type: 'message.start' }),
        expect.objectContaining({ type: 'message.delta', delta: '先看概览。' }),
        expect.objectContaining({
          type: 'tool.start',
          toolCall: expect.objectContaining({ toolName: 'fs_list' }),
        }),
        expect.objectContaining({ type: 'tool.end', toolCallId: 'tool-1', isError: false }),
        expect.objectContaining({ type: 'message.completed', content: '先看概览。' }),
      ]),
    )
    // agent_end 正常完成时必须广播 completed（而非 running），
    // 否则前端 isRunning 永远不落 false，发送按钮停留在停止态、退出仍提示"还在工作"。
    const statusEvents = events.filter((e) => e.type === 'session.status')
    expect(statusEvents[statusEvents.length - 1]).toEqual(
      expect.objectContaining({ type: 'session.status', status: 'completed' }),
    )
    expect(getNotebookAgentSessionView(created.sessionId)?.status).toBe('completed')
  })

  it('关闭会话时释放 runtime', async () => {
    const created = await createNotebookAgentSession({
      userId: 'u-1',
      origin: 'http://localhost:5173',
      initialDataMeta: {
        sourceKind: 'canvas-node',
        sourceLabel: '清洗-Q2',
        rowCount: 123,
        columnCount: 4,
      },
    })

    const ok = closeNotebookAgentSession(created.sessionId)

    expect(ok).toBe(true)
    expect(sessionDisposeMock).toHaveBeenCalled()
    expect(persistNotebookSessionMetaMock).toHaveBeenCalled()
    // 软关闭：释放 runtime 但保留 record（status 不变，供 resume 回放历史）
    expect(getNotebookAgentSessionView(created.sessionId)).toBeDefined()
  })

  it('更新标题后会反映到详情与列表摘要', async () => {
    const created = await createNotebookAgentSession({
      userId: 'u-1',
      origin: 'http://localhost:5173',
      initialDataMeta: {
        sourceKind: 'canvas-node',
        sourceLabel: '清洗-Q2',
        rowCount: 123,
        columnCount: 4,
      },
    })

    const ok = updateNotebookAgentSessionTitle(created.sessionId, '销量分析')
    expect(ok).toBe(true)
    expect(persistNotebookSessionTitleMock).toHaveBeenCalledWith(
      expect.objectContaining({ getSessionFile: expect.any(Function) }),
      '销量分析',
    )

    const detail = getNotebookAgentSessionView(created.sessionId)
    expect(detail).toBeDefined()
    expect(detail?.title).toBe('销量分析')

    listPersistedNotebookSessionsByUserMock.mockReturnValueOnce([
      {
        sessionId: created.sessionId,
        title: '销量分析',
        initialDataMeta: {
          sourceKind: 'canvas-node',
          sourceLabel: '清洗-Q2',
          rowCount: 123,
          columnCount: 4,
        },
        status: 'idle',
        createdAt: detail!.createdAt,
        updatedAt: detail!.updatedAt,
        messageCount: 0,
        lastUserMessagePreview: undefined,
      },
    ])
    const list = listNotebookAgentSessionsByUser('u-1')
    expect(list[0]?.title).toBe('销量分析')
  })

  it('恢复已存在历史消息的会话不会再次触发 bootstrap prompt', async () => {
    const created = await createNotebookAgentSession({
      userId: 'u-1',
      origin: 'http://localhost:5173',
      initialDataMeta: {
        sourceKind: 'canvas-node',
        sourceLabel: '清洗-Q2',
        rowCount: 123,
        columnCount: 4,
      },
    })

    await sendNotebookAgentMessage(created.sessionId, {
      id: 'msg-1',
      content: '先看一下缺失值分布',
    })
    await vi.waitFor(() => {
      expect(sessionPromptMock).toHaveBeenCalledWith('先看一下缺失值分布')
    })

    closeNotebookAgentSession(created.sessionId)
    sessionPromptMock.mockClear()
    loadNotebookSessionRecordMock.mockResolvedValueOnce({
      sessionId: created.sessionId,
      userId: 'u-1',
      origin: 'http://localhost:5173',
      title: '数据分析_2026-06-22 16:53:05',
      sessionFile: '/tmp/test-session.jsonl',
      bootstrapPromptedAt: undefined,
      initialDataMeta: {
        sourceKind: 'canvas-node',
        sourceLabel: '清洗-Q2',
        rowCount: 123,
        columnCount: 4,
      },
      status: 'completed',
      dataReady: false,
      messages: [
        {
          id: 'msg-1',
          role: 'user',
          content: '先看一下缺失值分布',
          rawContent: '先看一下缺失值分布',
          status: 'completed',
          createdAt: Date.now(),
        },
      ],
      toolCalls: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      archivedAt: Date.now(),
    })

    const resumed = await ensureNotebookAgentRuntime(created.sessionId)
    expect(resumed).toBe(true)
    expect(ensureNotebookSessionsRehydratedMock).toHaveBeenCalled()
    expect(sessionManagerOpenMock).toHaveBeenCalled()

    const unsubscribe = subscribeNotebookAgentEvents(created.sessionId, () => undefined)
    expect(unsubscribe).toBeTypeOf('function')
    expect(markNotebookAgentSessionReady(created.sessionId)).toBe(true)

    await Promise.resolve()
    await Promise.resolve()
    expect(sessionPromptMock).not.toHaveBeenCalled()
  })
})
