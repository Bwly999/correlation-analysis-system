import type { IncomingMessage, ServerResponse } from 'node:http'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { ToolAnnotations } from '@modelcontextprotocol/sdk/types.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import * as z from 'zod/v4'
import type { WorkflowAiPlan, WorkflowAiPlanRequest } from '../../ai/types.js'
import { validateWorkflowAiPlanAgainstContext } from '../../ai/planValidation.js'
import {
  getAgentExecutionRecord,
  getAgentSessionRecord,
  getAgentSessionStoreSnapshot,
} from './agentSessionStore.js'
import { getWorkflowAiSessionRecord } from '../workflowAi/orchestrator.js'
import { executeWorkflowPlanForSession } from './planExecution.js'
import type { WorkflowMcpRuntime } from './workflowMcpRuntime.js'
import {
  WORKFLOW_SESSION_ID_HEADER,
  WORKFLOW_USER_ID_HEADER,
  resolveSingleHeaderValue,
  type WorkflowRequestHeaders,
} from '../http/workflowHeaders.js'

type WorkflowMcpContext = {
  sessionId: string
  userId: string
}

type WorkflowMcpSessionRecord = {
  request: WorkflowAiPlanRequest
  state: {
    sessionId: string
    mode: WorkflowAiPlanRequest['mode']
    prompt: string
    status: string
    contextHints?: WorkflowAiPlanRequest['contextHints'] | null
    missingInfo: Array<{
      key: string
      label: string
      reason: string
      blocking: boolean
      suggestions?: string[]
    }>
    diagnostics: {
      issues: Array<{
        code: string
        message: string
        level: 'info' | 'warn' | 'error'
      }>
      lastFailedTool?: string
    }
  }
}

const WORKFLOW_MCP_PATH = '/api/opencode/workflow-mcp'
const WORKFLOW_MCP_HEALTH_PATH = '/api/opencode/workflow-mcp/health'
const WORKFLOW_MCP_AUTH_HEADER = 'x-workflow-mcp-auth-token'

const paginationSchema = {
  limit: z.number().int().min(1).max(100).optional().describe('单页返回数量，默认 20，最大 100'),
  offset: z.number().int().min(0).optional().describe('从第几条开始返回，默认 0'),
}

const resolvePagination = (input: { limit?: number, offset?: number } = {}) => ({
  limit: Math.min(Math.max(Math.floor(input.limit ?? 20), 1), 100),
  offset: Math.max(Math.floor(input.offset ?? 0), 0),
})

const paginateItems = <T>(items: T[], input: { limit?: number, offset?: number } = {}) => {
  const { limit, offset } = resolvePagination(input)
  const pageItems = items.slice(offset, offset + limit)
  const nextOffset = offset + pageItems.length
  const hasMore = nextOffset < items.length

  return {
    total: items.length,
    count: pageItems.length,
    offset,
    limit,
    hasMore,
    nextOffset: hasMore ? nextOffset : null,
    items: pageItems,
  }
}

const positionSchema = z.object({
  x: z.number(),
  y: z.number(),
})

const workflowOperationSchema = z.discriminatedUnion('type', [
  z.object({
    id: z.string(),
    type: z.literal('createNode'),
    nodeType: z.string(),
    nodeLabel: z.string().optional(),
    position: positionSchema.optional(),
    config: z.record(z.string(), z.unknown()).optional(),
  }),
  z.object({
    id: z.string(),
    type: z.literal('updateNodeConfig'),
    nodeRef: z.string(),
    config: z.record(z.string(), z.unknown()),
  }),
  z.object({
    id: z.string(),
    type: z.literal('renameNode'),
    nodeRef: z.string(),
    label: z.string(),
  }),
  z.object({
    id: z.string(),
    type: z.literal('removeNode'),
    nodeRef: z.string(),
  }),
  z.object({
    id: z.string(),
    type: z.literal('connectNodes'),
    sourceRef: z.string(),
    targetRef: z.string(),
    sourceHandle: z.string().optional(),
    targetHandle: z.string().optional(),
  }),
  z.object({
    id: z.string(),
    type: z.literal('disconnectEdge'),
    edgeRef: z.string(),
  }),
  z.object({
    id: z.string(),
    type: z.literal('moveNode'),
    nodeRef: z.string(),
    position: positionSchema,
  }),
])

