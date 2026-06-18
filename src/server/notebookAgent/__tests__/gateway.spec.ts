// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  createAgentSessionMock,
  sessionPromptMock,
  sessionSubscribeMock,
  sessionDisposeMock,
  loaderReloadMock,
  sessionManagerCreateMock,
  buildModelFromProfileMock,
  createModelRegistryFromProfileMock,
  createPiAgentResourceLoaderMock,
} = vi.hoisted(() => ({
  createAgentSessionMock: vi.fn(),
  sessionPromptMock: vi.fn(),
  sessionSubscribeMock: vi.fn(),
  sessionDisposeMock: vi.fn(),
  loaderReloadMock: vi.fn(),
  sessionManagerCreateMock: vi.fn(),
  buildModelFromProfileMock: vi.fn(),
  createModelRegistryFromProfileMock: vi.fn(),
  createPiAgentResourceLoaderMock: vi.fn(),
}))

vi.mock('@earendil-works/pi-coding-agent', () => ({
  createAgentSession: createAgentSessionMock,
  SessionManager: {
    create: sessionManagerCreateMock,
  },
  defineTool: vi.fn((config) => config),
}))

vi.mock('../../piAgent/runtimeFactory.js', () => ({
  buildModelFromProfile: buildModelFromProfileMock,
  createModelRegistryFromProfile: createModelRegistryFromProfileMock,
  createPiAgentResourceLoader: createPiAgentResourceLoaderMock,
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

describe('notebookAgent gateway', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    __resetNotebookSessionsForTest()
    sessionManagerCreateMock.mockReturnValue({ type: 'persistent-session-manager' })
    buildModelFromProfileMock.mockReturnValue({
      id: 'glm-4.7',
      provider: 'openai',
    })
    createModelRegistryFromProfileMock.mockReturnValue({
      authStorage: { kind: 'auth' },
      modelRegistry: { kind: 'registry' },
    })
    createPiAgentResourceLoaderMock.mockReturnValue({
      reload: loaderReloadMock,
    })
    loaderReloadMock.mockResolvedValue(undefined)
    createAgentSessionMock.mockResolvedValue({
      session: {
        prompt: sessionPromptMock,
        subscribe: sessionSubscribeMock,
        dispose: sessionDisposeMock,
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
    expect(statusEvents.at(-1)).toEqual(
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

    const detail = getNotebookAgentSessionView(created.sessionId)
    expect(detail?.title).toBe('销量分析')

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

    const resumed = await ensureNotebookAgentRuntime(created.sessionId)
    expect(resumed).toBe(true)

    const unsubscribe = subscribeNotebookAgentEvents(created.sessionId, () => undefined)
    expect(unsubscribe).toBeTypeOf('function')
    expect(markNotebookAgentSessionReady(created.sessionId)).toBe(true)

    await Promise.resolve()
    await Promise.resolve()
    expect(sessionPromptMock).not.toHaveBeenCalled()
  })
})
