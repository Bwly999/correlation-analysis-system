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
      const tool = currentTools.get('workflow_get_session_context')
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
import { saveUserWorkflow } from '../../storage.js'

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
      name: 'file-import',
      displayName: '本地文件导入',
      category: 'trigger',
      description: '从 CSV、JSON、Excel 等本地文件读取原始因子数据。',
      inputMode: 'single' as const,
      minInputs: 0,
      maxInputs: 0,
      allowedNextCategories: ['action', 'terminal'],
      properties: [],
      help: null,
      assistantHints: null,
    },
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
    {
      name: 'pearson',
      displayName: 'Pearson 相关系数',
      category: 'terminal',
      description: '计算相关性。',
      inputMode: 'single' as const,
      minInputs: 1,
      maxInputs: 1,
      allowedNextCategories: [],
      properties: [],
      help: null,
      assistantHints: null,
    },
  ],
  dataSources: [
    {
      id: 'ds_sales_csv',
      kind: 'file' as const,
      entryNodeType: 'file-import' as const,
      label: '销量 CSV',
      sourceMeta: {
        filename: 'sales.csv',
        format: 'csv',
      },
      schemaSummary: {
        nodeId: 'ds_sales_csv',
        nodeLabel: '销量 CSV',
        resultKind: 'table' as const,
        rowCount: 4,
        numericColumns: ['price', 'discount', 'sales'],
        candidateTargetColumns: ['sales'],
        candidateFeatureColumns: ['price', 'discount'],
        blockedReasons: [],
      },
      bindingPayload: {
        format: 'csv',
        rows: [
          { price: 10, discount: 1, sales: 100 },
          { price: 11, discount: 1, sales: 102 },
          { price: 13, discount: 2, sales: 120 },
          { price: 15, discount: 0, sales: 150 },
        ],
      },
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
            name: 'workflow_get_session_context',
          }),
          expect.objectContaining({
            name: 'workflow_list_data_sources',
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

  it('exposes session data sources and their schema summaries', async () => {
    const created = await createAgentSession({
      request: buildAgentRequest(),
      userId: 'user_1',
    })

    const request = createRequest(created.session.id)
    const response = createResponse()

    await handleWorkflowMcpRequest(request, response)

    const listDataSources = currentTools.get('workflow_list_data_sources')
    const getDataSourceSchema = currentTools.get('workflow_get_data_source_schema')

    expect(listDataSources).toBeTypeOf('function')
    expect(getDataSourceSchema).toBeTypeOf('function')

    const listResult = await listDataSources?.({})
    expect(listResult?.structuredContent).toMatchObject({
      total: 1,
      items: [
        expect.objectContaining({
          id: 'ds_sales_csv',
          entryNodeType: 'file-import',
          label: '销量 CSV',
        }),
      ],
    })

    const schemaResult = await getDataSourceSchema?.({ dataSourceId: 'ds_sales_csv' })
    expect(schemaResult?.structuredContent).toMatchObject({
      found: true,
      item: expect.objectContaining({
        id: 'ds_sales_csv',
        schemaSummary: expect.objectContaining({
          candidateTargetColumns: ['sales'],
          candidateFeatureColumns: ['price', 'discount'],
        }),
      }),
    })
  })

  it('executes a workflow plan against a bound session data source and returns execution results', async () => {
    const created = await createAgentSession({
      request: buildAgentRequest(),
      userId: 'user_1',
    })

    const request = createRequest(created.session.id)
    const response = createResponse()

    await handleWorkflowMcpRequest(request, response)

    const executePlan = currentTools.get('workflow_execute_plan')
    const getExecutionResult = currentTools.get('workflow_get_execution_result')

    expect(executePlan).toBeTypeOf('function')
    expect(getExecutionResult).toBeTypeOf('function')

    const executionStart = await executePlan?.({
      plan: {
        summary: '从 CSV 导入并分析销量相关性',
        assumptions: [],
        warnings: [],
        operations: [
          {
            id: 'node_import_1',
            type: 'createNode',
            nodeType: 'file-import',
            nodeLabel: '本地文件导入',
          },
          {
            id: 'node_pearson_1',
            type: 'createNode',
            nodeType: 'pearson',
            nodeLabel: 'Pearson 相关系数',
          },
          {
            id: 'edge_1',
            type: 'connectNodes',
            sourceRef: 'node_import_1',
            targetRef: 'node_pearson_1',
          },
        ],
      },
      bindings: {
        node_import_1: 'ds_sales_csv',
      },
    })

    expect(executionStart?.structuredContent).toMatchObject({
      ok: true,
      status: 'completed',
      executionId: expect.any(String),
      finalResults: [
        expect.objectContaining({
          nodeId: 'node_pearson_1',
          resultKind: 'report',
        }),
      ],
    })

    const executionId = executionStart?.structuredContent.executionId as string
    const executionResult = await getExecutionResult?.({ executionId })
    expect(executionResult?.structuredContent).toMatchObject({
      found: true,
      execution: expect.objectContaining({
        executionId,
        bindings: {
          node_import_1: 'ds_sales_csv',
        },
        finalResults: [
          expect.objectContaining({
            nodeId: 'node_pearson_1',
            resultKind: 'report',
          }),
        ],
      }),
    })
  })

  it('exposes workflow_search_nodes and workflow_get_node for node discovery', async () => {
    const created = await createAgentSession({
      request: buildAgentRequest(),
      userId: 'user_1',
    })

    const request = createRequest(created.session.id)
    const response = createResponse()
    await handleWorkflowMcpRequest(request, response)

    const searchNodes = currentTools.get('workflow_search_nodes')
    const getNode = currentTools.get('workflow_get_node')

    expect(searchNodes).toBeTypeOf('function')
    expect(getNode).toBeTypeOf('function')

    const searchResult = await searchNodes?.({ query: 'pearson' })
    expect(searchResult?.structuredContent).toMatchObject({
      total: expect.any(Number),
      items: expect.arrayContaining([
        expect.objectContaining({
          name: 'pearson',
          displayName: 'Pearson 相关系数',
        }),
      ]),
    })

    const nodeResult = await getNode?.({ nodeType: 'pearson', mode: 'docs' })
    expect(nodeResult?.structuredContent).toMatchObject({
      found: true,
      item: expect.objectContaining({
        name: 'pearson',
      }),
      docs: expect.stringContaining('Pearson 相关系数'),
    })
  })

  it('exposes workflow_get_node_options for configurable node properties', async () => {
    const created = await createAgentSession({
      request: buildAgentRequest(),
      userId: 'user_1',
    })

    const request = createRequest(created.session.id)
    const response = createResponse()
    await handleWorkflowMcpRequest(request, response)

    const getNodeOptions = currentTools.get('workflow_get_node_options')
    expect(getNodeOptions).toBeTypeOf('function')

    const result = await getNodeOptions?.({
      nodeType: 'file-import',
      propertyName: 'format',
    })

    expect(result?.structuredContent).toMatchObject({
      found: true,
      propertyName: 'format',
      visible: true,
      options: expect.arrayContaining([
        expect.objectContaining({ value: 'auto', label: '自动识别' }),
        expect.objectContaining({ value: 'csv', label: 'CSV' }),
        expect.objectContaining({ value: 'xlsx', label: 'Excel' }),
      ]),
    })
  })

  it('applies workflow_update_partial_workflow operations to a saved workflow', async () => {
    const created = await createAgentSession({
      request: buildAgentRequest(),
      userId: 'user_1',
    })

    await saveUserWorkflow('user_1', {
      id: 'workflow_partial_update',
      name: '待增量更新流程',
      updatedAt: Date.now(),
      nodes: [],
      edges: [],
    })

    const request = createRequest(created.session.id)
    const response = createResponse()
    await handleWorkflowMcpRequest(request, response)

    const updatePartialWorkflow = currentTools.get('workflow_update_partial_workflow')
    const getWorkflow = currentTools.get('workflow_get_workflow')

    expect(updatePartialWorkflow).toBeTypeOf('function')
    expect(getWorkflow).toBeTypeOf('function')

    const updateResult = await updatePartialWorkflow?.({
      workflowId: 'workflow_partial_update',
      operations: [
        {
          id: 'node_manual_1',
          type: 'createNode',
          nodeType: 'manual-json-import',
          nodeLabel: '手动输入数据',
          config: {
            jsonData: JSON.stringify([
              { price: 10, sales: 100 },
              { price: 11, sales: 105 },
            ]),
            autoClean: true,
          },
        },
        {
          id: 'node_pearson_1',
          type: 'createNode',
          nodeType: 'pearson',
          nodeLabel: 'Pearson 相关系数',
          config: {
            xFields: ['price'],
            yFields: ['sales'],
          },
        },
        {
          id: 'edge_1',
          type: 'connectNodes',
          sourceRef: 'node_manual_1',
          targetRef: 'node_pearson_1',
        },
      ],
    })

    expect(updateResult?.structuredContent).toMatchObject({
      ok: true,
      workflowId: 'workflow_partial_update',
      appliedOperations: 3,
      workflowSnapshot: expect.objectContaining({
        nodeCount: 2,
        edgeCount: 1,
      }),
    })

    const workflowResult = await getWorkflow?.({
      workflowId: 'workflow_partial_update',
      mode: 'structure',
    })

    expect(workflowResult?.structuredContent).toMatchObject({
      found: true,
      workflow: expect.objectContaining({
        id: 'workflow_partial_update',
        nodes: expect.arrayContaining([
          expect.objectContaining({ id: 'node_manual_1', type: 'manual-json-import' }),
          expect.objectContaining({ id: 'node_pearson_1', type: 'pearson' }),
        ]),
        edges: [
          expect.objectContaining({
            source: 'node_manual_1',
            target: 'node_pearson_1',
          }),
        ],
      }),
    })
  })

  it('debugs a single node and returns upstream trace with the raw node result summary', async () => {
    const created = await createAgentSession({
      request: buildAgentRequest(),
      userId: 'user_1',
    })

    await saveUserWorkflow('user_1', {
      id: 'workflow_debug_node',
      name: '节点调试流程',
      updatedAt: Date.now(),
      nodes: [
        {
          id: 'node_manual_1',
          type: 'manual-json-import',
          label: '手动输入数据',
          config: {
            jsonData: JSON.stringify([
              { price: 10, sales: 100 },
              { price: 11, sales: 110 },
              { price: 12, sales: 120 },
              { price: 13, sales: 130 },
            ]),
            autoClean: true,
          },
        },
        {
          id: 'node_pearson_1',
          type: 'pearson',
          label: 'Pearson 相关系数',
          config: {
            xFields: ['price'],
            yFields: ['sales'],
          },
        },
      ],
      edges: [
        {
          id: 'edge_1',
          source: 'node_manual_1',
          target: 'node_pearson_1',
        },
      ],
    })

    const request = createRequest(created.session.id)
    const response = createResponse()
    await handleWorkflowMcpRequest(request, response)

    const debugNode = currentTools.get('workflow_debug_node')
    expect(debugNode).toBeTypeOf('function')

    const debugResult = await debugNode?.({
      workflowId: 'workflow_debug_node',
      nodeId: 'node_pearson_1',
      includeUpstreamTrace: true,
    })

    expect(debugResult?.structuredContent).toMatchObject({
      ok: true,
      nodeId: 'node_pearson_1',
      nodeType: 'pearson',
      sourceKind: 'draft-ephemeral-run',
      resultKind: 'report',
      resultSummary: expect.any(String),
      upstreamTrace: [
        expect.objectContaining({
          nodeId: 'node_manual_1',
          status: 'success',
        }),
      ],
      outputPreview: expect.objectContaining({
        kind: 'report',
      }),
    })
  })
})
