import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { JsTransformAgentSessionRequest } from '@/ai/types'

const {
  createAgentSessionMock,
  sessionPromptMock,
  sessionFollowUpMock,
  sessionSubscribeMock,
  sessionDisposeMock,
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
  createJsTransformAgentSession,
  disposeAllJsTransformAgentSessions,
  sendJsTransformAgentMessage,
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
        agent: {
          state: agentStateMock,
        },
      },
    })
    sessionSubscribeMock.mockReturnValue(() => {})
  })

  afterEach(() => {
    disposeAllJsTransformAgentSessions()
  })

  it('creates ask sessions without any custom tools', async () => {
    await createJsTransformAgentSession(createRequest('ask'), 'user_1')

    expect(createAgentSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        customTools: [],
      }),
    )
    const loaderOptions = defaultResourceLoaderMock.mock.calls[0]?.[0] as
      | Record<string, unknown>
      | undefined
    expect(typeof loaderOptions?.systemPromptOverride).toBe('function')
    expect((loaderOptions?.systemPromptOverride as (value?: unknown) => string)(undefined)).toBe(
      buildJsTransformAgentSystemPrompt(createRequest('ask')),
    )
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
})
