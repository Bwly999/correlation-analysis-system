import { afterEach, describe, expect, it } from 'vitest'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { createServerHandler } from '../../app.js'
import { createAgentSession } from '../../piAgent/workflowAgentGateway.js'

const buildAgentRequest = () => ({
  mode: 'create' as const,
  prompt: '请基于当前多因子分析系统，为销量寻找最相关的影响因素',
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

const startTestServer = async () =>
  new Promise<{ server: Server, baseUrl: string }>((resolve, reject) => {
    const server = createServer(createServerHandler())
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        reject(new Error('无法获取测试服务端口'))
        return
      }

      resolve({
        server,
        baseUrl: `http://127.0.0.1:${(address as AddressInfo).port}`,
      })
    })
  })

describe('workflow MCP transport', () => {
  const cleanups: Array<() => Promise<void>> = []

  afterEach(async () => {
    while (cleanups.length > 0) {
      await cleanups.pop()?.()
    }
  })

  it('connects through the real MCP streamable HTTP transport and serves workflow tools', async () => {
    const created = await createAgentSession({
      request: buildAgentRequest(),
      userId: 'user_1',
    })

    const { server, baseUrl } = await startTestServer()
    cleanups.push(
      () =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => {
            if (error) {
              reject(error)
              return
            }
            resolve()
          })
        }),
    )

    const client = new Client({
      name: 'workflow-mcp-transport-test',
      version: '1.0.0',
    })
    const transport = new StreamableHTTPClientTransport(new URL(`${baseUrl}/api/opencode/workflow-mcp`), {
      requestInit: {
        headers: new Headers({
          'x-workflow-session-id': created.session.id,
          'x-workflow-user-id': 'user_1',
        }),
      },
    })
    cleanups.push(async () => {
      await transport.close()
    })

    await client.connect(transport)

    const tools = await client.listTools()
    expect(tools.tools.map((tool) => tool.name)).toContain('workflow_get_session_context')

    const sessionContext = await client.callTool({
      name: 'workflow_get_session_context',
      arguments: {},
    })

    expect(sessionContext.isError).not.toBe(true)
    expect(sessionContext.structuredContent).toMatchObject({
      sessionId: created.session.id,
      prompt: '请基于当前多因子分析系统，为销量寻找最相关的影响因素',
    })
  })
})
