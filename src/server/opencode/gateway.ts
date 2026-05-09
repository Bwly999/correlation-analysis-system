import { randomUUID } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:net'
import { createOpencodeClient, createOpencodeServer } from '@opencode-ai/sdk/v2'
import * as z from 'zod/v4'
import type {
  AgentObservabilityDebugHealth,
  AgentObservabilityDebugReplayResponse,
  AgentObservabilityDebugTraceResponse,
  AgentObservabilityLogFiles,
  AgentProjectionSnapshot,
  AgentSessionEvent,
  AgentSessionDebugRawMessage,
  AgentSessionMessage,
  AgentSessionMessageResponse,
  AgentSessionStartResponse,
  AgentSessionState,
  WorkflowAiModelProfile,
  WorkflowAiPlan,
  WorkflowAiPlanRequest,
} from '../../ai/types.js'
import { validateWorkflowAiPlanAgainstContext } from '../../ai/planValidation.js'
import { resolveModelProfile } from '../workflowAi/profiles.js'
import {
  WORKFLOW_SESSION_ID_HEADER,
  WORKFLOW_USER_ID_HEADER,
} from '../http/workflowHeaders.js'
import {
  appendAgentSessionMessage,
  appendAgentSessionDebugEvent,
  appendAgentSessionDebugParseFailure,
  appendAgentSessionDebugRawMessage,
  appendAgentSessionDebugToolCall,
  createAgentSessionRecord,
  getAgentSessionDebugTrace as getAgentSessionDebugTraceFromStore,
  getAgentSessionRecord,
  publishAgentSessionEvent,
  subscribeAgentSessionEvents,
  updateAgentSessionRecord,
  type AgentSessionRecord,
} from './agentSessionStore.js'
import {
  applyCanvasSyncState,
  applyExecutionState,
  applyProjectionError,
  applyStructuredResponseToProjection,
  applyToolCallState,
  buildInitialProjection,
  resolveAssistantMessageText,
  type AgentStructuredResponse,
} from './projection.js'
import {
  appendAgentObservabilityEvent,
  getAgentObservabilityDebugFiles as getAgentObservabilityDebugFilesFromStore,
  getAgentObservabilityDebugHealth as getAgentObservabilityDebugHealthFromStore,
  getAgentObservabilityDebugReplay as getAgentObservabilityDebugReplayFromStore,
  getAgentObservabilityDebugTrace as getAgentObservabilityDebugTraceFromStore,
  initializeAgentObservabilityTrace,
  recordAgentObservabilityProjection,
} from './agentObservability/store.js'
import { runAgentKernel } from './agentKernel/kernel.js'
import type { AgentKernelRuntimeAdapter, AgentKernelRuntimePromptInput } from './agentKernel/opencodeAdapter.js'
import type { AgentKernelObservation, AgentKernelVerificationStatus } from './agentKernel/types.js'


const WORKFLOW_MCP_NAME = 'workflow'
const OPENCODE_TEMP_ROOT = join(tmpdir(), 'correlation-analysis-system', 'opencode-runtime')
const OPENCODE_AGENT_REQUEST_TIMEOUT_MS = 45_000
const OPENCODE_SERVER_START_TIMEOUT_MS = Number(process.env.OPENCODE_SERVER_START_TIMEOUT_MS || '20000')
const ENABLE_AGENT_SESSION_DEBUG_STDOUT = process.env.AGENT_SESSION_DEBUG_STDOUT === '1'
const WORKFLOW_MCP_TOOL_NAMES = [
  'list_workflow_tools',
  'workflow_get_session_context',
  'workflow_get_node_catalog',
  'workflow_get_node_definition',
  'workflow_list_data_sources',
  'workflow_get_data_source_schema',
  'workflow_profile_data_source',
  'workflow_recommend_methods',
  'workflow_validate_plan',
  'workflow_get_execution_result',
  'workflow_extract_result_evidence',
  'workflow_execute_plan',
  'workflow_search_nodes',
  'workflow_get_node',
  'workflow_get_node_options',
  'workflow_create_workflow',
  'workflow_get_workflow',
  'workflow_update_partial_workflow',
  'workflow_update_full_workflow',
  'workflow_validate_workflow',
  'workflow_debug_node',
  'workflow_test_workflow',
  'workflow_executions',
  'workflow_list_workflow_versions',
  'workflow_get_workflow_version',
  'workflow_rollback_workflow_version',
  'workflow_workflow_versions',
] as const

const WORKFLOW_TOOL_DISPLAY_NAMES: Record<string, string> = {
  list_workflow_tools: '读取工具清单',
  workflow_get_session_context: '读取分析上下文',
  workflow_get_node_catalog: '读取节点目录',
  workflow_get_node_definition: '读取节点定义',
  workflow_list_data_sources: '列出数据源',
  workflow_get_data_source_schema: '读取字段摘要',
  workflow_profile_data_source: '生成数据画像',
  workflow_recommend_methods: '推荐分析方法',
  workflow_validate_plan: '校验工作流计划',
  workflow_get_execution_result: '读取执行结果',
  workflow_extract_result_evidence: '抽取结果证据',
  workflow_execute_plan: '执行工作流计划',
  workflow_search_nodes: '搜索节点',
  workflow_get_node: '读取节点信息',
  workflow_get_node_options: '解析节点选项',
  workflow_create_workflow: '创建工作流',
  workflow_get_workflow: '读取工作流',
  workflow_update_partial_workflow: '增量修改工作流',
  workflow_update_full_workflow: '整包替换工作流',
  workflow_validate_workflow: '校验工作流结构',
  workflow_debug_node: '调试节点',
  workflow_test_workflow: '测试完整工作流',
  workflow_executions: '查询执行历史',
  workflow_list_workflow_versions: '查询版本历史',
  workflow_get_workflow_version: '读取工作流版本',
  workflow_rollback_workflow_version: '回滚工作流版本',
  workflow_workflow_versions: '管理工作流版本',
}

const positionSchema = z.object({
  x: z.number(),
  y: z.number(),
})

const createNodeOperationSchema = z.object({
  id: z.string(),
  type: z.literal('createNode'),
  nodeType: z.string(),
  nodeLabel: z.string().optional(),
  position: positionSchema.optional(),
  config: z.record(z.string(), z.unknown()).optional(),
})

const updateNodeConfigOperationSchema = z.object({
  id: z.string(),
  type: z.literal('updateNodeConfig'),
  nodeRef: z.string(),
  config: z.record(z.string(), z.unknown()),
})

const renameNodeOperationSchema = z.object({
  id: z.string(),
  type: z.literal('renameNode'),
  nodeRef: z.string(),
  label: z.string(),
})

const removeNodeOperationSchema = z.object({
  id: z.string(),
  type: z.literal('removeNode'),
  nodeRef: z.string(),
})

