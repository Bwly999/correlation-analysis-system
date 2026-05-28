import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { WorkflowAiPlanRequest } from '@/ai/types'

const {
  createAgentSessionMock,
  sessionPromptMock,
  sessionFollowUpMock,
  agentContinueMock,
  sessionSubscribeMock,
  sessionDisposeMock,
  defaultResourceLoaderMock,
  loaderReloadMock,
  sessionManagerInMemoryMock,
  sessionManagerCreateMock,
  buildAllToolsMock,
  buildModelFromProfileMock,
  createModelRegistryFromProfileMock,
} = vi.hoisted(() => ({
  createAgentSessionMock: vi.fn(),
  sessionPromptMock: vi.fn(),
  sessionFollowUpMock: vi.fn(),
  agentContinueMock: vi.fn(),
  sessionSubscribeMock: vi.fn(),
  sessionDisposeMock: vi.fn(),
  defaultResourceLoaderMock: vi.fn(),
  loaderReloadMock: vi.fn(),
  sessionManagerInMemoryMock: vi.fn(),
  sessionManagerCreateMock: vi.fn(),
  buildAllToolsMock: vi.fn(),
  buildModelFromProfileMock: vi.fn(),
  createModelRegistryFromProfileMock: vi.fn(),
}))

vi.mock('@earendil-works/pi-coding-agent', () => ({
  createAgentSession: createAgentSessionMock,
  SessionManager: {
    inMemory: sessionManagerInMemoryMock,
    create: sessionManagerCreateMock,
  },
  DefaultResourceLoader: defaultResourceLoaderMock,
  defineTool: vi.fn(),
}))

vi.mock('../tools/index.js', () => ({
  buildAllTools: buildAllToolsMock,
}))

vi.mock('../modelAdapter.js', () => ({
  buildModelFromProfile: buildModelFromProfileMock,
  createModelRegistryFromProfile: createModelRegistryFromProfileMock,
}))

import {
  createPiAgentSession,
  disposeAllPiAgentSessions,
  getPiAgentSession,
  subscribePiAgentEvents,
  sendPiAgentMessage,
} from '../gateway.js'
import { buildSystemPrompt } from '../systemPrompt.js'
import { FrontendBridgeTimeoutError } from '../frontendBridge.js'

const createRequest = (): WorkflowAiPlanRequest => ({
  mode: 'create',
  prompt: '帮我分析销量',
  profile: {
    id: 'profile_1',
    name: '测试模型',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-test',
    enabled: true,
    source: 'custom',
  },
  nodeCatalog: [],
  dataSources: [],
})

