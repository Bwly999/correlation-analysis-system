import type { IncomingMessage, ServerResponse } from 'node:http'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import * as z from 'zod/v4'
import type { WorkflowAiPlan, WorkflowAiPlanRequest } from '../../ai/types.js'
import { validateWorkflowAiPlanAgainstContext } from '../../ai/planValidation.js'
import {
  getUserWorkflowById,
  getUserWorkflowVersion,
  getUserWorkflowVersions,
  rollbackUserWorkflowVersion,
} from '../storage.js'
import { getWorkflowAiSessionRecord } from '../workflowAi/orchestrator.js'

type WorkflowMcpContext = {
  sessionId: string
  userId: string
}

const WORKFLOW_MCP_PATH = '/api/opencode/workflow-mcp'

const planSchema = z.object({
  summary: z.string(),
  assumptions: z.array(z.string()),
  warnings: z.array(z.string()),
  questions: z.array(z.string()).optional(),
  operations: z.array(z.any()),
})

const buildToolResult = <T extends Record<string, unknown>>(structuredContent: T) => ({
  content: [
    {
      type: 'text' as const,
      text: JSON.stringify(structuredContent, null, 2),
    },
  ],
  structuredContent,
})

const resolveWorkflowMcpContext = (headers: IncomingMessage['headers']): WorkflowMcpContext => {
  const sessionIdHeader = headers['x-workflow-ai-session-id']
  const userIdHeader = headers['x-workflow-storage-user-id']
  const sessionId = Array.isArray(sessionIdHeader) ? sessionIdHeader[0] : sessionIdHeader
  const userId = Array.isArray(userIdHeader) ? userIdHeader[0] : userIdHeader

  if (!sessionId) {
    throw new Error('缺少 x-workflow-ai-session-id 请求头')
  }

  return {
    sessionId,
    userId: userId || process.env.WORKFLOW_STORAGE_DEFAULT_USER_ID || 'server-demo-user',
  }
}

const getSessionRecordOrThrow = (context: WorkflowMcpContext) => {
  const sessionRecord = getWorkflowAiSessionRecord(context.sessionId)
  if (!sessionRecord) {
    throw new Error(`未找到会话 ${context.sessionId}`)
  }
  return sessionRecord
}

const getExistingWorkflowContext = (request: WorkflowAiPlanRequest) => ({
  existingNodes: request.workflowSnapshot?.nodes.map((node: any) => ({
    id: node.id,
    type: node.type,
    config: node.config,
  })) ?? [],
  existingEdges: request.workflowSnapshot?.edges.map((edge: any) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
  })) ?? [],
})

const createWorkflowMcpServer = (context: WorkflowMcpContext) => {
  const sessionRecord = getSessionRecordOrThrow(context)
  const server = new McpServer({
    name: 'correlation-analysis-workflow-mcp',
    version: '1.0.0',
  })

  server.registerTool(
    'get_analysis_session_context',
    {
      description: '读取当前分析会话上下文，包括目标、工作流快照、上下文提示和缺失信息。',
    },
    () =>
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
  )

  server.registerTool(
    'get_node_catalog',
    {
      description: '返回当前系统可用的工作流节点目录、连接约束和配置描述。',
    },
    () =>
      buildToolResult({
        total: sessionRecord.request.nodeCatalog.length,
        items: sessionRecord.request.nodeCatalog,
      }),
  )

  server.registerTool(
    'get_node_definition',
    {
      description: '按节点类型读取单个节点定义。',
      inputSchema: {
        nodeType: z.string().describe('节点类型名称，例如 pearson 或 manual-json-import'),
      },
    },
    ({ nodeType }) => {
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
  )

  server.registerTool(
    'validate_workflow_plan',
    {
      description: '校验工作流计划是否满足当前节点目录、现有画布上下文和连接规则。',
      inputSchema: {
        plan: planSchema.describe('待校验的工作流计划 JSON'),
      },
    },
    ({ plan }) => {
      const validation = validateWorkflowAiPlanAgainstContext(plan as WorkflowAiPlan, {
        nodeCatalog: sessionRecord.request.nodeCatalog,
        ...getExistingWorkflowContext(sessionRecord.request),
      })

      return buildToolResult({
        valid: validation.valid,
        issues: validation.issues,
      })
    },
  )

  server.registerTool(
    'get_saved_workflow',
    {
      description: '按工作流 ID 读取当前用户已保存的工作流快照。',
      inputSchema: {
        workflowId: z.string().describe('工作流 ID'),
      },
    },
    ({ workflowId }) => {
      const workflow = getUserWorkflowById(context.userId, workflowId)
      return buildToolResult({
        found: Boolean(workflow),
        workflow,
      })
    },
  )

  server.registerTool(
    'list_workflow_versions',
    {
      description: '列出某个工作流的历史版本。',
      inputSchema: {
        workflowId: z.string().describe('工作流 ID'),
      },
    },
    ({ workflowId }) =>
      buildToolResult({
        workflowId,
        items: getUserWorkflowVersions(context.userId, workflowId),
      }),
  )

  server.registerTool(
    'get_workflow_version',
    {
      description: '读取某个工作流的指定历史版本快照。',
      inputSchema: {
        workflowId: z.string().describe('工作流 ID'),
        versionId: z.string().describe('版本 ID'),
      },
    },
    ({ workflowId, versionId }) =>
      buildToolResult({
        workflowId,
        versionId,
        version: getUserWorkflowVersion(context.userId, workflowId, versionId),
      }),
  )

  server.registerTool(
    'rollback_workflow_version',
    {
      description: '将某个工作流回滚到指定历史版本，并创建新的回滚版本记录。',
      inputSchema: {
        workflowId: z.string().describe('工作流 ID'),
        versionId: z.string().describe('要回滚到的版本 ID'),
      },
    },
    ({ workflowId, versionId }) =>
      buildToolResult({
        workflowId,
        versionId,
        result: rollbackUserWorkflowVersion(context.userId, workflowId, versionId),
      }),
  )

  return server
}

const sendMcpHttpError = (response: ServerResponse, statusCode: number, message: string) => {
  response.statusCode = statusCode
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.end(
    JSON.stringify({
      jsonrpc: '2.0',
      error: {
        code: -32603,
        message,
      },
      id: null,
    }),
  )
}

export const isWorkflowMcpRequest = (pathname: string) => pathname === WORKFLOW_MCP_PATH

export const handleWorkflowMcpRequest = async (
  request: IncomingMessage,
  response: ServerResponse,
) => {
  let server: McpServer | null = null
  let transport: StreamableHTTPServerTransport | null = null

  try {
    const context = resolveWorkflowMcpContext(request.headers)
    server = createWorkflowMcpServer(context)
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    })
    await server.connect(transport)
    await transport.handleRequest(request, response)
  } catch (error) {
    if (!response.headersSent) {
      sendMcpHttpError(
        response,
        500,
        error instanceof Error ? error.message : '处理 workflow MCP 请求失败',
      )
    }
  } finally {
    await transport?.close()
    await server?.close()
  }
}