const planSchema = z.object({
  summary: z.string(),
  assumptions: z.array(z.string()),
  warnings: z.array(z.string()),
  questions: z.array(z.string()).optional(),
  operations: z.array(workflowOperationSchema),
})

const workflowSummaryOutputSchema = {
  ok: z.boolean(),
  workflowId: z.string(),
  appliedOperations: z.number().optional(),
  workflowSnapshot: z.record(z.string(), z.unknown()).optional(),
  validation: z.record(z.string(), z.unknown()).optional(),
}

const executionOutputSchema = {
  ok: z.boolean(),
  executionId: z.string(),
  status: z.string(),
  finalResults: z.array(z.unknown()).optional(),
  error: z.unknown().nullable().optional(),
}

const buildToolResult = <T extends Record<string, unknown>>(structuredContent: T) => ({
  content: [
    {
      type: 'text' as const,
      text: JSON.stringify(structuredContent, null, 2),
    },
  ],
  structuredContent,
})

type WorkflowMcpToolDefinition = {
  name: string
  description: string
  inputSchema?: Record<string, z.ZodTypeAny>
  outputSchema?: Record<string, z.ZodTypeAny>
  annotations?: ToolAnnotations
  handler: (input: any) => ReturnType<typeof buildToolResult> | Promise<ReturnType<typeof buildToolResult>>
}

const workflowMcpToolMetrics = {
  totalCalls: 0,
  totalFailures: 0,
  byTool: {} as Record<string, { calls: number, failures: number }>,
}

const ensureWorkflowToolMetric = (toolName: string) => {
  if (!workflowMcpToolMetrics.byTool[toolName]) {
    workflowMcpToolMetrics.byTool[toolName] = {
      calls: 0,
      failures: 0,
    }
  }
  return workflowMcpToolMetrics.byTool[toolName]
}

const trackWorkflowToolCall = (toolName: string, failed: boolean) => {
  workflowMcpToolMetrics.totalCalls += 1
  const metric = ensureWorkflowToolMetric(toolName)
  metric.calls += 1
  if (!failed) return
  workflowMcpToolMetrics.totalFailures += 1
  metric.failures += 1
}