const connectNodesOperationSchema = z.object({
  id: z.string(),
  type: z.literal('connectNodes'),
  sourceRef: z.string(),
  targetRef: z.string(),
  sourceHandle: z.string().optional(),
  targetHandle: z.string().optional(),
})

const disconnectEdgeOperationSchema = z.object({
  id: z.string(),
  type: z.literal('disconnectEdge'),
  edgeRef: z.string(),
})

const moveNodeOperationSchema = z.object({
  id: z.string(),
  type: z.literal('moveNode'),
  nodeRef: z.string(),
  position: positionSchema,
})

const workflowPlanSchema = z.object({
  summary: z.string(),
  assumptions: z.array(z.string()).default([]),
  warnings: z.array(z.string()).default([]),
  questions: z.array(z.string()).default([]),
  operations: z.array(
    z.discriminatedUnion('type', [
      createNodeOperationSchema,
      updateNodeConfigOperationSchema,
      renameNodeOperationSchema,
      removeNodeOperationSchema,
      connectNodesOperationSchema,
      disconnectEdgeOperationSchema,
      moveNodeOperationSchema,
    ]),
  ).default([]),
})

const agentStructuredResponseSchema = z.object({
  assistantMessage: z.string().optional(),
  workflowSummary: z.string().optional(),
  findings: z.array(z.string()).default([]),
  methods: z.array(z.string()).default([]),
  risks: z.array(z.string()).default([]),
  recommendations: z.array(z.string()).default([]),
  workflowPlan: workflowPlanSchema.nullish(),
})

type AgentSessionRuntime = {
  client: any
  server: Awaited<ReturnType<typeof createOpencodeServer>>
  sessionID: string
  providerID: string
  modelID: string
  toolSelection: Record<string, boolean>
  tempDirectory: string
  eventPump?: {
    stop: () => Promise<void>
  } | null
  pendingUserMessageIds: string[]
}

const agentSessionRuntimes = new Map<string, AgentSessionRuntime>()

const stripCodeFence = (value: string) =>
  value
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim()

const extractJsonObject = (value: string) => {
  const startIndex = value.indexOf('{')
  const endIndex = value.lastIndexOf('}')
  if (startIndex < 0 || endIndex < 0 || endIndex <= startIndex) {
    return value.trim()
  }
  return value.slice(startIndex, endIndex + 1).trim()
}

const createOpencodeProviderId = (profile: WorkflowAiModelProfile) =>
  `workflow_ai_${profile.id.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').toLowerCase() || 'custom'}`

const normalizeServerHost = (host: string) => {
  if (host === '0.0.0.0' || host === '::' || host === '::0') return '127.0.0.1'
  return host
}

const resolveWorkflowServerBaseUrl = () => {
  const host = normalizeServerHost(process.env.WORKFLOW_AI_SERVER_HOST || '127.0.0.1')
  const port = Number(process.env.WORKFLOW_AI_SERVER_PORT || '8787')
  return `http://${host}:${port}`
}

const resolveWorkflowMcpUrl = (serverBaseUrl?: string) =>
  `${(serverBaseUrl || resolveWorkflowServerBaseUrl()).replace(/\/$/, '')}/api/opencode/workflow-mcp`

const resolveWorkflowMcpUserId = (userId?: string) => {
  const normalizedUserId = userId?.trim()
  if (normalizedUserId) {
    return normalizedUserId
  }

  throw new Error(`缺少 workflow MCP 用户上下文，请显式注入 ${WORKFLOW_USER_ID_HEADER}`)
}

const buildWorkflowMcpHeaders = (sessionId: string, userId?: string) => ({
  [WORKFLOW_SESSION_ID_HEADER]: sessionId,
  [WORKFLOW_USER_ID_HEADER]: resolveWorkflowMcpUserId(userId),
  ...(process.env.WORKFLOW_MCP_AUTH_TOKEN?.trim()
    ? {
        'x-workflow-mcp-auth-token': process.env.WORKFLOW_MCP_AUTH_TOKEN.trim(),
      }
    : {}),
})

const ensureTempDirectory = (sessionId: string) => {
  mkdirSync(OPENCODE_TEMP_ROOT, { recursive: true })
  return mkdtempSync(join(OPENCODE_TEMP_ROOT, `${sessionId}-`))
}

const cleanupTempDirectory = (directory: string) => {
  if (!directory.startsWith(OPENCODE_TEMP_ROOT)) return
  rmSync(directory, { recursive: true, force: true })
}

const findAvailablePort = async () =>
  new Promise<number>((resolve, reject) => {
    const server = createServer()
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (address && typeof address === 'object' && typeof address.port === 'number') {
        const { port } = address
        server.close(() => resolve(port))
        return
      }
      server.close()
      reject(new Error('无法分配可用端口'))
    })
    server.on('error', reject)
  })

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

const buildOpencodeConfig = (profile: WorkflowAiModelProfile) => {
  const providerId = createOpencodeProviderId(profile)
  const modelId = profile.model

  return {
    share: 'disabled' as const,
    snapshot: false,
    instructions: [],
    experimental: {
      mcp_timeout: OPENCODE_AGENT_REQUEST_TIMEOUT_MS,
    },
    enabled_providers: [providerId],
    model: `${providerId}/${modelId}`,
    small_model: `${providerId}/${modelId}`,
    default_agent: 'general',
    provider: {
      [providerId]: {
        npm: '@ai-sdk/openai-compatible',
        options: {
          baseURL: profile.baseUrl,
          apiKey: profile.apiKey,
          timeout: OPENCODE_AGENT_REQUEST_TIMEOUT_MS,
          chunkTimeout: OPENCODE_AGENT_REQUEST_TIMEOUT_MS,
        },
        models: {
          [modelId]: {
            id: modelId,
            name: profile.name,
          },
        },
      },
    },
  }
}

const buildWorkflowToolSelectionMap = (toolIds: string[]) => {
  const allowedToolIds = new Set([
    ...WORKFLOW_MCP_TOOL_NAMES,
    ...WORKFLOW_MCP_TOOL_NAMES.map((toolName) => `${WORKFLOW_MCP_NAME}_${toolName}`),
    ...toolIds.filter((toolId) => isWorkflowMcpToolId(toolId)),
  ])

  return Object.fromEntries(
    toolIds.map((toolId) => [toolId, allowedToolIds.has(toolId)]),
  )
}

const isWorkflowMcpToolId = (toolId: string) =>
  toolId.startsWith(`${WORKFLOW_MCP_NAME}_`)
  || WORKFLOW_MCP_TOOL_NAMES.some((name) => name === toolId)

const extractPromptText = (response: any) =>
  (response?.data?.parts ?? [])
    .filter((part: any) => part?.type === 'text' && typeof part.text === 'string')
    .map((part: any) => part.text)
    .join('\n')
    .trim()

