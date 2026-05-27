import { afterEach, describe, expect, it, vi } from 'vitest'
import { Readable } from 'node:stream'
import type { IncomingMessage, ServerResponse } from 'node:http'

const {
  createPiAgentSessionMock,
  createJsTransformAgentSessionMock,
  sendPiAgentMessageMock,
  sendJsTransformAgentMessageMock,
  abortJsTransformAgentRunMock,
  subscribePiAgentEventsMock,
  subscribeJsTransformAgentEventsMock,
  getPiAgentSessionMock,
  getJsTransformAgentSessionMock,
  resolvePiAgentToolResultMock,
  resolveJsTransformAgentToolResultMock,
  syncPiAgentCanvasMock,
  getSystemModelProfilesMock,
  testWorkflowAiModelProfileMock,
} = vi.hoisted(() => ({
  createPiAgentSessionMock: vi.fn(),
  createJsTransformAgentSessionMock: vi.fn(),
  sendPiAgentMessageMock: vi.fn(),
  sendJsTransformAgentMessageMock: vi.fn(),
  abortJsTransformAgentRunMock: vi.fn(),
  subscribePiAgentEventsMock: vi.fn(),
  subscribeJsTransformAgentEventsMock: vi.fn(),
  getPiAgentSessionMock: vi.fn(),
  getJsTransformAgentSessionMock: vi.fn(),
  resolvePiAgentToolResultMock: vi.fn(),
  resolveJsTransformAgentToolResultMock: vi.fn(),
  syncPiAgentCanvasMock: vi.fn(),
  getSystemModelProfilesMock: vi.fn(),
  testWorkflowAiModelProfileMock: vi.fn(),
}))

vi.mock('../gateway.js', () => ({
  createPiAgentSession: createPiAgentSessionMock,
  createJsTransformAgentSession: createJsTransformAgentSessionMock,
  sendPiAgentMessage: sendPiAgentMessageMock,
  sendJsTransformAgentMessage: sendJsTransformAgentMessageMock,
  abortJsTransformAgentRun: abortJsTransformAgentRunMock,
  subscribePiAgentEvents: subscribePiAgentEventsMock,
  subscribeJsTransformAgentEvents: subscribeJsTransformAgentEventsMock,
  getPiAgentSession: getPiAgentSessionMock,
  getJsTransformAgentSession: getJsTransformAgentSessionMock,
  resolvePiAgentToolResult: resolvePiAgentToolResultMock,
  resolveJsTransformAgentToolResult: resolveJsTransformAgentToolResultMock,
  syncPiAgentCanvas: syncPiAgentCanvasMock,
}))

vi.mock('../modelProfiles.js', () => ({
  getSystemModelProfiles: getSystemModelProfilesMock,
  testWorkflowAiModelProfile: testWorkflowAiModelProfileMock,
  toPublicModelProfile: vi.fn((profile) => profile),
}))

import { createPiAgentRoutes } from '../../modules/piAgentRoutes.js'

type MockResponse = ServerResponse & {
  body: string
  headersMap: Record<string, string>
}

const createRequest = (
  method: string,
  url: string,
  body?: unknown,
  headers: Record<string, string> = {
    'x-workflow-user-id': 'pi-agent-route-user',
    'x-workflow-user-name': 'Pi Agent 路由测试用户',
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
        id: 'pi-agent-route-user',
        name: 'Pi Agent 路由测试用户',
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
  createPiAgentSessionMock.mockReset()
  createJsTransformAgentSessionMock.mockReset()
  sendPiAgentMessageMock.mockReset()
  sendJsTransformAgentMessageMock.mockReset()
  abortJsTransformAgentRunMock.mockReset()
  subscribePiAgentEventsMock.mockReset()
  subscribeJsTransformAgentEventsMock.mockReset()
  getPiAgentSessionMock.mockReset()
  getJsTransformAgentSessionMock.mockReset()
  resolvePiAgentToolResultMock.mockReset()
  resolveJsTransformAgentToolResultMock.mockReset()
  syncPiAgentCanvasMock.mockReset()
  getSystemModelProfilesMock.mockReset()
  testWorkflowAiModelProfileMock.mockReset()
})