const getWorkflowToolDefinitions = (
  context: WorkflowMcpContext,
  sessionRecord: WorkflowMcpSessionRecord,
  runtime: WorkflowMcpRuntime,
): WorkflowMcpToolDefinition[] => [
  {
    name: 'list_workflow_tools',
    description: '列出当前 workflow MCP 可用工具及其用途。',
    annotations: { readOnlyHint: true, openWorldHint: false },
    handler: () =>
      buildToolResult({
        total: getWorkflowToolDefinitions(context, sessionRecord, runtime).length,
        items: getWorkflowToolDefinitions(context, sessionRecord, runtime).map((tool) => ({
          name: tool.name,
          description: tool.description,
        })),
      }),
  },
  {
    name: 'workflow_get_session_context',
    description: '读取当前分析会话上下文，供 AI 规划工作流和补充缺失参数。',
    annotations: { readOnlyHint: true, openWorldHint: false },
    handler: () =>
      buildToolResult({
        sessionId: sessionRecord.state.sessionId,
        mode: sessionRecord.state.mode,
        prompt: sessionRecord.state.prompt,
        status: sessionRecord.state.status,
        workflowSnapshot: sessionRecord.request.workflowSnapshot ?? null,
        contextHints: sessionRecord.request.contextHints ?? sessionRecord.state.contextHints ?? null,
        missingInfo: sessionRecord.state.missingInfo,
        diagnostics: sessionRecord.state.diagnostics,
      }),
  },
  {
    name: 'workflow_get_node_catalog',
    description: '返回当前系统可用的工作流节点目录、连接约束和配置描述。',
    annotations: { readOnlyHint: true, openWorldHint: false },
    inputSchema: paginationSchema,
    handler: ({ limit, offset }) =>
      buildToolResult(paginateItems(sessionRecord.request.nodeCatalog, { limit, offset })),
  },
  {
    name: 'workflow_list_data_sources',
    description: '列出当前分析会话可用的数据源及绑定入口。',
    annotations: { readOnlyHint: true, openWorldHint: false },
    inputSchema: paginationSchema,
    handler: ({ limit, offset }) =>
      buildToolResult(paginateItems(sessionRecord.request.dataSources ?? [], { limit, offset })),
  },
  {
    name: 'workflow_get_data_source_schema',
    description: '读取指定数据源的字段摘要、候选目标和候选因子。',
    annotations: { readOnlyHint: true, openWorldHint: false },
    inputSchema: {
      dataSourceId: z.string().describe('会话内数据源 ID'),
    },
    handler: ({ dataSourceId }) => {
      const item = (sessionRecord.request.dataSources ?? []).find((source) => source.id === dataSourceId)
      if (!item) {
        return buildToolResult({
          found: false,
          message: `未找到数据源: ${dataSourceId}`,
        })
      }

      return buildToolResult({
        found: true,
        item,
      })
    },
  },
  {
    name: 'workflow_profile_data_source',
    description: '基于会话数据源样本生成字段画像、缺失率、唯一值和候选目标/因子。',
    annotations: { readOnlyHint: true, openWorldHint: false },
    inputSchema: {
      dataSourceId: z.string().describe('会话内数据源 ID'),
    },
    handler: ({ dataSourceId }) =>
      buildToolResult(runtime.profileDataSource(sessionRecord.request, dataSourceId)),
  },
  {
    name: 'workflow_recommend_methods',
    description: '基于数据画像推荐相关性、回归、分类或特征重要性等可执行分析方法。',
    annotations: { readOnlyHint: true, openWorldHint: false },
    inputSchema: {
      dataSourceId: z.string().describe('会话内数据源 ID'),
    },
    handler: ({ dataSourceId }) =>
      buildToolResult(runtime.recommendMethods(sessionRecord.request, dataSourceId)),
  },
  {
    name: 'workflow_get_node_definition',
    description: '按节点类型读取单个节点定义。',
    annotations: { readOnlyHint: true, openWorldHint: false },
    inputSchema: {
      nodeType: z.string().describe('节点类型名称，例如 pearson 或 manual-json-import'),
    },
    handler: ({ nodeType }) => {
      const item = sessionRecord.request.nodeCatalog.find((node) => node.name === nodeType)
      if (!item) {
        return buildToolResult({
          found: false,
          message: `未找到节点定义: ${nodeType}`,
        })
      }

      return buildToolResult({
        found: true,
        item,
      })
    },
  },
  {
    name: 'workflow_search_nodes',
    description: '按关键字搜索适合当前任务的工作流节点。',
    annotations: { readOnlyHint: true, openWorldHint: false },
    inputSchema: {
      query: z.string().optional().describe('节点搜索关键词，可为空'),
      ...paginationSchema,
    },
    handler: ({ query, limit, offset }) => {
      const result = runtime.searchNodes(query ?? '')
      return buildToolResult(paginateItems(result.items, { limit, offset }))
    },
  },
  {
    name: 'workflow_get_node',
    description: '读取单个节点定义，可切换为说明文档、属性搜索或运行时要求模式。',
    annotations: { readOnlyHint: true, openWorldHint: false },
    inputSchema: {
      nodeType: z.string().describe('节点类型名称'),
      mode: z.enum(['info', 'docs', 'search_properties', 'runtime_requirements']).optional(),
      propertyQuery: z.string().optional().describe('属性搜索关键词'),
      config: z.record(z.string(), z.unknown()).optional().describe('当前节点配置'),
    },
    handler: ({ nodeType, mode, propertyQuery, config }) =>
      buildToolResult(runtime.getNode(nodeType, mode, propertyQuery, config)),
  },
  {
    name: 'workflow_get_node_options',
    description: '解析节点某个属性的候选选项，支持依赖当前配置和上游样本。',
    annotations: { readOnlyHint: true, openWorldHint: false },
    inputSchema: {
      nodeType: z.string().describe('节点类型名称'),
      propertyName: z.string().describe('属性路径'),
      config: z.record(z.string(), z.unknown()).optional().describe('当前节点配置'),
      upstreamSample: z.unknown().optional().describe('上游样本数据'),
    },
    handler: async ({ nodeType, propertyName, config, upstreamSample }) =>
      buildToolResult(await runtime.getNodeOptions(nodeType, propertyName, config, upstreamSample)),
  },
  {
    name: 'workflow_validate_plan',
    description: '校验工作流计划是否满足当前节点目录、现有画布上下文和连接规则。',
    annotations: { readOnlyHint: true, openWorldHint: false },
    inputSchema: {
      plan: planSchema.describe('待校验的工作流计划 JSON'),
    },
    handler: ({ plan }) => {
      const validation = validateWorkflowAiPlanAgainstContext(plan as WorkflowAiPlan, {
        nodeCatalog: sessionRecord.request.nodeCatalog,
        ...getExistingWorkflowContext(sessionRecord.request),
      })

      return buildToolResult({
        valid: validation.valid,
        issues: validation.issues,
      })
    },
  },
  {
    name: 'workflow_create_workflow',
    description: '创建一个空白工作流，供后续增量搭建。',
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    inputSchema: {
      workflowId: z.string().optional().describe('工作流 ID，不传则自动生成'),
      name: z.string().optional().describe('工作流名称'),
    },
    handler: async ({ workflowId, name }) =>
      buildToolResult({
        ok: true,
        workflow: await runtime.createWorkflow(context.userId, { workflowId, name }),
      }),
  },
  {
    name: 'workflow_get_workflow',
    description: '按 ID 读取工作流，可返回完整结构、摘要结构或最小信息。',
    annotations: { readOnlyHint: true, openWorldHint: false },
    inputSchema: {
      workflowId: z.string().describe('工作流 ID'),
      mode: z.enum(['full', 'structure', 'minimal']).optional(),
    },
    handler: async ({ workflowId, mode }) =>
      buildToolResult(await runtime.getWorkflow(context.userId, workflowId, mode)),
  },
  {
    name: 'workflow_update_partial_workflow',
    description: '按操作列表增量修改工作流，适合 AI 逐步搭建和调试。',
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    inputSchema: {
      workflowId: z.string().describe('工作流 ID'),
      operations: z.array(workflowOperationSchema).describe('增量操作列表'),
      summary: z.string().optional().describe('本次操作摘要'),
      validateAfterApply: z.boolean().optional().describe('应用后是否自动校验'),
    },
    outputSchema: workflowSummaryOutputSchema,
    handler: async ({ workflowId, operations, summary, validateAfterApply }) =>
      buildToolResult(
        await runtime.updatePartialWorkflow(
          context.userId,
          workflowId,
          operations as WorkflowAiPlan['operations'],
          summary,
          validateAfterApply,
        ),
      ),
  },
  {
    name: 'workflow_update_full_workflow',
    description: '整包替换工作流内容，适合已有完整草案时一次性写入。',
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    inputSchema: {
      workflow: z.object({
        id: z.string(),
        name: z.string(),
        updatedAt: z.number().optional(),
        nodes: z.array(z.record(z.string(), z.unknown())),
        edges: z.array(z.record(z.string(), z.unknown())),
      }),
    },
    handler: async ({ workflow }) =>
      buildToolResult(
        await runtime.updateFullWorkflow(context.userId, {
          ...workflow,
          updatedAt: workflow.updatedAt ?? Date.now(),
        }),
      ),
  },
  {
    name: 'workflow_validate_workflow',
    description: '校验工作流结构，可传 workflowId 或直接传 workflowSnapshot。',
    annotations: { readOnlyHint: true, openWorldHint: false },
    inputSchema: {
      workflowId: z.string().optional().describe('已保存工作流 ID'),
      workflowSnapshot: z.object({
        name: z.string(),
        nodes: z.array(z.record(z.string(), z.unknown())),
        edges: z.array(z.record(z.string(), z.unknown())),
      }).optional(),
    },
    handler: async ({ workflowId, workflowSnapshot }) =>
      buildToolResult(await runtime.validateWorkflow(context.userId, { workflowId, workflowSnapshot })),
  },
  {
    name: 'workflow_debug_node',
    description: '复用上游链路调试单个节点，并返回节点报错或结果摘要。',
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    inputSchema: {
      workflowId: z.string().describe('工作流 ID'),
      nodeId: z.string().describe('目标节点 ID'),
      mode: z.enum(['reuse_cached_upstream', 'rerun_upstream']).optional(),
      includeUpstreamTrace: z.boolean().optional().describe('是否返回上游执行轨迹'),
    },
    handler: async ({ workflowId, nodeId, mode, includeUpstreamTrace }) =>
      buildToolResult(
        await runtime.debugNode(context.userId, sessionRecord.request, {
          workflowId,
          nodeId,
          mode,
          includeUpstreamTrace,
        }),
      ),
  },
  {
    name: 'workflow_test_workflow',
    description: '执行一次完整工作流并落历史记录，供 AI 读取结果和继续调试。',
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    inputSchema: {
      workflowId: z.string().describe('工作流 ID'),
    },
    handler: async ({ workflowId }) =>
      buildToolResult(await runtime.testWorkflow(context.userId, sessionRecord.request, { workflowId })),
  },
  {
    name: 'workflow_executions',
    description: '查询历史执行记录、单节点结果或产物摘要。',
    annotations: { readOnlyHint: true, openWorldHint: false },
    inputSchema: {
      mode: z.enum(['list', 'get', 'node_result', 'artifacts']).optional(),
      executionId: z.string().optional().describe('执行记录 ID'),
      nodeId: z.string().optional().describe('节点 ID'),
      ...paginationSchema,
    },
    handler: async ({ mode, executionId, nodeId, limit, offset }) =>
      buildToolResult(await runtime.executions(context.userId, { mode, executionId, nodeId, limit, offset })),
  },
  {
    name: 'workflow_extract_result_evidence',
    description: '从指定执行记录中抽取可引用证据，供最终报告绑定 evidenceIds。',
    annotations: { readOnlyHint: true, openWorldHint: false },
    inputSchema: {
      executionId: z.string().describe('执行记录 ID'),
    },
    handler: ({ executionId }) =>
      buildToolResult(runtime.extractResultEvidence(getAgentExecutionRecord(context.sessionId, executionId))),
  },
  {
    name: 'workflow_list_workflow_versions',
    description: '只读分页查询指定工作流的版本历史。',
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    inputSchema: {
      workflowId: z.string().describe('工作流 ID'),
      ...paginationSchema,
    },
    handler: async ({ workflowId, limit, offset }) =>
      buildToolResult(await runtime.listWorkflowVersions(context.userId, { workflowId, limit, offset })),
  },
  {
    name: 'workflow_get_workflow_version',
    description: '只读读取指定工作流版本内容。',
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    inputSchema: {
      workflowId: z.string().describe('工作流 ID'),
      versionId: z.string().describe('版本 ID'),
    },
    handler: async ({ workflowId, versionId }) =>
      buildToolResult(await runtime.getWorkflowVersion(context.userId, { workflowId, versionId })),
  },
  {
    name: 'workflow_rollback_workflow_version',
    description: '将工作流回滚到指定历史版本，会修改当前工作流。',
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    inputSchema: {
      workflowId: z.string().describe('工作流 ID'),
      versionId: z.string().describe('版本 ID'),
    },
    handler: async ({ workflowId, versionId }) =>
      buildToolResult(await runtime.rollbackWorkflowVersion(context.userId, { workflowId, versionId })),
  },
  {
    name: 'workflow_workflow_versions',
    description: '兼容旧版：查询、读取或回滚工作流版本历史。新实现优先使用 workflow_list_workflow_versions、workflow_get_workflow_version、workflow_rollback_workflow_version。',
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    inputSchema: {
      mode: z.enum(['list', 'get', 'rollback']).optional(),
      workflowId: z.string().describe('工作流 ID'),
      versionId: z.string().optional().describe('版本 ID'),
      ...paginationSchema,
    },
    handler: async ({ mode, workflowId, versionId, limit, offset }) =>
      buildToolResult(await runtime.workflowVersions(context.userId, { mode, workflowId, versionId, limit, offset })),
  },
  {
    name: 'workflow_get_execution_result',
    description: '按 executionId 读取会话内的节点执行摘要和终止节点结果。',
    annotations: { readOnlyHint: true, openWorldHint: false },
    inputSchema: {
      executionId: z.string().describe('执行记录 ID'),
    },
    handler: ({ executionId }) => {
      const execution = getAgentExecutionRecord(context.sessionId, executionId)
      return buildToolResult({
        found: Boolean(execution),
        execution,
      })
    },
  },
  {
    name: 'workflow_execute_plan',
    description: '使用会话内数据源绑定执行工作流计划，并生成可查询的执行结果。',
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    inputSchema: {
      plan: planSchema.describe('待执行的工作流计划 JSON'),
      bindings: z.record(z.string(), z.string()).describe('节点 ID 到数据源 ID 的绑定表'),
    },
    outputSchema: executionOutputSchema,
    handler: async ({ plan, bindings }) => {
      const execution = await executeWorkflowPlanForSession({
        sessionId: context.sessionId,
        request: sessionRecord.request,
        plan: plan as WorkflowAiPlan,
        bindings,
      })

      return buildToolResult({
        ok: true,
        executionId: execution.executionId,
        status: execution.status,
        finalResults: execution.finalResults,
        error: execution.error ?? null,
      })
    },
  },
]