const extractMessageEntryText = (entry: any) =>
  (entry?.parts ?? [])
    .filter((part: any) => part?.type === 'text' && typeof part.text === 'string')
    .map((part: any) => part.text)
    .join('\n')
    .trim()

const safeSerializeDebugPayload = (value: unknown) => {
  try {
    return JSON.parse(JSON.stringify(value)) as unknown
  } catch {
    return {
      nonSerializable: true,
      type: typeof value,
    }
  }
}

const withTimeout = async <T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(message))
    }, timeoutMs)

    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })

const writeAgentSessionDebugLine = (sessionId: string, category: string, payload: unknown) => {
  if (!ENABLE_AGENT_SESSION_DEBUG_STDOUT) return
  console.log(
    JSON.stringify({
      scope: 'agent-session-debug',
      sessionId,
      category,
      payload: safeSerializeDebugPayload(payload),
    }),
  )
}

const appendDebugEvent = (
  sessionId: string,
  eventType: string,
  summary: string,
  payload?: unknown,
) => {
  const nextEvent = {
    eventType,
    summary,
    timestamp: Date.now(),
    ...(payload !== undefined ? { payload: safeSerializeDebugPayload(payload) } : {}),
  }
  appendAgentSessionDebugEvent(sessionId, nextEvent)
  appendAgentObservabilityEvent(sessionId, {
    source: 'opencode-event-pump',
    kind: 'opencode.event',
    summary,
    payload: nextEvent,
  })
  writeAgentSessionDebugLine(sessionId, 'event', nextEvent)
}

const appendDebugToolCall = (
  sessionId: string,
  input: {
    toolCallId?: string
    toolName: string
    title?: string
    status: 'started' | 'completed' | 'failed'
    payload?: unknown
  },
) => {
  const toolCall = {
    ...input,
    timestamp: Date.now(),
    ...(input.payload !== undefined ? { payload: safeSerializeDebugPayload(input.payload) } : {}),
  }
  appendAgentSessionDebugToolCall(sessionId, toolCall)
  appendAgentObservabilityEvent(sessionId, {
    source: 'opencode-event-pump',
    kind: 'tool.call',
    summary: `${input.toolName} ${input.status === 'started' ? '开始' : input.status === 'completed' ? '完成' : '失败'}`,
    payload: {
      rawToolCall: toolCall,
      toolCall: {
        id: input.toolCallId || `${input.toolName}_${toolCall.timestamp}`,
        toolName: normalizeWorkflowToolName(input.toolName),
        displayName: WORKFLOW_TOOL_DISPLAY_NAMES[normalizeWorkflowToolName(input.toolName)] ?? input.title ?? input.toolName,
        status: resolveToolCallStatus(input.status),
        summary: buildToolSummary(normalizeWorkflowToolName(input.toolName), input.status),
        ...(input.status === 'started' ? { startedAt: toolCall.timestamp } : { finishedAt: toolCall.timestamp }),
      },
    },
  })
  writeAgentSessionDebugLine(sessionId, 'tool_call', toolCall)
}

const normalizeWorkflowToolName = (toolName: string) =>
  WORKFLOW_MCP_TOOL_NAMES.includes(toolName as typeof WORKFLOW_MCP_TOOL_NAMES[number])
    ? toolName
    : toolName.startsWith(`${WORKFLOW_MCP_NAME}_`)
      && WORKFLOW_MCP_TOOL_NAMES.includes(
        toolName.slice(`${WORKFLOW_MCP_NAME}_`.length) as typeof WORKFLOW_MCP_TOOL_NAMES[number],
      )
      ? toolName.slice(`${WORKFLOW_MCP_NAME}_`.length)
      : toolName

const resolveToolCallStatus = (status: 'started' | 'completed' | 'failed') =>
  status === 'started' ? 'running' : status === 'failed' ? 'failed' : 'success'

const buildToolSummary = (toolName: string, status: 'started' | 'completed' | 'failed') => {
  const displayName = WORKFLOW_TOOL_DISPLAY_NAMES[normalizeWorkflowToolName(toolName)] ?? toolName
  if (status === 'started') return `正在${displayName}`
  if (status === 'failed') return `${displayName}失败`
  return `${displayName}完成`
}

const projectToolCallEvent = (
  sessionId: string,
  input: {
    toolCallId?: string
    toolName: string
    title?: string
    status: 'started' | 'completed' | 'failed'
  },
) => {
  const normalizedToolName = normalizeWorkflowToolName(input.toolName)
  const id = input.toolCallId || `${normalizedToolName}_${Date.now()}`

  updateSessionProjection(sessionId, (projection) =>
    applyToolCallState(projection, {
      id,
      toolName: normalizedToolName,
      displayName: WORKFLOW_TOOL_DISPLAY_NAMES[normalizedToolName] ?? input.title ?? normalizedToolName,
      status: resolveToolCallStatus(input.status),
      summary: buildToolSummary(normalizedToolName, input.status),
      ...(input.status === 'started' ? { startedAt: Date.now() } : { finishedAt: Date.now() }),
    }))
}

const buildDebugRawMessage = (entry: any): AgentSessionDebugRawMessage => ({
  messageId: entry?.info?.id || `assistant_${Date.now()}`,
  role: typeof entry?.info?.role === 'string' ? entry.info.role : 'unknown',
  ...(typeof entry?.info?.parentID === 'string' ? { parentId: entry.info.parentID } : {}),
  timestamp:
    entry?.info?.time?.completed
    ?? entry?.info?.time?.created
    ?? Date.now(),
  ...(extractMessageEntryText(entry) ? { text: extractMessageEntryText(entry) } : {}),
  ...(entry?.info?.structured !== undefined
    ? { structured: safeSerializeDebugPayload(entry.info.structured) }
    : {}),
  parts: Array.isArray(entry?.parts)
    ? entry.parts.map((part: unknown) => safeSerializeDebugPayload(part) as Record<string, unknown>)
    : [],
  ...(typeof entry?.info?.error?.name === 'string' ? { errorName: entry.info.error.name } : {}),
  ...(typeof entry?.info?.error?.message === 'string' ? { errorMessage: entry.info.error.message } : {}),
})

const appendDebugRawMessage = (sessionId: string, entry: any) => {
  const rawMessage = buildDebugRawMessage(entry)
  appendAgentSessionDebugRawMessage(sessionId, rawMessage)
  appendAgentObservabilityEvent(sessionId, {
    source: 'gateway',
    kind: 'message.raw',
    summary: `收到原始消息 ${rawMessage.messageId}`,
    payload: {
      rawMessage,
    },
  })
  writeAgentSessionDebugLine(sessionId, 'raw_message', rawMessage)
}