describe('piAgentRoutes', () => {
  it('returns system model profiles from the pi-agent namespace', async () => {
    getSystemModelProfilesMock.mockReturnValueOnce([
      {
        id: 'profile_1',
        name: '测试模型',
        baseUrl: 'http://example.com',
        model: 'glm-4.7',
        enabled: true,
        source: 'system',
      },
    ])

    const handler = createPiAgentRoutes()
    const response = createResponse()

    const handled = await handler(createContext(createRequest('GET', '/api/pi-agent/model-profiles'), response) as any)

    expect(handled).toBe(true)
    expect(response.statusCode).toBe(200)
    expect(JSON.parse(response.body)).toEqual({
      profiles: [
        {
          id: 'profile_1',
          name: '测试模型',
          baseUrl: 'http://example.com',
          model: 'glm-4.7',
          enabled: true,
          source: 'system',
        },
      ],
    })
  })

  it('tests model profiles from the pi-agent namespace', async () => {
    testWorkflowAiModelProfileMock.mockResolvedValueOnce({
      success: true,
      message: '连接成功',
      latencyMs: 120,
    })

    const handler = createPiAgentRoutes()
    const request = createRequest('POST', '/api/pi-agent/model-profiles/test', {
      profile: {
        id: 'profile_1',
        name: '测试模型',
        baseUrl: 'http://example.com',
        model: 'glm-4.7',
        enabled: true,
        source: 'custom',
      },
    })
    const response = createResponse()

    const handled = await handler(createContext(request, response) as any)

    expect(handled).toBe(true)
    expect(response.statusCode).toBe(200)
    expect(testWorkflowAiModelProfileMock).toHaveBeenCalledWith(expect.objectContaining({
      id: 'profile_1',
      model: 'glm-4.7',
    }))
    expect(JSON.parse(response.body)).toEqual({
      success: true,
      message: '连接成功',
      latencyMs: 120,
    })
  })

  it('creates js transform agent sessions through the dedicated route', async () => {
    createJsTransformAgentSessionMock.mockResolvedValueOnce({
      sessionId: 'js_agent_session_1',
      status: 'idle',
      mode: 'agent',
      prompt: '把字符串日期转成月份字段',
    })

    const handler = createPiAgentRoutes()
    const request = createRequest('POST', '/api/pi-agent/js-transform/sessions', {
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
      'pi-agent-route-user',
    )
  })

  it('rejects unsafe session payloads that contain raw rows', async () => {
    const handler = createPiAgentRoutes()
    const request = createRequest('POST', '/api/pi-agent/sessions', {
      mode: 'edit',
      prompt: '分析销量',
      profile: {
        id: 'profile_1',
        name: '测试模型',
        baseUrl: 'http://example.com',
        model: 'glm-4.7',
        enabled: true,
        source: 'custom',
      },
      nodeCatalog: [],
      dataSources: [
        {
          id: 'ds_1',
          kind: 'file',
          entryNodeType: 'file-import',
          label: '销售数据',
          schemaSummary: {
            nodeId: 'node_1',
            nodeLabel: '导入数据',
            resultKind: 'table',
            numericColumns: ['sales'],
            candidateTargetColumns: ['sales'],
            candidateFeatureColumns: ['price'],
            blockedReasons: [],
          },
          bindingPayload: {
            rows: [{ sales: 100 }],
          },
        },
      ],
    })
    const response = createResponse()

    const handled = await handler(createContext(request, response) as any)

    expect(handled).toBe(true)
    expect(response.statusCode).toBe(400)
    expect(JSON.parse(response.body)).toEqual({
      message: 'Pi Agent 会话不允许包含完整行数据，请仅传递摘要上下文',
    })
    expect(createPiAgentSessionMock).not.toHaveBeenCalled()
  })

  it('aborts a js transform agent run through the dedicated route', async () => {
    abortJsTransformAgentRunMock.mockResolvedValueOnce({
      ok: true,
      restoredMessages: ['继续调试', '解释报错'],
    })

    const handler = createPiAgentRoutes()
    const request = createRequest('POST', '/api/pi-agent/js-transform/sessions/js_session_1/abort')
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

  it('forwards canvas sync requests to the pi agent gateway', async () => {
    syncPiAgentCanvasMock.mockResolvedValueOnce({
      projection: {
        workflow: {
          workflowName: '当前画布',
          draftNodeCount: 1,
          draftEdgeCount: 0,
        },
      },
      syncSummary: '已同步当前画布，共 1 个节点、0 条连线',
    })

    const handler = createPiAgentRoutes()
    const request = createRequest('POST', '/api/pi-agent/sessions/session_1/canvas-sync', {
      workflowSnapshot: {
        name: '当前画布',
        nodes: [{ id: 'node_1', type: 'custom' }],
        edges: [],
      },
    })
    const response = createResponse()

    const handled = await handler(createContext(request, response) as any)

    expect(handled).toBe(true)
    expect(response.statusCode).toBe(200)
    expect(syncPiAgentCanvasMock).toHaveBeenCalledWith({
      sessionId: 'session_1',
      workflowSnapshot: {
        name: '当前画布',
        nodes: [{ id: 'node_1', type: 'custom' }],
        edges: [],
      },
    })
  })

  it('returns 404 when canvas sync target session does not exist', async () => {
    syncPiAgentCanvasMock.mockRejectedValueOnce(new Error('未找到 Pi Agent 会话'))

    const handler = createPiAgentRoutes()
    const request = createRequest('POST', '/api/pi-agent/sessions/missing/canvas-sync', {
      workflowSnapshot: {
        name: '当前画布',
        nodes: [],
        edges: [],
      },
    })
    const response = createResponse()

    const handled = await handler(createContext(request, response) as any)

    expect(handled).toBe(true)
    expect(response.statusCode).toBe(404)
    expect(JSON.parse(response.body)).toEqual({
      message: '未找到 Pi Agent 会话',
    })
  })
})
