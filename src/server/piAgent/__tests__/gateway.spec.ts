import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { WorkflowAiPlanRequest } from '@/ai/types'

const {
  createAgentSessionMock,
  sessionPromptMock,
  sessionFollowUpMock,
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
  sendPiAgentMessage,
} from '../gateway.js'
import { buildSystemPrompt } from '../systemPrompt.js'

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

    const created = await createPiAgentSession(request, 'user_1', {} as never)

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

  it('persists the session file path when the SDK returns one', async () => {
    const request = createRequest()
    createAgentSessionMock.mockResolvedValueOnce({
      session: {
        sessionFile: '/tmp/pi-agent/session.jsonl',
        prompt: sessionPromptMock,
        followUp: sessionFollowUpMock,
        subscribe: sessionSubscribeMock,
        dispose: sessionDisposeMock,
      },
    })

    const created = await createPiAgentSession(request, 'user_1', {} as never)
    const record = getPiAgentSession(created.sessionId)
    expect(record?.sessionFile).toBe('/tmp/pi-agent/session.jsonl')
  })

  it('sends the first user message as raw content without system prompt or wrapper labels', async () => {
    const request = createRequest()
    const created = await createPiAgentSession(request, 'user_1', {} as never)

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
    const created = await createPiAgentSession(request, 'user_1', {} as never)
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
})