const appendDebugParseFailure = (
  sessionId: string,
  input: {
    messageId?: string
    reason: string
    rawText?: string
    payload?: unknown
  },
) => {
  const parseFailure = {
    ...input,
    timestamp: Date.now(),
    ...(input.payload !== undefined ? { payload: safeSerializeDebugPayload(input.payload) } : {}),
  }
  appendAgentSessionDebugParseFailure(sessionId, parseFailure)
  appendAgentObservabilityEvent(sessionId, {
    source: 'gateway',
    kind: 'message.parse',
    summary: input.reason,
    payload: {
      parseFailure,
    },
  })
  writeAgentSessionDebugLine(sessionId, 'parse_failure', parseFailure)
}

const getMessageEntryError = (entry: any) => {
  const error = entry?.info?.error
  if (!error || typeof error !== 'object') return null
  return {
    name: typeof error.name === 'string' ? error.name : '',
    message: typeof error.message === 'string' ? error.message : '',
  }
}

const hasAssistantStructuredPayload = (entry: any) => entry?.info?.structured !== undefined

const hasAssistantTextPayload = (entry: any) => Boolean(extractMessageEntryText(entry))

const getAssistantEntryFailureMessage = (entry: any) => getMessageEntryError(entry)?.message || null

const resolveAssistantMessageEntry = (entries: any[], userMessageId: string) => {
  const reversedEntries = [...entries].reverse()
  const assistantEntries = reversedEntries.filter((entry) => entry?.info?.role === 'assistant')
  const relatedEntries = assistantEntries.filter((entry) => entry?.info?.parentID === userMessageId)
  const candidates = relatedEntries.length > 0 ? relatedEntries : assistantEntries

  return (
    candidates.find((entry) => hasAssistantStructuredPayload(entry) || hasAssistantTextPayload(entry))
    ?? candidates.find((entry) => Boolean(getAssistantEntryFailureMessage(entry)))
    ?? candidates[0]
    ?? null
  )
}

const coerceStructuredWorkflowPlan = (value: unknown) => {
  if (typeof value !== 'string') return value

  const normalized = extractJsonObject(stripCodeFence(value))
  if (!normalized) return null

  try {
    return JSON.parse(normalized)
  } catch {
    return null
  }
}

const coerceStructuredStringArray = (value: unknown) => {
  if (Array.isArray(value) || value === undefined) return value
  if (typeof value !== 'string') return value

  const normalized = value.trim()
  if (!normalized) return []

  const items = normalized
    .split(/\r?\n|[；;]+/)
    .map((item) => item.trim())
    .filter(Boolean)

  return items.length > 0 ? items : [normalized]
}

const parseAgentStructuredResponsePayload = (payload: unknown) => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return agentStructuredResponseSchema.parse(payload)
  }

  return agentStructuredResponseSchema.parse({
    ...payload,
    findings: coerceStructuredStringArray((payload as Record<string, unknown>).findings),
    methods: coerceStructuredStringArray((payload as Record<string, unknown>).methods),
    risks: coerceStructuredStringArray((payload as Record<string, unknown>).risks),
    recommendations: coerceStructuredStringArray((payload as Record<string, unknown>).recommendations),
    workflowPlan: coerceStructuredWorkflowPlan((payload as Record<string, unknown>).workflowPlan),
  })
}

const validateWorkflowPlan = (request: WorkflowAiPlanRequest, plan: WorkflowAiPlan) =>
  validateWorkflowAiPlanAgainstContext(plan, {
    nodeCatalog: request.nodeCatalog,
    ...getExistingWorkflowContext(request),
  })

const buildAgentSystemPrompt = (options?: { plainJsonFallback?: boolean }) =>
  [
    '你是多因子相关性分析系统的业务分析代理。',
    '请优先结合 workflow MCP 工具理解当前工作流、字段摘要和版本信息。',
    '输出必须使用中文。',
    '给出业务结论、候选方法、风险、建议，并在可能时返回一个最小可运行的工作流草案。',
    options?.plainJsonFallback
      ? '本次结构化输出工具不可用。请直接输出一个 JSON 对象，不要使用 Markdown 代码块，不要输出任何额外说明。缺失字段必须使用空数组、null 或可读字符串补齐。'
      : '',
  ]
    .filter(Boolean)
    .join('\n')

const buildAgentPromptRequest = (
  runtime: AgentSessionRuntime,
  message: string,
  options?: { plainJsonFallback?: boolean },
) => ({
  sessionID: runtime.sessionID,
  model: {
    providerID: runtime.providerID,
    modelID: runtime.modelID,
  },
  agent: 'general',
  tools: runtime.toolSelection,
  system: buildAgentSystemPrompt(options),
  format: options?.plainJsonFallback
    ? undefined
    : {
        type: 'json_schema' as const,
        schema: z.toJSONSchema(agentStructuredResponseSchema),
      },
  parts: [
    {
      type: 'text' as const,
      text: message,
    },
  ],
})

const buildAgentKernelPromptRequest = (
  runtime: AgentSessionRuntime,
  input: AgentKernelRuntimePromptInput,
) => ({
  sessionID: runtime.sessionID,
  model: {
    providerID: runtime.providerID,
    modelID: runtime.modelID,
  },
  agent: 'general',
  tools: runtime.toolSelection,
  system: [
    input.skill.systemPrompt,
    '',
    '当前 Kernel 路由：',
    `- 意图：${input.intent.kind}`,
    `- 自主等级：${input.intent.autonomy}`,
    `- 路由原因：${input.intent.reason}`,
    '',
    '执行约束：',
    ...input.skill.guardrails.map((item) => `- ${item}`),
    '',
    '完成标准：',
    ...input.skill.exitCriteria.map((item) => `- ${item}`),
  ].join('\n'),
  parts: [
    {
      type: 'text' as const,
      text: [
        `用户目标：${input.request.prompt}`,
        `当前消息：${input.message}`,
        `Kernel 迭代：第 ${input.iteration ?? 1} 轮`,
        input.verification
          ? `上一轮校验：${input.verification.status} - ${input.verification.message}`
          : '',
        input.previousObservations?.length
          ? `已获得观察结果 JSON：\n${JSON.stringify(input.previousObservations, null, 2)}`
          : '',
        '',
        '请根据当前 skill 自主决定下一步。需要完整 agentic 分析时，按“读取上下文 -> 数据画像 -> 方法推荐 -> 构建或修复工作流 -> 校验 -> 执行 -> 抽取证据 -> 中文报告”的闭环推进；如果只是普通对话或阻塞说明，则直接给出中文回复。',
      ].filter(Boolean).join('\n'),
    },
  ],
})

const subscribeToOpencodeEvents = async (client: any) => {
  const abortController = new AbortController()
  const subscription = await client.event.subscribe(undefined, {
    signal: abortController.signal,
  })
  const stream = subscription?.stream ?? subscription

  if (!stream || typeof stream[Symbol.asyncIterator] !== 'function') {
    throw new Error('Opencode 事件订阅未返回可迭代流')
  }

  return {
    stream,
    stop: () => {
      abortController.abort()
      subscription?.controller?.abort?.()
    },
  }
}

