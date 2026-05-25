import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { JsTransformAgentSessionRequest } from '@/ai/types'
import { createJsTransformAgentModeController } from '../jsTransformAgentModeExtension.js'

const {
  createAgentSessionMock,
  sessionPromptMock,
  sessionFollowUpMock,
  sessionSubscribeMock,
  sessionDisposeMock,
  sessionAbortMock,
  sessionClearQueueMock,
  agentStateMock,
  defaultResourceLoaderMock,
  loaderReloadMock,
  sessionManagerInMemoryMock,
  buildModelFromProfileMock,
  createModelRegistryFromProfileMock,
} = vi.hoisted(() => ({
  createAgentSessionMock: vi.fn(),
  sessionPromptMock: vi.fn(),
  sessionFollowUpMock: vi.fn(),
  sessionSubscribeMock: vi.fn(),
  sessionDisposeMock: vi.fn(),
  sessionAbortMock: vi.fn(),
  sessionClearQueueMock: vi.fn(),
  agentStateMock: { tools: [], systemPrompt: '' },
  defaultResourceLoaderMock: vi.fn(),
  loaderReloadMock: vi.fn(),
  sessionManagerInMemoryMock: vi.fn(),
  buildModelFromProfileMock: vi.fn(),
  createModelRegistryFromProfileMock: vi.fn(),
}))

vi.mock('@earendil-works/pi-coding-agent', () => ({
  createAgentSession: createAgentSessionMock,
  SessionManager: {
    inMemory: sessionManagerInMemoryMock,
  },
  DefaultResourceLoader: defaultResourceLoaderMock,
  defineTool: vi.fn((definition: Record<string, unknown>) => definition),
}))

vi.mock('../modelAdapter.js', () => ({
  buildModelFromProfile: buildModelFromProfileMock,
  createModelRegistryFromProfile: createModelRegistryFromProfileMock,
}))

import {
  abortJsTransformAgentRun,
  createJsTransformAgentSession,
  disposeAllJsTransformAgentSessions,
  sendJsTransformAgentMessage,
  subscribeJsTransformAgentEvents,
} from '../jsTransformAgentGateway.js'
import { buildJsTransformAgentSystemPrompt } from '../jsTransformAgentSystemPrompt.js'

const createRequest = (mode: 'ask' | 'agent'): JsTransformAgentSessionRequest => ({
  nodeId: 'node_js_1',
  mode,
  prompt: '把字符串日期转成月份字段',
  profile: {
    id: 'profile_1',
    name: '测试模型',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-test',
    enabled: true,
    source: 'custom',
  },
  nodeContext: {
    node: {
      nodeId: 'node_js_1',
      nodeLabel: 'JS代码执行',
      nodeType: 'js-transform',
    },
    task: '把字符串日期转成月份字段',
    codeContext: {
      currentCode: 'return rows',
      language: 'javascript',
      declarations: 'declare const rows: Array<Record<string, unknown>>',
      constraints: ['只能写同步 JS', '必须显式 return 数组对象列表'],
    },
    inputContext: {
      inputMode: 'single',
      rowCount: 2,
      sourceSummary: '上游输入共 2 行',
      sampleRows: [{ date: '2026-05-01' }, { date: '2026-05-02' }],
      schemaSummary: {
        fields: [{ name: 'date', type: 'string', nullable: false }],
      },
    },
    latestDebugContext: {
      status: 'idle',
      summary: '当前尚未调试',
      outputSample: [],
      errorMessage: '',
    },
    capabilities: {
      ask: ['read_context'],
      agent: ['read_context', 'update_current_code', 'debug_current_node'],
    },
  },
})

