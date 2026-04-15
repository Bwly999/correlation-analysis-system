import { randomUUID } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:net'
import { createOpencodeClient, createOpencodeServer } from '@opencode-ai/sdk/v2'
import * as z from 'zod/v4'
import type {
  AgentProjectionSnapshot,
  AgentSessionEvent,
  AgentSessionMessage,
  AgentSessionMessageResponse,
  AgentSessionStartResponse,
  AgentSessionState,
  AgentConclusion,
  AgentInterpretationResult,
  WorkflowAiModelProfile,
  WorkflowAiPlan,
  WorkflowAiPlanRequest,
  WorkflowAiStreamEvent,
} from '../../ai/types.js'
import { validateWorkflowAiPlanAgainstContext } from '../../ai/planValidation.js'
import { executeNodesForAgent } from '../agentLoop/nodeExecutor.js'
import {
  DEFAULT_AGENT_LOOP_CONFIG,
  type AgentLoopConfig,
  type AgentLoopOutput,
  type AgentLoopStreamEmitter,
} from '../agentLoop/types.js'
import { buildNextIterationRequest } from '../agentLoop/phases.js'
import { resolveModelProfile } from '../workflowAi/profiles.js'
import { getWorkflowAiSessionRecord } from '../workflowAi/orchestrator.js'
import {
  appendAgentSessionMessage,
  createAgentSessionRecord,
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
  buildInitialProjection,
  resolveAssistantMessageText,
  type AgentStructuredResponse,
} from './projection.js'

type SessionRecord = NonNullable<ReturnType<typeof getWorkflowAiSessionRecord>>

export type RunAnalysisAgentSessionLoopInput = {
  sessionId: string
  sessionRecord: SessionRecord
  userId?: string
  profile?: WorkflowAiModelProfile
  config?: Partial<AgentLoopConfig>
  serverBaseUrl?: string
}

const WORKFLOW_MCP_NAME = 'workflow'
const OPENCODE_TEMP_ROOT = join(tmpdir(), 'correlation-analysis-system', 'opencode-runtime')
const OPENCODE_AGENT_REQUEST_TIMEOUT_MS = 45_000
const WORKFLOW_MCP_TOOL_NAMES = [
  'get_analysis_session_context',
  'get_node_catalog',
  'get_node_definition',
  'validate_workflow_plan',
  'get_saved_workflow',
  'list_workflow_versions',
  'get_workflow_version',
  'rollback_workflow_version',
] as const

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

const interpretationSchema = z.object({
  text: z.string(),
  shouldContinue: z.boolean(),
  continueReason: z.string().optional(),
})

