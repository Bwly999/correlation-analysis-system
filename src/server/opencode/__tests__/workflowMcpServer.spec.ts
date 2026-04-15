import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { IncomingMessage, ServerResponse } from 'node:http'

const { currentTools } = vi.hoisted(() => ({
  currentTools: new Map<string, (input: any) => any>(),
}))

vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => ({
  McpServer: class MockMcpServer {
    registerTool(name: string, _meta: unknown, handler: (input: any) => any) {
      currentTools.set(name, handler)
    }

    async connect() {}

    async close() {}
  },
}))

vi.mock('@modelcontextprotocol/sdk/server/streamableHttp.js', () => ({
  StreamableHTTPServerTransport: class MockTransport {
    async handleRequest(_request: IncomingMessage, response: ServerResponse) {
      const tool = currentTools.get('get_analysis_session_context')
      if (!tool) {
        response.statusCode = 500
        response.end(JSON.stringify({ message: 'tool not registered' }))
        return
      }

      const result = await tool({})
      response.statusCode = 200
      response.end(JSON.stringify(result))
    }

    async close() {}
  },
}))

import { createAgentSession } from '../gateway.js'
import { handleWorkflowMcpRequest } from '../workflowMcpServer.js'

type MockResponse = ServerResponse & {
  body: string
  headersMap: Record<string, string>
}

const buildAgentRequest = () => ({
  mode: 'create' as const,
  prompt: '请分析价格、折扣与销量之间的关系',
  profile: {
    id: 'custom-model',
    name: '自定义模型',
    baseUrl: 'http://example.com/v1',
    model: 'test-model',
    apiKey: 'test-key',
    enabled: true,
    source: 'custom' as const,
  },
  workflowSnapshot: {
    name: '销量诊断流程',
    nodes: [],
    edges: [],
  },
  contextHints: {
    schemaSummaries: [],
  },
  nodeCatalog: [
    {
      name: 'manual-json-import',
      displayName: '手动输入数据',
      category: 'trigger',
      description: '手动输入 JSON 数据',
      inputMode: 'single' as const,
      minInputs: 0,
      maxInputs: 0,
      allowedNextCategories: ['action'],
      properties: [],
      help: null,
      assistantHints: null,
    },
  ],
})

const createRequest = (sessionId: string) =>
  ({
    method: 'POST',
    url: '/api/opencode/workflow-mcp',
    headers: {
      'x-workflow-ai-session-id': sessionId,
      'x-workflow-storage-user-id': 'user_1',
    },
  }) as unknown as IncomingMessage

const createResponse = () =>
  ({
    statusCode: 200,
    body: '',
    headersMap: {},
    headersSent: false,
    setHeader(this: any, name: string, value: string) {
      this.headersMap[name] = value
      return this
    },
    end(this: any, chunk?: string) {
      this.body += chunk ?? ''
      this.headersSent = true
      return this
    },
  }) as unknown as MockResponse

describe('workflow MCP server', () => {
  beforeEach(() => {
    currentTools.clear()
    delete process.env.WORKFLOW_MCP_AUTH_TOKEN
  })

  it('serves analysis session context for agent sessions', async () => {
    const created = await createAgentSession({
      request: buildAgentRequest(),
      userId: 'user_1',
    })

    const request = createRequest(created.session.id)
    const response = createResponse()

    await handleWorkflowMcpRequest(request, response)

    expect(response.statusCode).toBe(200)
    expect(JSON.parse(response.body)).toMatchObject({
      structuredContent: expect.objectContaining({
        sessionId: created.session.id,
        prompt: '请分析价格、折扣与销量之间的关系',
        workflowSnapshot: expect.objectContaining({
          name: '销量诊断流程',
        }),
      }),
    })
  })

  it('registers a tool discovery endpoint for workflow MCP consumers', async () => {
    const created = await createAgentSession({
      request: buildAgentRequest(),
      userId: 'user_1',
    })

    const request = createRequest(created.session.id)
    const response = createResponse()

    await handleWorkflowMcpRequest(request, response)

    const tool = currentTools.get('list_workflow_tools')
    expect(tool).toBeTypeOf('function')

    const result = await tool?.({})
    expect(result).toMatchObject({
      structuredContent: {
        total: expect.any(Number),
        items: expect.arrayContaining([
          expect.objectContaining({
            name: 'get_analysis_session_context',
          }),
          expect.objectContaining({
            name: 'list_workflow_tools',
          }),
        ]),
      },
    })
  })

  it('rejects requests without the internal MCP auth token when auth is enabled', async () => {
    process.env.WORKFLOW_MCP_AUTH_TOKEN = 'test-mcp-token'

    const created = await createAgentSession({
      request: buildAgentRequest(),
      userId: 'user_1',
    })

    const request = createRequest(created.session.id)
    const response = createResponse()

    await handleWorkflowMcpRequest(request, response)

    expect(response.statusCode).toBe(401)
    expect(JSON.parse(response.body)).toEqual({
      jsonrpc: '2.0',
      error: {
        code: -32001,
        message: 'workflow MCP 鉴权失败',
      },
      id: null,
    })
  })
})