const publishAgentEvent = (
  sessionId: string,
  event: AgentSessionEvent,
  emitEvent?: (event: AgentSessionEvent) => void,
) => {
  publishAgentSessionEvent(sessionId, event)
  emitEvent?.(event)
}

const publishProjectionEvents = (
  sessionId: string,
  projection: AgentProjectionSnapshot,
  emitEvent?: (event: AgentSessionEvent) => void,
) => {
  publishAgentEvent(sessionId, { type: 'projection.workflow.updated', projection: projection.workflow }, emitEvent)
  publishAgentEvent(sessionId, { type: 'projection.analysis.updated', projection: projection.analysis }, emitEvent)
  publishAgentEvent(sessionId, { type: 'projection.execution.updated', projection: projection.execution }, emitEvent)
  publishAgentEvent(sessionId, { type: 'projection.canvas_sync.updated', projection: projection.canvasSync }, emitEvent)
  if (projection.error) {
    publishAgentEvent(sessionId, { type: 'projection.error.updated', projection: projection.error }, emitEvent)
  }
}

const syncSessionStatus = (
  sessionId: string,
  status: AgentSessionState['status'],
  emitEvent?: (event: AgentSessionEvent) => void,
) => {
  const record = updateAgentSessionRecord(sessionId, (draft) => {
    draft.session.status = status
  })
  if (!record) return null
  appendAgentObservabilityEvent(sessionId, {
    source: 'session-store',
    kind: 'session.lifecycle',
    summary: `会话状态已更新为 ${status}`,
    payload: {
      status,
      session: record.session,
    },
  })
  publishAgentEvent(sessionId, { type: 'session.status.updated', session: record.session }, emitEvent)
  return record
}

const updateSessionProjection = (
  sessionId: string,
  updater: (projection: AgentProjectionSnapshot) => AgentProjectionSnapshot,
  emitEvent?: (event: AgentSessionEvent) => void,
) => {
  const previousProjection = getAgentSessionRecord(sessionId)?.projection
  const record = updateAgentSessionRecord(sessionId, (draft) => {
    draft.projection = updater(draft.projection)
  })
  if (!record) return null
  if (previousProjection) {
    recordAgentObservabilityProjection(sessionId, previousProjection, record.projection, 'projection')
  }
  publishProjectionEvents(sessionId, record.projection, emitEvent)
  return record
}

const ensureAgentRuntime = async (record: AgentSessionRecord) => {
  const existing = agentSessionRuntimes.get(record.session.id)
  if (existing) return existing

  const resolvedProfile = resolveModelProfile(record.request.profile)
  if (!resolvedProfile.enabled) {
    throw new Error('当前模型配置不可用，请先检查模型设置')
  }
  if (!resolvedProfile.apiKey) {
    throw new Error('模型配置缺少 API Key')
  }

  const providerID = createOpencodeProviderId(resolvedProfile)
  const modelID = resolvedProfile.model
  const tempDirectory = ensureTempDirectory(record.session.id)
  const port = await findAvailablePort()
  const server = await createOpencodeServer({
    port,
    timeout: OPENCODE_SERVER_START_TIMEOUT_MS,
    config: buildOpencodeConfig(resolvedProfile),
  })

  const client = createOpencodeClient({
    baseUrl: server.url,
    directory: tempDirectory,
    throwOnError: true,
  } as any)

  await client.mcp.add({
    name: WORKFLOW_MCP_NAME,
    config: {
      type: 'remote',
      url: resolveWorkflowMcpUrl(),
      headers: buildWorkflowMcpHeaders(record.session.id, record.userId),
    },
  })
  await client.mcp.connect({ name: WORKFLOW_MCP_NAME })

  const toolIdsResponse = await client.tool.ids()
  const toolSelection = buildWorkflowToolSelectionMap(toolIdsResponse.data ?? [])
  const session = await client.session.create({
    title: `agent-session-${record.session.id}`,
    permission: [
      {
        permission: '*',
        pattern: '*',
        action: 'deny',
      },
      {
        permission: `${WORKFLOW_MCP_NAME}_*`,
        pattern: '*',
        action: 'allow',
      },
      ...WORKFLOW_MCP_TOOL_NAMES.map((toolName) => ({
        permission: toolName,
        pattern: '*',
        action: 'allow' as const,
      })),
    ],
  })

  const sessionID = session.data?.id
  if (!sessionID) {
    throw new Error('创建 opencode 会话失败')
  }

  const runtime: AgentSessionRuntime = {
    client,
    server,
    sessionID,
    providerID,
    modelID,
    toolSelection,
    tempDirectory,
    eventPump: null,
    pendingUserMessageIds: [],
  }
  agentSessionRuntimes.set(record.session.id, runtime)
  return runtime
}

const finalizeAgentRun = async (
  sessionId: string,
  runtime: AgentSessionRuntime,
) => {
  const userMessageId = runtime.pendingUserMessageIds.shift()
  if (!userMessageId) return

  const record = getAgentSessionRecord(sessionId)
  if (!record) return

  try {
    const response = await runtime.client.session.messages({
      sessionID: runtime.sessionID,
      limit: 50,
    })
    const entries = Array.isArray(response?.data) ? response.data : []
    entries.forEach((entry: any) => {
      appendDebugRawMessage(sessionId, entry)
    })
    const assistantEntry = resolveAssistantMessageEntry(entries, userMessageId)

    if (!assistantEntry) {
      appendDebugParseFailure(sessionId, {
        messageId: userMessageId,
        reason: '未找到 assistant entry',
        payload: entries,
      })
      updateSessionProjection(
        sessionId,
        (projection) => ({
          ...applyExecutionState(projection, 'completed', '本轮分析已完成'),
          error: null,
        }),
      )
      syncSessionStatus(sessionId, 'completed')
      return
    }

    const structured = parseAssistantMessageEntry(sessionId, record, assistantEntry)
    const assistantContent = resolveAssistantMessageText(structured)
    const assistantMessage: AgentSessionMessage = {
      id: assistantEntry.info?.id || `assistant_${Date.now()}`,
      role: 'assistant',
      content: assistantContent,
      status: 'completed',
      createdAt:
        assistantEntry.info?.time?.completed
        ?? assistantEntry.info?.time?.created
        ?? Date.now(),
    }

    updateAgentSessionRecord(sessionId, (draft) => {
      if (!draft.messages.some((message) => message.id === assistantMessage.id)) {
        draft.messages.push(assistantMessage)
      }
    })

    updateSessionProjection(
      sessionId,
      (projection) => ({
        ...applyStructuredResponseToProjection(
          applyExecutionState(projection, 'completed', '本轮分析已完成'),
          {
            ...structured,
            assistantMessage: assistantContent,
          },
        ),
        error: null,
      }),
    )
    syncSessionStatus(sessionId, 'completed')
    publishAgentEvent(sessionId, {
      type: 'message.completed',
      sessionId,
      message: assistantMessage,
    })
  } catch (error) {
    updateSessionProjection(
      sessionId,
      (projection) =>
        applyProjectionError(
          applyExecutionState(projection, 'failed', '本轮分析失败'),
          error instanceof Error ? error.message : 'Agent 会话运行失败',
        ),
    )
    syncSessionStatus(sessionId, 'failed')
    publishAgentEvent(sessionId, {
      type: 'failed',
      message: error instanceof Error ? error.message : 'Agent 会话运行失败',
    })
  }
}