const resolveWorkflowMcpContext = (
  headers: IncomingMessage['headers'],
  resolveStorageUser?: (headers: WorkflowRequestHeaders) => { id: string },
): WorkflowMcpContext => {
  const sessionId = resolveSingleHeaderValue(headers[WORKFLOW_SESSION_ID_HEADER])
  if (!sessionId) {
    throw new Error(`缺少 ${WORKFLOW_SESSION_ID_HEADER} 请求头`)
  }

  const userId =
    resolveStorageUser?.(headers as WorkflowRequestHeaders).id
    ?? resolveSingleHeaderValue(headers[WORKFLOW_USER_ID_HEADER])
  if (!userId) {
    throw new Error(`缺少 ${WORKFLOW_USER_ID_HEADER} 请求头`)
  }

  return {
    sessionId,
    userId,
  }
}

const resolveWorkflowMcpAuthToken = () => process.env.WORKFLOW_MCP_AUTH_TOKEN?.trim() || ''

const assertWorkflowMcpAuth = (headers: IncomingMessage['headers']) => {
  const expectedToken = resolveWorkflowMcpAuthToken()
  if (!expectedToken) return

  const receivedHeader = headers[WORKFLOW_MCP_AUTH_HEADER]
  const receivedToken = Array.isArray(receivedHeader) ? receivedHeader[0] : receivedHeader
  if (receivedToken === expectedToken) return
  const error = new Error('workflow MCP 鉴权失败')
  ;(error as Error & { statusCode?: number }).statusCode = 401
  throw error
}