describe('jsTransformAgentGateway', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sessionManagerInMemoryMock.mockReturnValue({ type: 'in-memory-session-manager' })
    buildModelFromProfileMock.mockReturnValue({
      id: 'gpt-test',
      provider: 'openai',
    })
    createModelRegistryFromProfileMock.mockReturnValue({
      authStorage: { kind: 'auth' },
      modelRegistry: { kind: 'registry' },
    })
    loaderReloadMock.mockResolvedValue(undefined)
    defaultResourceLoaderMock.mockImplementation(function (
      this: Record<string, unknown>,
      options: Record<string, unknown>,
    ) {
      this.options = options
      this.reload = loaderReloadMock
    } as never)
    createAgentSessionMock.mockResolvedValue({
      session: {
        prompt: sessionPromptMock,
        followUp: sessionFollowUpMock,
        subscribe: sessionSubscribeMock,
        dispose: sessionDisposeMock,
        abort: sessionAbortMock,
        clearQueue: sessionClearQueueMock,
        agent: {
          state: agentStateMock,
        },
      },
    })
    sessionSubscribeMock.mockReturnValue(() => {})
    sessionAbortMock.mockResolvedValue(undefined)
    sessionClearQueueMock.mockReturnValue({
      steering: ['继续调试这段代码'],
      followUp: ['顺便解释报错'],
    })
  })

  afterEach(() => {
    disposeAllJsTransformAgentSessions()
  })

  it('creates ask sessions without any custom tools', async () => {
    await createJsTransformAgentSession(createRequest('ask'), 'user_1')

    const createArgs = createAgentSessionMock.mock.calls[0]?.[0] as
      | { customTools?: Array<{ name?: string }> }
      | undefined
    expect(createArgs?.customTools?.map((tool) => tool.name)).toEqual([
      'js_get_context',
      'js_update_code',
      'js_debug_node',
      'js_get_last_debug_result',
    ])
    const loaderOptions = defaultResourceLoaderMock.mock.calls[0]?.[0] as
      | Record<string, unknown>
      | undefined
    expect(typeof loaderOptions?.systemPromptOverride).toBe('function')
    expect((loaderOptions?.systemPromptOverride as (value?: unknown) => string)(undefined)).toBe(
      buildJsTransformAgentSystemPrompt(createRequest('ask')),
    )
    expect(Array.isArray(loaderOptions?.extensionFactories)).toBe(true)
  })

  it('creates agent sessions with node-scoped code tools only', async () => {
    await createJsTransformAgentSession(createRequest('agent'), 'user_1')

    const createArgs = createAgentSessionMock.mock.calls[0]?.[0] as
      | { customTools?: Array<{ name?: string }> }
      | undefined
    expect(createArgs?.customTools?.map((tool) => tool.name)).toEqual([
      'js_get_context',
      'js_update_code',
      'js_debug_node',
      'js_get_last_debug_result',
    ])
  })

  it('sends raw user messages to the node-scoped agent session', async () => {
    const created = await createJsTransformAgentSession(createRequest('agent'), 'user_1')

    const result = await sendJsTransformAgentMessage(created.sessionId, '把字符串日期转成月份字段')

    await vi.waitFor(() => {
      expect(sessionPromptMock).toHaveBeenCalledWith('把字符串日期转成月份字段')
    })
    expect(result).toEqual({ ok: true })
  })

  it('updates active tools and system prompt when switching mode', async () => {
    const created = await createJsTransformAgentSession(createRequest('ask'), 'user_1')
    agentStateMock.tools = []
    agentStateMock.systemPrompt = ''

    const { updateJsTransformAgentMode } = await import('../jsTransformAgentGateway.js')
    const result = await updateJsTransformAgentMode(created.sessionId, 'agent')

    expect(result).toEqual({ ok: true })
    expect(agentStateMock.systemPrompt).toContain('当前是 agent 模式')
    expect(agentStateMock.tools.length).toBeGreaterThan(0)
  })

  it('blocks mutating tools in ask mode and allows them after switching back to agent', async () => {
    const controller = createJsTransformAgentModeController({
      request: createRequest('agent'),
    })

    const handlers: Record<string, (event: any, ctx?: any) => Promise<any> | any> = {}
    const setActiveToolsMock = vi.fn()

    controller.extensionFactory({
      on: vi.fn((event: string, handler: (event: any, ctx?: any) => Promise<any> | any) => {
        handlers[event] = handler
      }),
      setActiveTools: setActiveToolsMock,
    } as any)

    await handlers.session_start?.({}, { hasUI: false })
    controller.setMode('ask')

    expect(setActiveToolsMock).toHaveBeenLastCalledWith(['js_get_context'])

    const blocked = await handlers.tool_call?.({
      toolName: 'js_update_code',
      input: { code: 'return rows' },
    })
    expect(blocked).toEqual({
      block: true,
      reason: '当前处于 ask 模式，不允许调用 js_update_code。请先切换到 agent 模式。',
    })

    const beforeAgentStart = await handlers.before_agent_start?.({
      systemPrompt: '旧提示词',
    })
    expect(beforeAgentStart.systemPrompt).toContain('当前是 ask 模式')

    controller.setMode('agent')
    expect(setActiveToolsMock).toHaveBeenLastCalledWith([
      'js_get_context',
      'js_update_code',
      'js_debug_node',
      'js_get_last_debug_result',
    ])

    const allowed = await handlers.tool_call?.({
      toolName: 'js_update_code',
      input: { code: 'return rows' },
    })
    expect(allowed).toBeUndefined()
  })

  it('aborts the current run, clears queued messages, and emits cancelled status', async () => {
    const created = await createJsTransformAgentSession(createRequest('agent'), 'user_1')
    const listener = vi.fn()
    const unsubscribe = subscribeJsTransformAgentEvents(created.sessionId, listener)

    const result = await abortJsTransformAgentRun(created.sessionId)

    expect(result).toEqual({
      ok: true,
      restoredMessages: ['继续调试这段代码', '顺便解释报错'],
    })
    expect(sessionClearQueueMock).toHaveBeenCalledTimes(1)
    expect(sessionAbortMock).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenCalledWith({
      type: 'session.status',
      sessionId: created.sessionId,
      status: 'cancelled',
    })

    unsubscribe?.()
  })
})