const startAgentEventPump = async (sessionId: string, runtime: AgentSessionRuntime) => {
  let aborted = false
  const subscription = await subscribeToOpencodeEvents(runtime.client)
  const task = (async () => {
    for await (const event of subscription.stream) {
      appendDebugEvent(
        sessionId,
        String(event?.type ?? 'unknown'),
        `收到 opencode 事件 ${String(event?.type ?? 'unknown')}`,
        event,
      )

      if (event?.type === 'permission.asked' && event.properties?.sessionID === runtime.sessionID) {
        await runtime.client.permission.reply({
          requestID: event.properties.id,
          reply: 'once',
        })
        continue
      }

      if (
        typeof event?.type === 'string'
        && event.type.startsWith('tool.call.')
        && event.properties?.sessionID === runtime.sessionID
      ) {
        const toolName =
          typeof event.properties?.toolID === 'string'
            ? event.properties.toolID
            : typeof event.properties?.toolName === 'string'
              ? event.properties.toolName
              : 'unknown_tool'
        appendDebugToolCall(sessionId, {
          toolCallId:
            typeof event.properties?.toolCallID === 'string' ? event.properties.toolCallID : undefined,
          toolName,
          title: typeof event.properties?.title === 'string' ? event.properties.title : undefined,
          status:
            event.type === 'tool.call.started'
              ? 'started'
              : event.type === 'tool.call.completed'
                ? 'completed'
              : 'failed',
          payload: event.properties,
        })
        projectToolCallEvent(sessionId, {
          toolCallId:
            typeof event.properties?.toolCallID === 'string' ? event.properties.toolCallID : undefined,
          toolName,
          title: typeof event.properties?.title === 'string' ? event.properties.title : undefined,
          status:
            event.type === 'tool.call.started'
              ? 'started'
              : event.type === 'tool.call.completed'
                ? 'completed'
                : 'failed',
        })
        continue
      }

      if (
        event?.type === 'message.part.updated'
        && event.properties?.part?.type === 'tool'
        && (
          event.properties?.part?.sessionID === runtime.sessionID
          || event.properties?.sessionID === runtime.sessionID
        )
      ) {
        const part = event.properties.part
        appendDebugToolCall(sessionId, {
          toolCallId: typeof part.callID === 'string' ? part.callID : undefined,
          toolName: typeof part.tool === 'string' ? part.tool : 'unknown_tool',
          title: typeof part.state?.title === 'string' ? part.state.title : undefined,
          status:
            part.state?.status === 'completed'
              ? 'completed'
              : part.state?.status === 'error'
                ? 'failed'
              : 'started',
          payload: part,
        })
        projectToolCallEvent(sessionId, {
          toolCallId: typeof part.callID === 'string' ? part.callID : undefined,
          toolName: typeof part.tool === 'string' ? part.tool : 'unknown_tool',
          title: typeof part.state?.title === 'string' ? part.state.title : undefined,
          status:
            part.state?.status === 'completed'
              ? 'completed'
              : part.state?.status === 'error'
                ? 'failed'
                : 'started',
        })
      }

      if (event?.type === 'message.part.updated' && event.properties?.part?.type === 'text') {
        const part = event.properties.part
        if (part.sessionID !== runtime.sessionID) continue
        publishAgentEvent(sessionId, {
          type: 'message.delta',
          sessionId,
          messageId: part.messageID || `assistant_${sessionId}`,
          delta: part.text,
        })
        continue
      }

      if (event?.type === 'session.idle' && event.properties?.sessionID === runtime.sessionID) {
        await finalizeAgentRun(sessionId, runtime)
      }
    }
  })().catch((error) => {
    if (aborted) return
    throw error
  })

  return {
    stop: async () => {
      aborted = true
      subscription.stop()
      await task.catch(() => undefined)
    },
  }
}

const parseAssistantMessageEntry = (
  sessionId: string,
  record: AgentSessionRecord,
  entry: any,
): AgentStructuredResponse => {
  const structured = entry?.info?.structured
  if (structured !== undefined) {
    try {
      return normalizeStructuredResponse(record, parseAgentStructuredResponsePayload(structured))
    } catch (error) {
      appendDebugParseFailure(sessionId, {
        messageId: entry?.info?.id,
        reason: error instanceof Error ? error.message : 'structured payload parse failed',
        payload: structured,
      })
      throw error
    }
  }

  const text = extractMessageEntryText(entry)
  if (!text) {
    const reason = getAssistantEntryFailureMessage(entry) || 'Opencode 未返回可解析的助手消息'
    appendDebugParseFailure(sessionId, {
      messageId: entry?.info?.id,
      reason,
      payload: entry,
    })
    throw new Error(reason)
  }

  try {
    return normalizeStructuredResponse(
      record,
      parseAgentStructuredResponsePayload(JSON.parse(extractJsonObject(stripCodeFence(text)))),
    )
  } catch (error) {
    appendDebugParseFailure(sessionId, {
      messageId: entry?.info?.id,
      reason: error instanceof Error ? error.message : 'assistant text parse failed',
      rawText: text,
      payload: entry,
    })
    const messageError = getMessageEntryError(entry)
    if (messageError?.name === 'StructuredOutputError') {
      return normalizeStructuredResponse(record, {
        assistantMessage: text,
        workflowSummary: text,
        findings: [],
        methods: [],
        risks: [],
        recommendations: [],
        workflowPlan: null,
      })
    }

    return normalizeStructuredResponse(record, {
      assistantMessage: text,
      workflowSummary: text,
      findings: [],
      methods: [],
      risks: [],
      recommendations: [],
      workflowPlan: null,
    })
  }
}

const normalizeStructuredResponse = (
  record: AgentSessionRecord,
  response: AgentStructuredResponse,
) => {
  if (!response.workflowPlan) return response
  const validation = validateWorkflowPlan(record.request, response.workflowPlan)
  if (validation.valid) return response

  return {
    ...response,
    risks: [
      ...response.risks,
      `工作流草案未通过校验：${validation.issues.map((issue) => issue.message).join('；')}`,
    ],
    workflowPlan: null,
  }
}

const createAgentUserMessageId = () => `msg_${randomUUID().replace(/-/g, '')}`