const getSessionRecordOrThrow = (context: WorkflowMcpContext): WorkflowMcpSessionRecord => {
  const workflowAiRecord = getWorkflowAiSessionRecord(context.sessionId)
  if (workflowAiRecord) {
    return workflowAiRecord
  }

  const agentRecord = getAgentSessionRecord(context.sessionId)
  if (agentRecord) {
    return {
      request: agentRecord.request,
      state: {
        sessionId: agentRecord.session.id,
        mode: agentRecord.session.mode,
        prompt: agentRecord.session.prompt,
        status: agentRecord.session.status,
        contextHints: agentRecord.request.contextHints ?? null,
        missingInfo: [],
        diagnostics: {
          issues: agentRecord.projection.error
            ? [
                {
                  code: 'agent_projection_error',
                  message: agentRecord.projection.error.message,
                  level: 'error' as const,
                },
              ]
            : [],
        },
      },
    }
  }

  throw new Error(`未找到会话 ${context.sessionId}`)
}

const getExistingWorkflowContext = (request: WorkflowAiPlanRequest) => ({
  existingNodes:
    request.workflowSnapshot?.nodes
      .map((node) => {
        if (!node || typeof node !== 'object') return null
        const payload = node as Record<string, unknown>
        const id = typeof payload.id === 'string' ? payload.id : ''
        const type = typeof payload.type === 'string' ? payload.type : ''
        if (!id || !type) return null
        return {
          id,
          type,
          config:
            payload.config && typeof payload.config === 'object'
              ? (payload.config as Record<string, unknown>)
              : undefined,
        }
      })
      .filter((item) => item !== null)
    ?? [],
  existingEdges:
    request.workflowSnapshot?.edges
      .map((edge) => {
        if (!edge || typeof edge !== 'object') return null
        const payload = edge as Record<string, unknown>
        const source = typeof payload.source === 'string' ? payload.source : ''
        const target = typeof payload.target === 'string' ? payload.target : ''
        if (!source || !target) return null
        return {
          id: typeof payload.id === 'string' ? payload.id : undefined,
          source,
          target,
        }
      })
      .filter((item) => item !== null)
    ?? [],
})