describe('piAgent gateway', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sessionManagerInMemoryMock.mockReturnValue({ type: 'in-memory-session-manager' })
    sessionManagerCreateMock.mockReturnValue({ type: 'persistent-session-manager' })
    buildAllToolsMock.mockReturnValue([])
    buildModelFromProfileMock.mockReturnValue({
      id: 'gpt-test',
      provider: 'openai',
    })
  createModelRegistryFromProfileMock.mockReturnValue({
      authStorage: { kind: 'auth' },
      modelRegistry: { kind: 'registry' },
    })
    loaderReloadMock.mockResolvedValue(undefined)
    defaultResourceLoaderMock.mockImplementation(function (this: Record<string, unknown>, options: Record<string, unknown>) {
      this.options = options
      this.reload = loaderReloadMock
    } as any)
    createAgentSessionMock.mockResolvedValue({
      session: {
        prompt: sessionPromptMock,
        followUp: sessionFollowUpMock,
        agent: {
          continue: agentContinueMock,
        },
        subscribe: sessionSubscribeMock,
        dispose: sessionDisposeMock,
      },
    })
    sessionSubscribeMock.mockReturnValue(() => {})
  })

  afterEach(() => {
    disposeAllPiAgentSessions()
  })

  it('injects the system prompt through the resource loader instead of prepending it to user messages', async () => {
    const request = createRequest()

    const created = await createPiAgentSession(request, 'user_1')

    const firstCall = defaultResourceLoaderMock.mock.calls[0]?.[0] as Record<string, unknown> | undefined
    expect(firstCall).toBeTruthy()
    expect(firstCall?.cwd).toBe(process.cwd())
    expect(firstCall?.agentDir).toBe(process.cwd())
    expect(typeof firstCall?.systemPromptOverride).toBe('function')
    const systemPromptOverride = firstCall?.systemPromptOverride
    if (typeof systemPromptOverride !== 'function') throw new Error('缺少 systemPromptOverride')
    expect(systemPromptOverride(undefined)).toBe(buildSystemPrompt(request))
    expect(loaderReloadMock).toHaveBeenCalledTimes(1)
    expect(sessionManagerCreateMock).toHaveBeenCalled()
    expect(createAgentSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        resourceLoader: expect.objectContaining({
          options: expect.objectContaining({
            systemPromptOverride: expect.any(Function),
          }),
        }),
      }),
    )
    expect(created.sessionId).toBeTruthy()
  })

  it('builds a system prompt that requires continuing after read-only observation until the user goal is answered', () => {
    const prompt = buildSystemPrompt(createRequest())

    expect(prompt).toContain('必须继续调用下一步工具或给出可执行结论')
    expect(prompt).toContain('只读工具结果不能单独构成完成态')
    expect(prompt).toContain('给实例')
    expect(prompt).toContain('比较节点差异')
  })

  it('persists the session file path when the SDK returns one', async () => {
    const request = createRequest()
    createAgentSessionMock.mockResolvedValueOnce({
      session: {
        sessionFile: '/tmp/pi-agent/session.jsonl',
        prompt: sessionPromptMock,
        followUp: sessionFollowUpMock,
        agent: {
          continue: agentContinueMock,
        },
        subscribe: sessionSubscribeMock,
        dispose: sessionDisposeMock,
      },
    })

    const created = await createPiAgentSession(request, 'user_1')
    const record = getPiAgentSession(created.sessionId)
    expect(record?.sessionFile).toBe('/tmp/pi-agent/session.jsonl')
  })

  it('sends the first user message as raw content without system prompt or wrapper labels', async () => {
    const request = createRequest()
    const created = await createPiAgentSession(request, 'user_1')

    const result = await sendPiAgentMessage(created.sessionId, '请先看看价格因子')
    await vi.waitFor(() => {
      expect(sessionPromptMock).toHaveBeenCalledWith('请先看看价格因子')
    })

    expect(result).toEqual({ ok: true })
    expect(sessionPromptMock).not.toHaveBeenCalledWith(expect.stringContaining('你是一个数据分析助手'))
    expect(sessionPromptMock).not.toHaveBeenCalledWith(expect.stringContaining('用户消息：'))
    expect(sessionPromptMock).not.toHaveBeenCalledWith(expect.stringContaining('模式：'))
  })

  it('queues follow-up messages with raw content only while the session is streaming', async () => {
    const request = createRequest()
    const created = await createPiAgentSession(request, 'user_1')
    const record = getPiAgentSession(created.sessionId)
    if (!record) throw new Error('缺少会话记录')

    sessionSubscribeMock.mock.calls[0]?.[0]?.({ type: 'agent_start' })

    const result = await sendPiAgentMessage(created.sessionId, '继续看下一个因子')
    await vi.waitFor(() => {
      expect(sessionFollowUpMock).toHaveBeenCalledWith('继续看下一个因子')
    })

    expect(result).toEqual({ ok: true })
    expect(sessionFollowUpMock).not.toHaveBeenCalledWith(expect.stringContaining('你是一个数据分析助手'))
    expect(sessionFollowUpMock).not.toHaveBeenCalledWith(expect.stringContaining('用户消息：'))
    expect(record.messages[record.messages.length - 1]).toEqual(
      expect.objectContaining({
        role: 'user',
        visibility: 'user',
        content: '继续看下一个因子',
      }),
    )
  })

  it('falls back to a new prompt after an interrupted run so the next message still gets a response path', async () => {
    const request = createRequest()
    const created = await createPiAgentSession(request, 'user_1')
    const events: Array<Record<string, unknown>> = []
    const unsubscribe = subscribePiAgentEvents(created.sessionId, (event) => {
      events.push(event as Record<string, unknown>)
    })
    if (!unsubscribe) throw new Error('缺少事件订阅')

    sessionSubscribeMock.mock.calls[0]?.[0]?.({ type: 'agent_start' })
    sessionFollowUpMock.mockRejectedValueOnce(new Error('流式连接中断'))

    const firstResult = await sendPiAgentMessage(created.sessionId, '先给几个实例数据')

    expect(firstResult).toEqual({ ok: true })
    await vi.waitFor(() => {
      expect(getPiAgentSession(created.sessionId)?.status).toBe('interrupted')
    })
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'session.interrupted',
          message: '流式连接中断',
        }),
      ]),
    )

    sessionPromptMock.mockResolvedValueOnce(undefined)
    const secondResult = await sendPiAgentMessage(created.sessionId, '继续')

    expect(secondResult).toEqual({ ok: true })
    await vi.waitFor(() => {
      expect(sessionPromptMock).toHaveBeenCalledWith('继续')
    })
    expect(sessionFollowUpMock).not.toHaveBeenCalledWith('继续')
  })

  it('marks frontend tool heartbeat timeouts as interrupted instead of failed', async () => {
    const request = createRequest()
    const created = await createPiAgentSession(request, 'user_1')
    const events: Array<Record<string, unknown>> = []
    const unsubscribe = subscribePiAgentEvents(created.sessionId, (event) => {
      events.push(event as Record<string, unknown>)
    })
    if (!unsubscribe) throw new Error('缺少事件订阅')

    sessionPromptMock.mockRejectedValueOnce(
      new FrontendBridgeTimeoutError('wf_executeWorkflow', 600_000),
    )

    const result = await sendPiAgentMessage(created.sessionId, '执行当前工作流')

    expect(result).toEqual({ ok: true })
    await vi.waitFor(() => {
      expect(getPiAgentSession(created.sessionId)?.status).toBe('interrupted')
    })
    expect(getPiAgentSession(created.sessionId)?.lastStopReason).toBe('interrupted')
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'session.interrupted',
          message: '前端执行超时，可重试继续分析',
        }),
      ]),
    )
  })

  it('marks a read-only turn as ended early when it stops after a transitional assistant message', async () => {
    const request = createRequest()
    const created = await createPiAgentSession(request, 'user_1')
    const events: Array<Record<string, unknown>> = []
    const unsubscribe = subscribePiAgentEvents(created.sessionId, (event) => {
      events.push(event as Record<string, unknown>)
    })
    if (!unsubscribe) throw new Error('缺少事件订阅')

    sessionSubscribeMock.mock.calls[0]?.[0]?.({
      type: 'agent_start',
    })
    sessionSubscribeMock.mock.calls[0]?.[0]?.({
      type: 'message_start',
      message: { role: 'assistant' },
    })
    sessionSubscribeMock.mock.calls[0]?.[0]?.({
      type: 'message_end',
      message: {
        role: 'assistant',
        content: [{ type: 'text', text: '好的，我来看看手动输入数据节点和一些分析节点的配置详情。' }],
      },
    })
    sessionSubscribeMock.mock.calls[0]?.[0]?.({
      type: 'tool_execution_start',
      toolCallId: 'tool_1',
      toolName: 'workflow_get_node',
      args: { nodeType: 'manual-json-import' },
    })
    sessionSubscribeMock.mock.calls[0]?.[0]?.({
      type: 'tool_execution_end',
      toolCallId: 'tool_1',
      toolName: 'workflow_get_node',
      result: { content: [{ type: 'text', text: '已读取节点信息' }] },
      isError: false,
    })
    sessionSubscribeMock.mock.calls[0]?.[0]?.({
      type: 'agent_end',
    })

    const record = getPiAgentSession(created.sessionId)
    expect(record?.status).toBe('completed')
    expect(record?.lastTurnEndedEarly).toBe(true)
    expect(record?.lastStopReason).toBe('read_only_observation_end')
    expect(record?.lastObservedToolName).toBe('workflow_get_node')
    expect(record?.lastAssistantMessageText).toBe('好的，我来看看手动输入数据节点和一些分析节点的配置详情。')
    expect(record?.activeTurnState).toBe('idle')
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'session.stop_diagnosis',
          stopReason: 'read_only_observation_end',
          lastObservedToolName: 'workflow_get_node',
        }),
      ]),
    )
  })

  it('keeps a normal stop reason when the assistant completes a concrete answer after reading nodes', async () => {
    const request = createRequest()
    const created = await createPiAgentSession(request, 'user_1')

    sessionSubscribeMock.mock.calls[0]?.[0]?.({
      type: 'agent_start',
    })
    sessionSubscribeMock.mock.calls[0]?.[0]?.({
      type: 'message_start',
      message: { role: 'assistant' },
    })
    sessionSubscribeMock.mock.calls[0]?.[0]?.({
      type: 'tool_execution_start',
      toolCallId: 'tool_1',
      toolName: 'workflow_get_node_catalog',
      args: { limit: 10 },
    })
    sessionSubscribeMock.mock.calls[0]?.[0]?.({
      type: 'tool_execution_end',
      toolCallId: 'tool_1',
      toolName: 'workflow_get_node_catalog',
      result: { content: [{ type: 'text', text: '已读取节点目录' }] },
      isError: false,
    })
    sessionSubscribeMock.mock.calls[0]?.[0]?.({
      type: 'tool_execution_start',
      toolCallId: 'tool_2',
      toolName: 'workflow_get_node',
      args: { nodeType: 'manual-json-import' },
    })
    sessionSubscribeMock.mock.calls[0]?.[0]?.({
      type: 'tool_execution_end',
      toolCallId: 'tool_2',
      toolName: 'workflow_get_node',
      result: { content: [{ type: 'text', text: '已读取节点信息' }] },
      isError: false,
    })
    sessionSubscribeMock.mock.calls[0]?.[0]?.({
      type: 'message_end',
      message: {
        role: 'assistant',
        content: [{ type: 'text', text: '单调性分析节点需要数值字段，手动输入数据节点适合直接粘贴示例表格。' }],
      },
    })
    sessionSubscribeMock.mock.calls[0]?.[0]?.({
      type: 'agent_end',
    })

    const record = getPiAgentSession(created.sessionId)
    expect(record?.status).toBe('completed')
    expect(record?.lastTurnEndedEarly).toBe(false)
    expect(record?.lastStopReason).toBe('normal')
    expect(record?.lastObservedToolName).toBe('workflow_get_node')
    expect(record?.lastAssistantMessageText).toBe('单调性分析节点需要数值字段，手动输入数据节点适合直接粘贴示例表格。')
  })

  it('continues the existing turn after toolResult when the user sends a resumable continue message', async () => {
    const request = createRequest()
    const created = await createPiAgentSession(request, 'user_1')

    sessionSubscribeMock.mock.calls[0]?.[0]?.({ type: 'agent_start' })
    sessionSubscribeMock.mock.calls[0]?.[0]?.({
      type: 'message_start',
      message: { role: 'assistant' },
    })
    sessionSubscribeMock.mock.calls[0]?.[0]?.({
      type: 'message_end',
      message: {
        role: 'assistant',
        content: [{ type: 'text', text: '好的，我来看看。' }],
      },
    })
    sessionSubscribeMock.mock.calls[0]?.[0]?.({
      type: 'tool_execution_start',
      toolCallId: 'tool_1',
      toolName: 'workflow_get_node',
      args: { nodeType: 'manual-json-import' },
    })
    sessionSubscribeMock.mock.calls[0]?.[0]?.({
      type: 'tool_execution_end',
      toolCallId: 'tool_1',
      toolName: 'workflow_get_node',
      result: { content: [{ type: 'text', text: '已读取节点信息' }] },
      isError: false,
    })
    sessionSubscribeMock.mock.calls[0]?.[0]?.({ type: 'agent_end' })

    const result = await sendPiAgentMessage(created.sessionId, '继续')

    expect(result).toEqual({ ok: true })
    await vi.waitFor(() => {
      expect(agentContinueMock).toHaveBeenCalledTimes(1)
    })
    expect(sessionPromptMock).not.toHaveBeenCalledWith('继续')
    expect(sessionFollowUpMock).not.toHaveBeenCalledWith('继续')
    expect(getPiAgentSession(created.sessionId)?.pendingFollowUps).toEqual([])
  })

  it('starts a new prompt after toolResult when the user sends a non-resumable message', async () => {
    const request = createRequest()
    const created = await createPiAgentSession(request, 'user_1')

    sessionSubscribeMock.mock.calls[0]?.[0]?.({ type: 'agent_start' })
    sessionSubscribeMock.mock.calls[0]?.[0]?.({
      type: 'tool_execution_start',
      toolCallId: 'tool_1',
      toolName: 'workflow_get_node',
      args: { nodeType: 'manual-json-import' },
    })
    sessionSubscribeMock.mock.calls[0]?.[0]?.({
      type: 'tool_execution_end',
      toolCallId: 'tool_1',
      toolName: 'workflow_get_node',
      result: { content: [{ type: 'text', text: '已读取节点信息' }] },
      isError: false,
    })
    sessionSubscribeMock.mock.calls[0]?.[0]?.({ type: 'agent_end' })

    const result = await sendPiAgentMessage(created.sessionId, '请总结成三个结论')

    expect(result).toEqual({ ok: true })
    await vi.waitFor(() => {
      expect(sessionPromptMock).toHaveBeenCalledWith('请总结成三个结论')
    })
    expect(agentContinueMock).not.toHaveBeenCalled()
  })

  it('queues streaming follow-up messages through the sdk instead of draining a local pending queue', async () => {
    const request = createRequest()
    const created = await createPiAgentSession(request, 'user_1')
    const events: Array<Record<string, unknown>> = []
    const unsubscribe = subscribePiAgentEvents(created.sessionId, (event) => {
      events.push(event as Record<string, unknown>)
    })
    if (!unsubscribe) throw new Error('缺少事件订阅')

    sessionSubscribeMock.mock.calls[0]?.[0]?.({ type: 'agent_start' })
    sessionSubscribeMock.mock.calls[0]?.[0]?.({
      type: 'message_start',
      message: { role: 'assistant' },
    })
    sessionSubscribeMock.mock.calls[0]?.[0]?.({
      type: 'message_end',
      message: {
        role: 'assistant',
        content: [{ type: 'text', text: '好的，我来看看。' }],
      },
    })
    sessionSubscribeMock.mock.calls[0]?.[0]?.({
      type: 'tool_execution_start',
      toolCallId: 'tool_1',
      toolName: 'workflow_get_node',
      args: { nodeType: 'manual-json-import' },
    })

    const result = await sendPiAgentMessage(created.sessionId, '继续')

    expect(result).toEqual({ ok: true })
    await vi.waitFor(() => {
      expect(sessionFollowUpMock).toHaveBeenCalledWith('继续')
    })
    expect(getPiAgentSession(created.sessionId)?.pendingFollowUps).toEqual(['继续'])
    sessionSubscribeMock.mock.calls[0]?.[0]?.({
      type: 'tool_execution_end',
      toolCallId: 'tool_1',
      toolName: 'workflow_get_node',
      result: { content: [{ type: 'text', text: '已读取节点信息' }] },
      isError: false,
    })
    sessionSubscribeMock.mock.calls[0]?.[0]?.({ type: 'agent_end' })
    expect(sessionPromptMock).not.toHaveBeenCalledWith('继续')
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'follow_up_queued',
          message: '继续',
        }),
      ]),
    )
  })

  it('emits a failed stop diagnosis when a turn ends without any assistant output after tool results', async () => {
    const request = createRequest()
    const created = await createPiAgentSession(request, 'user_1')
    const events: Array<Record<string, unknown>> = []
    const unsubscribe = subscribePiAgentEvents(created.sessionId, (event) => {
      events.push(event as Record<string, unknown>)
    })
    if (!unsubscribe) throw new Error('缺少事件订阅')

    sessionSubscribeMock.mock.calls[0]?.[0]?.({ type: 'agent_start' })
    sessionSubscribeMock.mock.calls[0]?.[0]?.({
      type: 'tool_execution_start',
      toolCallId: 'tool_1',
      toolName: 'workflow_get_node',
      args: { nodeType: 'manual-json-import' },
    })
    sessionSubscribeMock.mock.calls[0]?.[0]?.({
      type: 'tool_execution_end',
      toolCallId: 'tool_1',
      toolName: 'workflow_get_node',
      result: { content: [{ type: 'text', text: '已读取节点信息' }] },
      isError: false,
    })
    sessionSubscribeMock.mock.calls[0]?.[0]?.({ type: 'agent_end' })

    const record = getPiAgentSession(created.sessionId)
    expect(record?.lastStopReason).toBe('failed')
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'session.stop_diagnosis',
          stopReason: 'failed',
        }),
        expect.objectContaining({
          type: 'error',
        }),
      ]),
    )
  })
})
