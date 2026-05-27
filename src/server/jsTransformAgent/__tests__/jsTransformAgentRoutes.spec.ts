import { afterEach, describe, expect, it, vi } from 'vitest'
import { Readable } from 'node:stream'
import type { IncomingMessage, ServerResponse } from 'node:http'

const {
  createJsTransformAgentSessionMock,
  sendJsTransformAgentMessageMock,
  updateJsTransformAgentModeMock,
  abortJsTransformAgentRunMock,
  subscribeJsTransformAgentEventsMock,
  getJsTransformAgentSessionMock,
  resolveJsTransformAgentToolResultMock,
} = vi.hoisted(() => ({
  createJsTransformAgentSessionMock: vi.fn(),
  sendJsTransformAgentMessageMock: vi.fn(),
  updateJsTransformAgentModeMock: vi.fn(),
  abortJsTransformAgentRunMock: vi.fn(),
  subscribeJsTransformAgentEventsMock: vi.fn(),
  getJsTransformAgentSessionMock: vi.fn(),
  resolveJsTransformAgentToolResultMock: vi.fn(),
}))

vi.mock('../../piAgent/jsTransformAgentGateway.js', () => ({
  createJsTransformAgentSession: createJsTransformAgentSessionMock,
  sendJsTransformAgentMessage: sendJsTransformAgentMessageMock,
  updateJsTransformAgentMode: updateJsTransformAgentModeMock,
  abortJsTransformAgentRun: abortJsTransformAgentRunMock,
  subscribeJsTransformAgentEvents: subscribeJsTransformAgentEventsMock,
  getJsTransformAgentSession: getJsTransformAgentSessionMock,
  resolveJsTransformAgentToolResult: resolveJsTransformAgentToolResultMock,
}))

import { createJsTransformAgentRoutes } from '../../modules/jsTransformAgentRoutes.js'
import * as jsTransformGatewayModule from '../../piAgent/jsTransformAgentGateway.js'

type MockResponse = ServerResponse & {
  body: string
  headersMap: Record<string, string>
}

const createRequest = (
  method: string,
  url: string,
  body?: unknown,
  headers: Record<string, string> = {
    'x-workflow-user-id': 'js-transform-route-user',
    'x-workflow-user-name': 'JS Transform 路由测试用户',
  },
) => {
  const payload = body === undefined ? '' : JSON.stringify(body)
  const stream = Readable.from(payload ? [payload] : []) as IncomingMessage
  stream.method = method
  stream.url = url
  stream.headers = headers
  return stream
}

const createResponse = () => {
  const headersMap: Record<string, string> = {}
  const response = {
    statusCode: 200,
    body: '',
    headersMap,
    setHeader(name: string, value: string) {
      headersMap[name] = value
      return this
    },
    write(chunk: string) {
      this.body += chunk ?? ''
      return true
    },
    end(chunk?: string) {
      this.body += chunk ?? ''
      return this
    },
  } as MockResponse

  return response
}

const createContext = (request: IncomingMessage, response: MockResponse) => {
  const url = new URL(request.url ?? '/', 'http://localhost')

  return {
    pathname: url.pathname,
    method: request.method ?? 'GET',
    url,
    request,
    response,
    dependencies: {
      resolveStorageUser: () => ({
        id: 'js-transform-route-user',
        name: 'JS Transform 路由测试用户',
      }),
    },
    readJsonBody: async <T>() => JSON.parse(await new Response(request as any).text()) as T,
    sendJson: (statusCode: number, payload: unknown) => {
      response.statusCode = statusCode
      response.setHeader('Content-Type', 'application/json; charset=utf-8')
      response.end(JSON.stringify(payload))
    },
    startNdjson: vi.fn(),
    writeNdjson: vi.fn(),
  }
}

afterEach(() => {
  vi.restoreAllMocks()
  createJsTransformAgentSessionMock.mockReset()
  sendJsTransformAgentMessageMock.mockReset()
  updateJsTransformAgentModeMock.mockReset()
  abortJsTransformAgentRunMock.mockReset()
  subscribeJsTransformAgentEventsMock.mockReset()
  getJsTransformAgentSessionMock.mockReset()
  resolveJsTransformAgentToolResultMock.mockReset()
})

describe('jsTransformAgentRoutes', () => {
  it('creates js transform sessions through the dedicated namespace', async () => {
    createJsTransformAgentSessionMock.mockResolvedValueOnce({
      sessionId: 'js_agent_session_1',
      status: 'idle',
      mode: 'agent',
      prompt: '把字符串日期转成月份字段',
    })

    const handler = createJsTransformAgentRoutes()
    const request = createRequest('POST', '/api/js-transform-agent/sessions', {
      nodeId: 'node_js_1',
      mode: 'agent',
      prompt: '把字符串日期转成月份字段',
      profile: {
        id: 'profile_1',
        name: '测试模型',
        baseUrl: 'http://example.com',
        model: 'glm-4.7',
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
    const response = createResponse()

    const handled = await handler(createContext(request, response) as any)

    expect(handled).toBe(true)
    expect(response.statusCode).toBe(200)
    expect(createJsTransformAgentSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        nodeId: 'node_js_1',
        mode: 'agent',
      }),
      'js-transform-route-user',
    )
  })

  it('aborts a js transform run through the dedicated namespace', async () => {
    abortJsTransformAgentRunMock.mockResolvedValueOnce({
      ok: true,
      restoredMessages: ['继续调试', '解释报错'],
    })

    const handler = createJsTransformAgentRoutes()
    const request = createRequest('POST', '/api/js-transform-agent/sessions/js_session_1/abort')
    const response = createResponse()

    const handled = await handler(createContext(request, response) as any)

    expect(handled).toBe(true)
    expect(response.statusCode).toBe(200)
    expect(abortJsTransformAgentRunMock).toHaveBeenCalledWith('js_session_1')
    expect(JSON.parse(response.body)).toEqual({
      ok: true,
      restoredMessages: ['继续调试', '解释报错'],
    })
  })

  it('routes directly to the piAgent jsTransform gateway implementation module', () => {
    expect(jsTransformGatewayModule).toBeTruthy()
  })
})