const conclusionSchema = z.object({
  summary: z.string(),
  findings: z.array(z.string()).default([]),
  recommendations: z.array(z.string()).default([]),
  caveats: z.array(z.string()).default([]),
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

const buildWorkflowToolSelectionMap = (toolIds: string[]) =>
  Object.fromEntries(
    [
      ...WORKFLOW_MCP_TOOL_NAMES,
      ...WORKFLOW_MCP_TOOL_NAMES.map((toolName) => `${WORKFLOW_MCP_NAME}_${toolName}`),
      ...toolIds.filter((toolId) => isWorkflowMcpToolId(toolId)),
    ].map((toolId) => [toolId, true]),
  )

const isWorkflowMcpToolId = (toolId: string) =>
  toolId.startsWith(`${WORKFLOW_MCP_NAME}_`)
  || WORKFLOW_MCP_TOOL_NAMES.some((name) => name === toolId)

const buildWorkflowToolAlias = (toolName: typeof WORKFLOW_MCP_TOOL_NAMES[number]) =>
  `${toolName}（或 ${WORKFLOW_MCP_NAME}_${toolName}）`

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

const parsePromptResponse = <T>(response: any, schema: z.ZodType<T>): T => {
  const structured = response?.data?.info?.structured
  if (structured !== undefined) {
    return schema.parse(structured)
  }

  const text = extractPromptText(response)
  if (!text) {
    throw new Error('Opencode 未返回结构化结果')
  }

  return schema.parse(JSON.parse(extractJsonObject(stripCodeFence(text))))
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

const buildPlanningSystemPrompt = () =>
  [
    '你是多因子相关性分析系统的自动分析代理。',
    '你当前运行在隔离的临时目录中，不要读取本地文件、不要执行 shell，也不要尝试编辑工作区。',
    '你只能使用 workflow MCP 工具获取上下文、节点定义、已保存工作流与版本信息。',
    `在输出最终计划前，必须至少调用 ${buildWorkflowToolAlias('get_analysis_session_context')}、${buildWorkflowToolAlias('get_node_catalog')}，并用 ${buildWorkflowToolAlias('validate_workflow_plan')} 校验最终计划。`,
    `如需确认节点属性或连接约束，可调用 ${buildWorkflowToolAlias('get_node_definition')}。`,
    '所有 summary、warnings、questions、nodeLabel 必须使用中文。',
    '默认优先输出最小可运行计划，不要堆砌多余节点。',
    '只返回符合 JSON Schema 的对象。',
  ].join('\n')

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

const buildPlanningUserPrompt = (
  request: WorkflowAiPlanRequest,
  iteration: number,
  previousInterpretation?: AgentInterpretationResult | null,
) => {
  const contextLines = [
    `当前轮次：第 ${iteration} 轮`,
    `任务模式：${request.mode === 'edit' ? '修改现有工作流' : '创建新工作流'}`,
    `用户目标：${request.prompt}`,
  ]

  if (previousInterpretation?.continueReason) {
    contextLines.push(`上一轮继续原因：${previousInterpretation.continueReason}`)
  } else if (previousInterpretation?.text) {
    contextLines.push(`上一轮判断：${previousInterpretation.text}`)
  }

  contextLines.push(
    '请基于 MCP 工具返回的信息规划本轮工作流。',
    '输出字段必须包含 summary、assumptions、warnings、questions、operations。',
  )

  return contextLines.join('\n')
}

const buildPlanningRepairPrompt = (basePrompt: string, issues: Array<{ message: string }>, previousPlan: WorkflowAiPlan) =>
  [
    basePrompt,
    '',
    '你上一版计划未通过本地校验，请只修复这些问题后重新输出完整计划：',
    ...issues.map((issue, index) => `${index + 1}. ${issue.message}`),
    '',
    `上一版计划 JSON：\n${JSON.stringify(previousPlan, null, 2)}`,
  ].join('\n')

const buildInterpretationSystemPrompt = () =>
  [
    '你是数据分析结果判断助手。',
    '你不能继续向用户追问，只能基于已有执行结果判断是否还需要追加分析。',
    '如果当前结果已足够回答用户目标，则 shouldContinue=false。',
    '如果结果仍不足，则 shouldContinue=true，并在 continueReason 中说明下一轮需要补什么分析。',
    'text 字段必须用中文说明判断依据。',
    '只返回符合 JSON Schema 的对象。',
  ].join('\n')

const buildInterpretationUserPrompt = (
  request: WorkflowAiPlanRequest,
  plan: WorkflowAiPlan,
  executionResults: AgentLoopOutput['iterations'][number]['executionResults'],
  iteration: number,
) =>
  [
    `用户目标：${request.prompt}`,
    `当前轮次：第 ${iteration} 轮`,
    `本轮计划摘要：${plan.summary}`,
    `执行结果 JSON：\n${JSON.stringify(executionResults, null, 2)}`,
    '请判断是否需要继续分析。',
  ].join('\n\n')

const buildConclusionSystemPrompt = () =>
  [
    '你是多因子分析结论生成助手。',
    '请根据完整分析过程输出最终结论。',
    'summary 要求 2-3 句中文总结。',
    'findings、recommendations、caveats 必须是中文字符串数组。',
    '不要编造未在分析结果中出现的事实。',
    '只返回符合 JSON Schema 的对象。',
  ].join('\n')

const buildConclusionUserPrompt = (
  request: WorkflowAiPlanRequest,
  iterations: AgentLoopOutput['iterations'],
) =>
  [
    `用户目标：${request.prompt}`,
    `分析过程 JSON：\n${JSON.stringify(iterations, null, 2)}`,
  ].join('\n\n')

const promptStructured = async <T>(options: {
  client: any
  sessionID: string
  providerID: string
  modelID: string
  system: string
  prompt: string
  schema: z.ZodType<T>
  tools: Record<string, boolean>
}) => {
  const response = await options.client.session.prompt({
    sessionID: options.sessionID,
    model: {
      providerID: options.providerID,
      modelID: options.modelID,
    },
    agent: 'general',
    tools: options.tools,
    system: options.system,
    format: {
      type: 'json_schema',
      schema: z.toJSONSchema(options.schema),
    },
    parts: [
      {
        type: 'text',
        text: options.prompt,
      },
    ],
  })

  return parsePromptResponse(response, options.schema)
}

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

const runPlanningWithRepair = async (options: {
  client: any
  sessionID: string
  providerID: string
  modelID: string
  request: WorkflowAiPlanRequest
  iteration: number
  tools: Record<string, boolean>
  previousInterpretation?: AgentInterpretationResult | null
}) => {
  const basePrompt = buildPlanningUserPrompt(
    options.request,
    options.iteration,
    options.previousInterpretation,
  )
  const firstPlan = await promptStructured({
    client: options.client,
    sessionID: options.sessionID,
    providerID: options.providerID,
    modelID: options.modelID,
    tools: options.tools,
    system: buildPlanningSystemPrompt(),
    prompt: basePrompt,
    schema: workflowPlanSchema,
  })
  const firstValidation = validateWorkflowPlan(options.request, firstPlan)
  if (firstValidation.valid) {
    return firstPlan
  }

  const repairedPlan = await promptStructured({
    client: options.client,
    sessionID: options.sessionID,
    providerID: options.providerID,
    modelID: options.modelID,
    tools: options.tools,
    system: buildPlanningSystemPrompt(),
    prompt: buildPlanningRepairPrompt(basePrompt, firstValidation.issues, firstPlan),
    schema: workflowPlanSchema,
  })
  const repairedValidation = validateWorkflowPlan(options.request, repairedPlan)
  if (!repairedValidation.valid) {
    throw new Error(
      `Opencode 生成的工作流计划未通过校验：${repairedValidation.issues.map((issue) => issue.message).join('；')}`,
    )
  }

  return repairedPlan
}

const startEventPump = (client: any, sessionID: string) => {
  let aborted = false

  const run = async () => {
    const subscription = await subscribeToOpencodeEvents(client)
    const task = (async () => {
      try {
        for await (const event of subscription.stream) {
          if (event?.type === 'permission.asked' && event.properties?.sessionID === sessionID) {
            await client.permission.reply({
              requestID: event.properties.id,
              reply: 'once',
            })
          }
        }
      } catch {
        if (!aborted) {
          throw new Error('监听 opencode 事件流失败')
        }
      }
    })()

    return {
      stop: async () => {
        aborted = true
        subscription.stop()
        await task.catch(() => undefined)
      },
    }
  }

  return run()
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
  publishAgentEvent(sessionId, { type: 'session.status.updated', session: record.session }, emitEvent)
  return record
}

const updateSessionProjection = (
  sessionId: string,
  updater: (projection: AgentProjectionSnapshot) => AgentProjectionSnapshot,
  emitEvent?: (event: AgentSessionEvent) => void,
) => {
  const record = updateAgentSessionRecord(sessionId, (draft) => {
    draft.projection = updater(draft.projection)
  })
  if (!record) return null
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
      headers: {
        'x-workflow-ai-session-id': record.session.id,
        'x-workflow-storage-user-id':
          record.userId || process.env.WORKFLOW_STORAGE_DEFAULT_USER_ID || 'server-demo-user',
      },
    },
  })
  await client.mcp.connect({ name: WORKFLOW_MCP_NAME })

  const toolIdsResponse = await client.tool.ids()
  const toolSelection = buildWorkflowToolSelectionMap(toolIdsResponse.data ?? [])
  const session = await client.session.create({
    title: `agent-session-${record.session.id}`,
    permission: [
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
      {
        permission: '*',
        pattern: '*',
        action: 'deny',
      },
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
    const assistantEntry = resolveAssistantMessageEntry(entries, userMessageId)

    if (!assistantEntry) {
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

    const structured = parseAssistantMessageEntry(record, assistantEntry)
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
      if (event?.type === 'permission.asked' && event.properties?.sessionID === runtime.sessionID) {
        await runtime.client.permission.reply({
          requestID: event.properties.id,
          reply: 'once',
        })
        continue
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
  record: AgentSessionRecord,
  entry: any,
): AgentStructuredResponse => {
  const structured = entry?.info?.structured
  if (structured !== undefined) {
    return normalizeStructuredResponse(record, parseAgentStructuredResponsePayload(structured))
  }

  const text = extractMessageEntryText(entry)
  if (!text) {
    throw new Error(getAssistantEntryFailureMessage(entry) || 'Opencode 未返回可解析的助手消息')
  }

  try {
    return normalizeStructuredResponse(
      record,
      parseAgentStructuredResponsePayload(JSON.parse(extractJsonObject(stripCodeFence(text)))),
    )
  } catch {
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

export const runAnalysisAgentSessionLoop = async (
  input: RunAnalysisAgentSessionLoopInput,
  emitEvent: AgentLoopStreamEmitter,
): Promise<AgentLoopOutput> => {
  const startedAt = Date.now()
  const mergedConfig: AgentLoopConfig = {
    ...DEFAULT_AGENT_LOOP_CONFIG,
    ...input.config,
  }

  const baseRequest: WorkflowAiPlanRequest = {
    ...input.sessionRecord.request,
    profile: input.profile ?? input.sessionRecord.request.profile,
  }
  const resolvedProfile = resolveModelProfile(baseRequest.profile)

  if (!resolvedProfile.enabled) {
    throw new Error('当前模型配置不可用，请先检查模型设置')
  }

  if (!resolvedProfile.apiKey) {
    throw new Error('模型配置缺少 API Key')
  }

  const providerID = createOpencodeProviderId(resolvedProfile)
  const modelID = resolvedProfile.model
  const tempDirectory = ensureTempDirectory(input.sessionId)
  const port = await findAvailablePort()
  const server = await createOpencodeServer({
    port,
    config: buildOpencodeConfig(resolvedProfile),
  })

  let eventPump: Awaited<ReturnType<typeof startEventPump>> | null = null

  try {
    const client = createOpencodeClient({
      baseUrl: server.url,
      directory: tempDirectory,
      throwOnError: true,
    } as any)

    await client.mcp.add({
      name: WORKFLOW_MCP_NAME,
      config: {
        type: 'remote',
        url: resolveWorkflowMcpUrl(input.serverBaseUrl),
        headers: {
          'x-workflow-ai-session-id': input.sessionId,
          'x-workflow-storage-user-id':
            input.userId || process.env.WORKFLOW_STORAGE_DEFAULT_USER_ID || 'server-demo-user',
        },
      },
    })
    await client.mcp.connect({ name: WORKFLOW_MCP_NAME })

    const toolIdsResponse = await client.tool.ids()
    const toolSelection = buildWorkflowToolSelectionMap(toolIdsResponse.data ?? [])

    const session = await client.session.create({
      title: `workflow-analysis-${input.sessionId}`,
      permission: [
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
        {
          permission: '*',
          pattern: '*',
          action: 'deny',
        },
      ],
    })
    const opencodeSessionID = session.data?.id
    if (!opencodeSessionID) {
      throw new Error('创建 opencode 会话失败')
    }
    eventPump = await startEventPump(client, opencodeSessionID)

    const iterations: AgentLoopOutput['iterations'] = []
    let currentRequest = baseRequest
    let previousInterpretation: AgentInterpretationResult | null = null

    emitEvent({
      type: 'loop_started',
      maxIterations: mergedConfig.maxIterations,
    } as WorkflowAiStreamEvent)

    for (let iteration = 1; iteration <= mergedConfig.maxIterations; iteration += 1) {
      emitEvent({
        type: 'loop_iteration_started',
        iteration,
      } as WorkflowAiStreamEvent)

      const plan = await runPlanningWithRepair({
        client,
        sessionID: opencodeSessionID,
        providerID,
        modelID,
        request: currentRequest,
        iteration,
        tools: toolSelection,
        previousInterpretation,
      })

      if (!mergedConfig.autoExecute || plan.operations.length === 0) {
        iterations.push({
          iteration,
          plan,
          executionResults: [],
          interpretation: null,
        })
        break
      }

      const executionResults = await executeNodesForAgent(plan, currentRequest, emitEvent)
      const interpretation = await promptStructured({
        client,
        sessionID: opencodeSessionID,
        providerID,
        modelID,
        tools: toolSelection,
        system: buildInterpretationSystemPrompt(),
        prompt: buildInterpretationUserPrompt(currentRequest, plan, executionResults, iteration),
        schema: interpretationSchema,
      })

      emitEvent({
        type: 'interpretation_completed',
        iteration,
        shouldContinue: interpretation.shouldContinue,
      } as WorkflowAiStreamEvent)

      const completedIteration = {
        iteration,
        plan,
        executionResults,
        interpretation,
      }
      iterations.push(completedIteration)

      emitEvent({
        type: 'loop_iteration_completed',
        iteration,
        plan,
        executionResults,
        interpretation,
      } as WorkflowAiStreamEvent)

      if (!interpretation.shouldContinue) {
        previousInterpretation = interpretation
        break
      }

      previousInterpretation = interpretation
      currentRequest = buildNextIterationRequest(
        currentRequest,
        plan.summary,
        executionResults,
        interpretation,
      )
    }

    let conclusion: AgentConclusion | null = null
    if (mergedConfig.generateConclusion && iterations.length > 0) {
      emitEvent({
        type: 'conclusion_started',
      } as WorkflowAiStreamEvent)
      conclusion = await promptStructured({
        client,
        sessionID: opencodeSessionID,
        providerID,
        modelID,
        tools: toolSelection,
        system: buildConclusionSystemPrompt(),
        prompt: buildConclusionUserPrompt(baseRequest, iterations),
        schema: conclusionSchema,
      })
      emitEvent({
        type: 'conclusion_completed',
        conclusion,
      } as WorkflowAiStreamEvent)
    }

    const output: AgentLoopOutput = {
      iterations,
      conclusion,
      totalIterations: iterations.length,
      totalDurationMs: Date.now() - startedAt,
    }

    emitEvent({
      type: 'loop_completed',
      totalIterations: output.totalIterations,
      totalDurationMs: output.totalDurationMs,
      output,
    } as WorkflowAiStreamEvent)

    return output
  } finally {
    await eventPump?.stop()
    server.close()
    cleanupTempDirectory(tempDirectory)
  }
}
