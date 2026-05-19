import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useJsTransformAgent } from '../useJsTransformAgent'

const {
  createJsTransformAgentSessionMock,
  sendJsTransformAgentMessageMock,
  streamJsTransformAgentEventsMock,
  resolveJsTransformAgentToolResultMock,
  updateJsTransformAgentModeMock,
} = vi.hoisted(() => ({
  createJsTransformAgentSessionMock: vi.fn(),
  sendJsTransformAgentMessageMock: vi.fn(),
  streamJsTransformAgentEventsMock: vi.fn(),
  resolveJsTransformAgentToolResultMock: vi.fn(),
  updateJsTransformAgentModeMock: vi.fn(),
}))

vi.mock('@/services/jsTransformAgentClient', () => ({
  createJsTransformAgentSession: createJsTransformAgentSessionMock,
  sendJsTransformAgentMessage: sendJsTransformAgentMessageMock,
  streamJsTransformAgentEvents: streamJsTransformAgentEventsMock,
  resolveJsTransformAgentToolResult: resolveJsTransformAgentToolResultMock,
  updateJsTransformAgentMode: updateJsTransformAgentModeMock,
}))

describe('useJsTransformAgent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates a node-scoped session and sends the first message', async () => {
    createJsTransformAgentSessionMock.mockResolvedValueOnce({
      sessionId: 'js_session_1',
      status: 'idle',
      mode: 'agent',
      prompt: '把字符串日期转成月份字段',
    })
    sendJsTransformAgentMessageMock.mockResolvedValueOnce({ ok: true })
    streamJsTransformAgentEventsMock.mockResolvedValueOnce(undefined)

    const store = useJsTransformAgent()
    store.inputText.value = '把字符串日期转成月份字段'

    const ok = await store.sendMessage({
      mode: 'agent',
      nodeId: 'node_js_1',
      profile: {
        id: 'profile_1',
        name: '默认模型',
        baseUrl: 'http://example.com',
        model: 'glm-4.7',
        enabled: true,
        source: 'system',
      },
      context: {
        node: {
          nodeId: 'node_js_1',
          nodeLabel: 'JS代码执行',
          nodeType: 'js-transform',
        },
        task: '',
        codeContext: {
          currentCode: 'return rows',
          language: 'javascript',
          declarations: 'declare const rows: Array<Record<string, unknown>>',
          constraints: ['只能写同步 JS'],
        },
        inputContext: {
          inputMode: 'single',
          rowCount: 1,
          sourceSummary: '上游输入共 1 行',
          sampleRows: [{ date: '2026-05-01' }],
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

    expect(ok).toBe(true)
    expect(createJsTransformAgentSessionMock).toHaveBeenCalledTimes(1)
    expect(sendJsTransformAgentMessageMock).toHaveBeenCalledWith('js_session_1', '把字符串日期转成月份字段')
    expect(store.messages.value[0]).toEqual(
      expect.objectContaining({
        role: 'user',
        content: '把字符串日期转成月份字段',
      }),
    )
  })

  it('records the latest debug result when a tool result resolves', async () => {
    const store = useJsTransformAgent()
    store.sessionId.value = 'js_session_1'

    await store.handleToolResult({
      toolCallId: 'tool_1',
      result: {
        content: [{ type: 'text', text: '当前节点调试成功，输出 1 行' }],
        details: {
          ok: true,
          status: 'success',
          summary: '当前节点调试成功，输出 1 行',
          outputSample: [{ month: '2026-05' }],
          errorMessage: '',
        },
      },
    })

    expect(resolveJsTransformAgentToolResultMock).toHaveBeenCalledWith(
      'js_session_1',
      'tool_1',
      expect.objectContaining({
        details: expect.objectContaining({
          outputSample: [{ month: '2026-05' }],
        }),
      }),
    )
    expect(store.latestDebugResult.value?.summary).toContain('输出 1 行')
  })

  it('switches mode on the existing session without recreating it', async () => {
    createJsTransformAgentSessionMock.mockResolvedValueOnce({
      sessionId: 'js_session_1',
      status: 'idle',
      mode: 'agent',
      prompt: '先进入 agent',
    })
    sendJsTransformAgentMessageMock.mockResolvedValue({ ok: true })
    streamJsTransformAgentEventsMock.mockResolvedValue(undefined)
    updateJsTransformAgentModeMock.mockResolvedValue({ ok: true })

    const store = useJsTransformAgent()
    const input = {
      nodeId: 'node_js_1',
      profile: {
        id: 'profile_1',
        name: '默认模型',
        baseUrl: 'http://example.com',
        model: 'glm-4.7',
        enabled: true,
        source: 'system' as const,
      },
      context: {
        node: {
          nodeId: 'node_js_1',
          nodeLabel: 'JS代码执行',
          nodeType: 'js-transform' as const,
        },
        task: '',
        codeContext: {
          currentCode: 'return rows',
          language: 'javascript' as const,
          declarations: 'declare const rows: Array<Record<string, unknown>>',
          constraints: ['只能写同步 JS'],
        },
        inputContext: {
          inputMode: 'single' as const,
          rowCount: 1,
          sourceSummary: '上游输入共 1 行',
          sampleRows: [{ date: '2026-05-01' }],
          schemaSummary: {
            fields: [{ name: 'date', type: 'string', nullable: false }],
          },
        },
        latestDebugContext: {
          status: 'idle' as const,
          summary: '当前尚未调试',
          outputSample: [],
          errorMessage: '',
        },
        capabilities: {
          ask: ['read_context' as const],
          agent: ['read_context' as const, 'update_current_code' as const, 'debug_current_node' as const],
        },
      },
    }

    await store.sendMessage({
      ...input,
      mode: 'agent',
      prompt: '先进入 agent',
    })

    await store.switchMode({
      ...input,
      mode: 'ask',
    })

    await store.sendMessage({
      ...input,
      mode: 'ask',
      prompt: '现在只回答问题',
    })

    expect(updateJsTransformAgentModeMock).toHaveBeenCalledWith('js_session_1', 'ask')
    expect(createJsTransformAgentSessionMock).toHaveBeenCalledTimes(1)
    expect(sendJsTransformAgentMessageMock).toHaveBeenNthCalledWith(2, 'js_session_1', '现在只回答问题')
  })
})