const createWorkflowMcpServer = (
  context: WorkflowMcpContext,
  runtime: WorkflowMcpRuntime,
) => {
  const sessionRecord = getSessionRecordOrThrow(context)
  const server = new McpServer({
    name: 'correlation-analysis-workflow-mcp',
    version: '1.0.0',
  })

  for (const tool of getWorkflowToolDefinitions(context, sessionRecord, runtime)) {
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        ...(tool.inputSchema ? { inputSchema: tool.inputSchema } : {}),
        ...(tool.outputSchema ? { outputSchema: tool.outputSchema } : {}),
        ...(tool.annotations ? { annotations: tool.annotations } : {}),
      },
      async (input) => {
        try {
          const result = await tool.handler(input)
          trackWorkflowToolCall(tool.name, false)
          return result
        } catch (error) {
          trackWorkflowToolCall(tool.name, true)
          throw error
        }
      },
    )
  }

  return server
}

const sendMcpHttpError = (
  response: ServerResponse,
  statusCode: number,
  message: string,
  errorCode = -32603,
) => {
  response.statusCode = statusCode
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.end(
    JSON.stringify({
      jsonrpc: '2.0',
      error: {
        code: errorCode,
        message,
      },
      id: null,
    }),
  )
}

export const isWorkflowMcpRequest = (pathname: string) => pathname === WORKFLOW_MCP_PATH
export const isWorkflowMcpHealthRequest = (pathname: string) => pathname === WORKFLOW_MCP_HEALTH_PATH