const extractToolOutputPayload = (part: any) => {
  const candidates = [
    part?.state?.output,
    part?.state?.result,
    part?.output,
    part?.result,
  ]
  for (const candidate of candidates) {
    if (candidate && typeof candidate === 'object') {
      return candidate as Record<string, unknown>
    }
    if (typeof candidate === 'string' && candidate.trim()) {
      try {
        const parsed = JSON.parse(candidate)
        if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>
      } catch {
        return { text: candidate }
      }
    }
  }
  return {}
}

const extractAgentKernelObservationsFromPromptResponse = (response: any): AgentKernelObservation[] => {
  const entries = response?.data ? [response.data] : []
  return entries.flatMap((entry) => {
    const observations: AgentKernelObservation[] = []
    const text = extractMessageEntryText(entry) || extractPromptText({ data: entry })
    if (text) {
      observations.push({
        type: 'assistant_message',
        content: text,
      })
    }

    for (const part of Array.isArray(entry?.parts) ? entry.parts : []) {
      if (part?.type !== 'tool') continue
      const toolName =
        typeof part.tool === 'string'
          ? part.tool
          : typeof part.toolID === 'string'
            ? part.toolID
            : typeof part.name === 'string'
              ? part.name
              : ''
      if (!toolName) continue
      observations.push({
        type: 'tool_result',
        toolName: normalizeWorkflowToolName(toolName),
        structuredContent: extractToolOutputPayload(part),
      })
    }

    return observations
  })
}

const createAgentKernelAdapter = (
  record: AgentSessionRecord,
  emitEvent?: (event: AgentSessionEvent) => void,
): AgentKernelRuntimeAdapter => ({
  async runPrompt(input) {
    return withTimeout((async () => {
      const runtime = await ensureAgentRuntime(record)
      try {
        if (!runtime.eventPump) {
          runtime.eventPump = await startAgentEventPump(input.sessionId, runtime)
        }
      } catch (error) {
        updateSessionProjection(
          input.sessionId,
          (projection) => ({
            ...applyExecutionState(projection, 'running', 'Agent Kernel 已启动'),
            error: {
              message: '监听 opencode 事件流失败',
              detail: error instanceof Error ? error.message : undefined,
              occurredAt: Date.now(),
            },
          }),
          emitEvent,
        )
      }

      const response = await runtime.client.session.prompt(buildAgentKernelPromptRequest(runtime, input))

      return {
        observations: extractAgentKernelObservationsFromPromptResponse(response),
      }
    })(),
      OPENCODE_AGENT_REQUEST_TIMEOUT_MS,
      'Agent Kernel 执行超时',
    )
  },
})

const resolveKernelProjectionText = (status: AgentKernelVerificationStatus) => {
  if (status === 'waiting_user') {
    return {
      analysisSummary: '需要先提供可分析的数据源或字段摘要。',
      executionStatus: 'completed' as const,
      latestAction: '等待补充数据源或字段摘要',
      workflowSummary: null,
    }
  }

  if (status === 'needs_evidence') {
    return {
      analysisSummary: '核心结论缺少可追溯证据，Agent Kernel 将继续补齐 evidenceId。',
      executionStatus: 'running' as const,
      latestAction: '补齐结论证据',
      workflowSummary: '已进入 Agent Kernel 证据闭环。',
    }
  }

  if (status === 'requires_approval') {
    return {
      analysisSummary: '当前步骤需要用户确认后才能继续执行。',
      executionStatus: 'running' as const,
      latestAction: '等待用户确认',
      workflowSummary: 'Agent Kernel 已暂停在确认节点。',
    }
  }

  if (status === 'failed') {
    return {
      analysisSummary: 'Agent Kernel 执行失败，请查看错误详情。',
      executionStatus: 'failed' as const,
      latestAction: 'Agent Kernel 执行失败',
      workflowSummary: 'Agent Kernel 执行失败。',
    }
  }

  if (status === 'completed') {
    return {
      analysisSummary: 'Agent Kernel 已完成本轮分析闭环。',
      executionStatus: 'completed' as const,
      latestAction: 'Agent Kernel 分析完成',
      workflowSummary: 'Agent Kernel 已完成分析流程。',
    }
  }

  return {
    analysisSummary: '系统已启动 Agent Kernel 分析。',
    executionStatus: 'running' as const,
    latestAction: 'Agent Kernel 已启动',
    workflowSummary: '已进入 Agent Kernel 分析流程。',
  }
}

export const createAgentSession = async (input: {
  request: WorkflowAiPlanRequest
  userId?: string
}): Promise<AgentSessionStartResponse> => {
  const projection = buildInitialProjection(input.request)
  const record = createAgentSessionRecord({
    request: input.request,
    projection,
    userId: input.userId,
  })
  initializeAgentObservabilityTrace({
    sessionId: record.session.id,
    request: input.request,
    userId: input.userId,
    session: record.session,
    projection: record.projection,
  })
  appendAgentObservabilityEvent(record.session.id, {
    source: 'agent-route',
    kind: 'session.lifecycle',
    summary: '会话已创建',
    payload: {
      status: record.session.status,
      session: record.session,
    },
  })

  return {
    session: record.session,
    projection: record.projection,
  }
}

export const getAgentSession = (sessionId: string) => {
  const record = getAgentSessionRecord(sessionId)
  if (!record) return null
  return {
    session: record.session,
    projection: record.projection,
  }
}

export const getAgentProjection = (sessionId: string) => getAgentSessionRecord(sessionId)?.projection ?? null

export const getAgentSessionDebugTrace = (sessionId: string) =>
  getAgentSessionDebugTraceFromStore(sessionId)

export const getAgentObservabilityDebugTrace = (
  sessionId: string,
  options: { limit?: number, offset?: number } = {},
): AgentObservabilityDebugTraceResponse | null =>
  getAgentObservabilityDebugTraceFromStore(sessionId, options)

export const getAgentObservabilityDebugReplay = (
  sessionId: string,
  seq?: number,
): AgentObservabilityDebugReplayResponse | null =>
  getAgentObservabilityDebugReplayFromStore(sessionId, seq)

export const getAgentObservabilityDebugFiles = (
  sessionId: string,
): AgentObservabilityLogFiles | null =>
  getAgentObservabilityDebugFilesFromStore(sessionId)

export const getAgentObservabilityDebugHealth = (): AgentObservabilityDebugHealth =>
  getAgentObservabilityDebugHealthFromStore()

export const subscribeToAgentSessionEvents = subscribeAgentSessionEvents

