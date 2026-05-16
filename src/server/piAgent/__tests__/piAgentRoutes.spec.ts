import { afterEach, describe, expect, it, vi } from 'vitest'
import { Readable } from 'node:stream'
import type { IncomingMessage, ServerResponse } from 'node:http'

const {
  createPiAgentSessionMock,
  sendPiAgentMessageMock,
  subscribePiAgentEventsMock,
  getPiAgentSessionMock,
  resolvePiAgentToolResultMock,
} = vi.hoisted(() => ({
  createPiAgentSessionMock: vi.fn(),
  sendPiAgentMessageMock: vi.fn(),
  subscribePiAgentEventsMock: vi.fn(),
  getPiAgentSessionMock: vi.fn(),
  resolvePiAgentToolResultMock: vi.fn(),
}))

vi.mock('../gateway.js', () => ({
  createPiAgentSession: createPiAgentSessionMock,
  sendPiAgentMessage: sendPiAgentMessageMock,
  subscribePiAgentEvents: subscribePiAgentEventsMock,
  getPiAgentSession: getPiAgentSessionMock,
  resolvePiAgentToolResult: resolvePiAgentToolResultMock,
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
      workflowMcpRuntime: {},
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
  sendPiAgentMessageMock.mockReset()
  subscribePiAgentEventsMock.mockReset()
  getPiAgentSessionMock.mockReset()
  resolvePiAgentToolResultMock.mockReset()
})

describe('piAgentRoutes', () => {
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
})
