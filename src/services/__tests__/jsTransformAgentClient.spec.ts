import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createJsTransformAgentSession, resolveJsTransformAgentToolResult } from '../jsTransformAgentClient'

const fetchMock = vi.fn()

describe('jsTransformAgentClient', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    vi.stubGlobal('fetch', fetchMock)

    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/pi-agent/js-transform/sessions') {
        return {
          ok: true,
          json: async () => ({
            sessionId: 'js_session_1',
            status: 'idle',
            mode: 'agent',
            prompt: '把字符串日期转成月份字段',
          }),
        } satisfies Partial<Response>
      }

      if (url === '/api/pi-agent/js-transform/sessions/js_session_1/tool-result') {
        return {
          ok: true,
          json: async () => ({ ok: true }),
        } satisfies Partial<Response>
      }

      throw new Error(`unexpected url: ${url}`)
    })
  })

  it('posts dedicated js transform session payloads to the node-scoped route', async () => {
    await createJsTransformAgentSession({
      nodeId: 'node_js_1',
      mode: 'agent',
      prompt: '把字符串日期转成月份字段',
      profile: {
        id: 'profile_1',
        name: '默认模型',
        baseUrl: 'http://example.com',
        model: 'glm-4.7',
        enabled: true,
        source: 'system',
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

    const createCall = fetchMock.mock.calls.find(([url]) => url === '/api/pi-agent/js-transform/sessions')
    expect(createCall).toBeTruthy()
    const body = JSON.parse(String(createCall?.[1]?.body ?? '{}'))
    expect(body.nodeId).toBe('node_js_1')
    expect(body.mode).toBe('agent')
    expect(body.nodeContext.inputContext.sampleRows).toHaveLength(1)
  })

  it('posts debug tool results back to the dedicated js transform route', async () => {
    await resolveJsTransformAgentToolResult('js_session_1', 'tool_1', {
      content: [{ type: 'text', text: '当前节点调试成功，输出 2 行' }],
      details: {
        ok: true,
        status: 'success',
        summary: '当前节点调试成功，输出 2 行',
        outputSample: [{ month: '2026-05' }],
        errorMessage: '',
      },
    })

    const call = fetchMock.mock.calls.find(([url]) => url === '/api/pi-agent/js-transform/sessions/js_session_1/tool-result')
    expect(call).toBeTruthy()
    const body = JSON.parse(String(call?.[1]?.body ?? '{}'))
    expect(body.toolCallId).toBe('tool_1')
    expect(body.result.details.outputSample).toHaveLength(1)
  })
})