export const sendAgentSessionMessage = async (
  input: {
    sessionId: string
    message: string
  },
  emitEvent?: (event: AgentSessionEvent) => void,
): Promise<AgentSessionMessageResponse> => {
  const record = getAgentSessionRecord(input.sessionId)
  if (!record) {
    throw new Error('未找到 Agent 会话')
  }

  const userMessage: AgentSessionMessage = {
    id: createAgentUserMessageId(),
    role: 'user',
    content: input.message,
    status: 'completed',
    createdAt: Date.now(),
  }
  appendAgentSessionMessage(input.sessionId, userMessage)

  syncSessionStatus(input.sessionId, 'running', emitEvent)
  updateSessionProjection(
    input.sessionId,
    (projection) => ({
      ...applyExecutionState(projection, 'running', '正在调用 opencode 分析当前业务问题'),
      error: null,
    }),
    emitEvent,
  )

  const runtime = await ensureAgentRuntime(record)

  try {
    try {
      if (!runtime.eventPump) {
        runtime.eventPump = await startAgentEventPump(input.sessionId, runtime)
      }
    } catch (error) {
      updateSessionProjection(
        input.sessionId,
        (projection) => ({
          ...applyExecutionState(projection, 'running', '正在调用 opencode 分析当前业务问题'),
          error: {
            message: '监听 opencode 事件流失败',
            detail: error instanceof Error ? error.message : undefined,
            occurredAt: Date.now(),
          },
        }),
        emitEvent,
      )
    }

    runtime.pendingUserMessageIds.push(userMessage.id)
    await runtime.client.session.promptAsync({
      ...buildAgentPromptRequest(runtime, input.message),
      messageID: userMessage.id,
    })

    const nextRecord = getAgentSession(input.sessionId)
    if (!nextRecord) {
      throw new Error('更新 Agent 会话失败')
    }

    return {
      session: nextRecord.session,
      projection: nextRecord.projection,
    }
  } catch (error) {
    const pendingIndex = runtime.pendingUserMessageIds.lastIndexOf(userMessage.id)
    if (pendingIndex >= 0) {
      runtime.pendingUserMessageIds.splice(pendingIndex, 1)
    }

    const failedRecord = updateSessionProjection(
      input.sessionId,
      (projection) =>
        applyProjectionError(
          applyExecutionState(projection, 'failed', '本轮分析失败'),
          error instanceof Error ? error.message : 'Agent 会话运行失败',
        ),
      emitEvent,
    )
    syncSessionStatus(input.sessionId, 'failed', emitEvent)
    publishAgentEvent(
      input.sessionId,
      {
        type: 'failed',
        message: error instanceof Error ? error.message : 'Agent 会话运行失败',
      },
      emitEvent,
    )

    if (!failedRecord) {
      throw error
    }

    throw error
  }
}

export const runAgenticAnalysisSession = async (
  input: {
    sessionId: string
    message: string
  },
  emitEvent?: (event: AgentSessionEvent) => void,
): Promise<AgentSessionMessageResponse> => {
  const record = getAgentSessionRecord(input.sessionId)
  if (!record) {
    throw new Error('未找到 Agent 会话')
  }

  syncSessionStatus(input.sessionId, 'running', emitEvent)
  appendAgentObservabilityEvent(input.sessionId, {
    source: 'agent-kernel',
    kind: 'kernel.intent',
    summary: 'Agent Kernel 开始执行',
    payload: {
      stage: 'started',
      message: input.message,
    },
  })
  let kernelResult
  try {
    kernelResult = await runAgentKernel({
      sessionId: input.sessionId,
      message: input.message,
      request: record.request,
      autonomy: 'agentic',
      adapter: createAgentKernelAdapter(record, emitEvent),
      emitEvent,
    })
  } catch (error) {
    const failedRecord = updateSessionProjection(
      input.sessionId,
      (projection) =>
        applyProjectionError(
          applyExecutionState(projection, 'failed', 'Agent Kernel 执行失败'),
          error instanceof Error ? error.message : 'Agent Kernel 执行失败',
        ),
      emitEvent,
    )
    syncSessionStatus(input.sessionId, 'failed', emitEvent)
    publishAgentEvent(
      input.sessionId,
      {
        type: 'failed',
        message: error instanceof Error ? error.message : 'Agent Kernel 执行失败',
      },
      emitEvent,
    )

    if (!failedRecord) {
      throw error
    }

    return {
      session: failedRecord.session,
      projection: failedRecord.projection,
    }
  }
  appendAgentObservabilityEvent(input.sessionId, {
    source: 'agent-kernel',
    kind: 'kernel.intent',
    summary: `Agent Kernel verifier 结果：${kernelResult.verification.status}`,
    payload: {
      stage: kernelResult.verification.status,
      verificationMessage: kernelResult.verification.message,
      intent: kernelResult.intent,
      skill: kernelResult.skill,
    },
  })
  for (const observation of kernelResult.observations) {
    appendAgentObservabilityEvent(input.sessionId, {
      source: 'agent-kernel',
      kind: 'kernel.observation',
      summary:
        observation.type === 'assistant_message'
          ? 'Kernel 收到助手消息'
          : `Kernel 收到工具结果：${observation.toolName}`,
      payload: observation,
    })
  }
  const projectionText = resolveKernelProjectionText(kernelResult.verification.status)

  updateSessionProjection(
    input.sessionId,
    (projection) => {
      const nextProjection = applyExecutionState(
        {
          ...projection,
          analysis: {
            ...projection.analysis,
            summary: projectionText.analysisSummary,
          },
          workflow: {
            ...projection.workflow,
            draftSummary:
              projectionText.workflowSummary === null
                ? projection.workflow.draftSummary
                : projectionText.workflowSummary,
          },
        },
        projectionText.executionStatus,
        projectionText.latestAction,
      )

      if (projectionText.executionStatus === 'failed') return nextProjection

      const { lastFailure: _lastFailure, ...execution } = nextProjection.execution
      return {
        ...nextProjection,
        execution,
        error: null,
      }
    },
    emitEvent,
  )
  syncSessionStatus(input.sessionId, projectionText.executionStatus, emitEvent)

  const nextRecord = getAgentSession(input.sessionId)
  if (!nextRecord) {
    throw new Error('更新 Agentic 分析会话失败')
  }

  return nextRecord
}

export const syncAgentCanvas = async (input: {
  sessionId: string
  workflowSnapshot: {
    name: string
    nodes: unknown[]
    edges: unknown[]
  }
}) => {
  const record = updateAgentSessionRecord(input.sessionId, (draft) => {
    draft.projection = applyCanvasSyncState(
      {
        ...draft.projection,
        workflow: {
          ...draft.projection.workflow,
          workflowName: input.workflowSnapshot.name,
          draftNodeCount: input.workflowSnapshot.nodes.length,
          draftEdgeCount: input.workflowSnapshot.edges.length,
        },
      },
      {
        status: 'synced',
        message: `已同步当前画布，共 ${input.workflowSnapshot.nodes.length} 个节点、${input.workflowSnapshot.edges.length} 条连线`,
      },
    )
  })

  if (!record) {
    throw new Error('未找到 Agent 会话')
  }

  publishProjectionEvents(input.sessionId, record.projection)

  return {
    projection: record.projection,
    syncSummary: record.projection.canvasSync.message,
  }
}