export const getWorkflowMcpHealthSnapshot = () => ({
  status: 'ok' as const,
  authEnabled: Boolean(resolveWorkflowMcpAuthToken()),
  sessionStore: getAgentSessionStoreSnapshot(),
  toolMetrics: {
    totalCalls: workflowMcpToolMetrics.totalCalls,
    totalFailures: workflowMcpToolMetrics.totalFailures,
    byTool: workflowMcpToolMetrics.byTool,
  },
})

export const handleWorkflowMcpRequest = async (
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: {
    runtime: WorkflowMcpRuntime
    resolveStorageUser?: (headers: WorkflowRequestHeaders) => { id: string }
  },
) => {
  let server: McpServer | null = null
  let transport: StreamableHTTPServerTransport | null = null

  try {
    if (!dependencies.runtime) {
      throw new Error('workflow MCP runtime 未注入')
    }
    assertWorkflowMcpAuth(request.headers)
    const context = resolveWorkflowMcpContext(request.headers, dependencies.resolveStorageUser)
    server = createWorkflowMcpServer(context, dependencies.runtime)
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    })
    await server.connect(transport)
    await transport.handleRequest(request, response)
  } catch (error) {
    if (!response.headersSent) {
      sendMcpHttpError(
        response,
        typeof error === 'object' && error !== null && 'statusCode' in error && typeof error.statusCode === 'number'
          ? error.statusCode
          : 500,
        error instanceof Error ? error.message : '处理 workflow MCP 请求失败',
        typeof error === 'object' && error !== null && 'statusCode' in error && error.statusCode === 401
          ? -32001
          : -32603,
      )
    }
  } finally {
    await transport?.close()
    await server?.close()
  }
}
