import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { generateText, streamText } from 'ai'
import { validateWorkflowAiPlanAgainstContext } from '../../ai/planValidation.js'
import type {
  WorkflowAiGenerationAttempt,
  WorkflowAiGenerationDiagnostics,
  WorkflowAiGenerationIssue,
  WorkflowAiGenerationStage,
  WorkflowAiModelProfile,
  WorkflowAiModelTestResult,
  WorkflowAiNodeCatalogItem,
  WorkflowAiOperation,
  WorkflowAiPlan,
  WorkflowAiPlanMode,
  WorkflowAiPlanRequest,
  WorkflowAiPlanResponse,
  WorkflowAiStreamEvent,
} from '../../ai/types.js'

const DEFAULT_BASE_URL = 'https://open.bigmodel.cn/api/paas/v4'
const DEFAULT_MODEL = 'glm-4.7'
const RAW_OUTPUT_EXCERPT_LIMIT = 1200
const WORKFLOW_AI_MODEL_TIMEOUT_MS = 45_000

type PromptNodeCatalogItem = {
  name: string
  displayName: string
  category: string
  description: string
  inputMode: 'single' | 'multiple'
  minInputs: number
  maxInputs: number | null
  allowedNextCategories: string[]
  requiredConfig: Array<{
    name: string
    displayName: string
    type: string
    description: string
  }>
  runtimeConfig: Array<{
    name: string
    displayName: string
    type: string
    description: string
  }>
  keywords: string[]
}

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

const buildPromptNodeCatalog = (
  nodeCatalog: WorkflowAiNodeCatalogItem[],
  nodeNames?: string[],
): PromptNodeCatalogItem[] => {
  const selectedNodeNames = nodeNames ? new Set(nodeNames) : null

  return nodeCatalog
    .filter((item) => !selectedNodeNames || selectedNodeNames.has(item.name))
    .map((item) => {
      const assistantHints = (item.assistantHints ?? {}) as {
        keywords?: string[]
        useCases?: string[]
      }
      return {
        name: item.name,
        displayName: item.displayName,
        category: item.category,
        description: item.description,
        inputMode: item.inputMode,
        minInputs: item.minInputs,
        maxInputs: item.maxInputs,
        allowedNextCategories: item.allowedNextCategories,
        requiredConfig: item.properties
          .filter((property) => property.required && !property.isRuntimeInput)
          .map((property) => ({
            name: property.name,
            displayName: property.displayName,
            type: property.type,
            description: property.description,
          })),
        runtimeConfig: item.properties
          .filter((property) => property.isRuntimeInput)
          .map((property) => ({
            name: property.name,
            displayName: property.displayName,
            type: property.type,
            description: property.description,
          })),
        keywords: [...(assistantHints.keywords ?? []), ...(assistantHints.useCases ?? [])].slice(0, 6),
      }
    })
}

const buildPromptStrategyHints = (
  request: WorkflowAiPlanRequest,
  stage: 'skeleton' | 'configuration',
  nodeCatalog: WorkflowAiNodeCatalogItem[],
) => {
  const hints: string[] = []
  const normalizedPrompt = request.prompt.toLowerCase()
  const mentionsJson = normalizedPrompt.includes('json')
  const mentionsLocalFile =
    /文件|上传|本地文件|csv|excel|xlsx/.test(request.prompt) || normalizedPrompt.includes('csv') || normalizedPrompt.includes('excel') || normalizedPrompt.includes('xlsx')
  const hasManualJsonImport = nodeCatalog.some((item) => item.name === 'manual-json-import')
  const hasFileImport = nodeCatalog.some((item) => item.name === 'file-import')

  if (mentionsJson && !mentionsLocalFile && hasManualJsonImport && hasFileImport) {
    hints.push(
      '若需求提到 JSON、粘贴样例、快速演示、最小可运行流程，而没有明确要求上传或读取本地文件，请优先使用 manual-json-import（手动输入数据），不要误选 file-import（本地文件导入）。',
    )
  }

  if (stage === 'configuration') {
    hints.push('配置补全阶段必须把 requiredConfig 中列出的字段写入对应节点的 config；数组型必填字段不要输出空数组。')
    hints.push(
      '如果分析节点的必填字段依赖上游表头，而当前表头信息不足，你必须二选一：1. 若上游可用 manual-json-import，则补一个最小示例 JSON，并据此填写字段；2. 在 questions 中明确追问，不要伪造字段名。',
    )
  }

  return hints
}

type RawPlanOperation = Record<string, unknown> & {
  type?: string
  id?: string
}

type WorkflowAiGenerateAttemptContext = {
  attempt: number
  trigger: 'initial' | 'repair'
  failureReason?: string
  previousRawOutput?: string
}

type WorkflowAiStreamEmitter = (event: WorkflowAiStreamEvent) => void

const normalizeString = (value: unknown) => (typeof value === 'string' ? value.trim() : '')

const normalizeStringArray = (value: unknown) =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []

const normalizePosition = (value: unknown) => {
  if (!value || typeof value !== 'object') return undefined
  const position = value as Record<string, unknown>
  if (typeof position.x !== 'number' || typeof position.y !== 'number') return undefined
  return { x: position.x, y: position.y }
}

const normalizeConfig = (value: unknown) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  return value as Record<string, unknown>
}

const filterPlanOperationsByTypes = (
  plan: WorkflowAiPlan,
  allowedTypes: Array<WorkflowAiOperation['type']>,
): WorkflowAiPlan => ({
  ...plan,
  operations: plan.operations.filter((operation) => allowedTypes.includes(operation.type)),
})

const normalizeOperation = (operation: RawPlanOperation, index: number): WorkflowAiOperation => {
  const type = normalizeString(operation.type)
  const id = normalizeString(operation.id) || `op_${index + 1}`

  if (type === 'createNode') {
    const nodeType =
      normalizeString(operation.nodeType) ||
      normalizeString(operation.name) ||
      normalizeString(operation.nodeName)
    if (!nodeType) {
      throw new Error('AI 计划中的 createNode 缺少 nodeType')
    }

    return {
      id,
      type,
      nodeType,
      nodeLabel:
        normalizeString(operation.nodeLabel) ||
        normalizeString(operation.label) ||
        normalizeString(operation.displayName) ||
        undefined,
      position: normalizePosition(operation.position),
      config: normalizeConfig(operation.config),
    }
  }

  if (type === 'updateNodeConfig') {
    const nodeRef =
      normalizeString(operation.nodeRef) ||
      normalizeString(operation.nodeId) ||
      normalizeString(operation.targetNodeId)
    if (!nodeRef) {
      throw new Error('AI 计划中的 updateNodeConfig 缺少 nodeRef')
    }

    return {
      id,
      type,
      nodeRef,
      config: normalizeConfig(operation.config) ?? {},
    }
  }

  if (type === 'renameNode') {
    const nodeRef =
      normalizeString(operation.nodeRef) ||
      normalizeString(operation.nodeId) ||
      normalizeString(operation.targetNodeId)
    const label =
      normalizeString(operation.label) ||
      normalizeString(operation.nodeLabel) ||
      normalizeString(operation.name)
    if (!nodeRef || !label) {
      throw new Error('AI 计划中的 renameNode 缺少 nodeRef 或 label')
    }

    return {
      id,
      type,
      nodeRef,
      label,
    }
  }

  if (type === 'removeNode') {
    const nodeRef =
      normalizeString(operation.nodeRef) ||
      normalizeString(operation.nodeId) ||
      normalizeString(operation.targetNodeId)
    if (!nodeRef) {
      throw new Error('AI 计划中的 removeNode 缺少 nodeRef')
    }

    return {
      id,
      type,
      nodeRef,
    }
  }

  if (type === 'connectNodes') {
    const sourceRef =
      normalizeString(operation.sourceRef) ||
      normalizeString(operation.sourceNodeId) ||
      normalizeString(operation.sourceId)
    const targetRef =
      normalizeString(operation.targetRef) ||
      normalizeString(operation.targetNodeId) ||
      normalizeString(operation.targetId)
    if (!sourceRef || !targetRef) {
      throw new Error('AI 计划中的 connectNodes 缺少 sourceRef 或 targetRef')
    }

    return {
      id,
      type,
      sourceRef,
      targetRef,
      sourceHandle: normalizeString(operation.sourceHandle) || undefined,
      targetHandle: normalizeString(operation.targetHandle) || undefined,
    }
  }

  if (type === 'disconnectEdge') {
    const edgeRef = normalizeString(operation.edgeRef) || normalizeString(operation.edgeId)
    if (!edgeRef) {
      throw new Error('AI 计划中的 disconnectEdge 缺少 edgeRef')
    }

    return {
      id,
      type,
      edgeRef,
    }
  }

  if (type === 'moveNode') {
    const nodeRef =
      normalizeString(operation.nodeRef) ||
      normalizeString(operation.nodeId) ||
      normalizeString(operation.targetNodeId)
    const position = normalizePosition(operation.position)
    if (!nodeRef || !position) {
      throw new Error('AI 计划中的 moveNode 缺少 nodeRef 或 position')
    }

    return {
      id,
      type,
      nodeRef,
      position,
    }
  }

  throw new Error(`AI 计划包含不支持的操作类型: ${type || 'unknown'}`)
}

export const parsePlan = (rawText: string): WorkflowAiPlan => {
  const normalized = extractJsonObject(stripCodeFence(rawText))
  const parsed = JSON.parse(normalized) as Partial<WorkflowAiPlan> & {
    operations?: RawPlanOperation[]
  }

  return {
    summary: parsed.summary ?? 'LLM 已生成工作流计划',
    assumptions: normalizeStringArray(parsed.assumptions),
    warnings: normalizeStringArray(parsed.warnings),
    questions: normalizeStringArray(parsed.questions),
    operations: Array.isArray(parsed.operations)
      ? parsed.operations.map((operation, index) => normalizeOperation(operation, index))
      : [],
  }
}

const buildSkeletonSystemPrompt = (request: WorkflowAiPlanRequest) => {
  const modeLabel = request.mode === 'create' ? '从零创建工作流' : '修改现有工作流'
  const { nodeCatalog } = request
  const catalog = JSON.stringify(buildPromptNodeCatalog(nodeCatalog), null, 2)
  const strategyHints = buildPromptStrategyHints(request, 'skeleton', nodeCatalog)

  return [
    '你是多因子相关性分析系统的工作流编排助手。',
    `当前任务模式：${modeLabel}。`,
    '当前阶段是骨架规划，只做三件事：选节点、定连线、识别缺失信息。',
    '你只能使用系统提供的现有节点，不能发明新节点。',
    '你必须输出一个 JSON 对象，字段为 summary、assumptions、warnings、questions、operations。',
    '当前阶段 operations 只允许 createNode 和 connectNodes。',
    'createNode 必须使用字段 id、type、nodeType、nodeLabel，可以省略 config 或只保留空对象。',
    'connectNodes 必须使用字段 id、type、sourceRef、targetRef。',
    '默认优先生成能直接运行的最小可行工作流，不要一次塞入过多可选步骤。',
    '如果关键信息不足，请在 questions 返回简短中文问题，并让 operations 为空数组或保持最小骨架。',
    '节点 label、summary、warnings、questions 都必须使用中文。',
    ...strategyHints,
    '以下是面向模型精简后的节点目录 JSON：',
    catalog,
    '骨架规划示例：{"summary":"创建一个最小相关性分析流程","assumptions":[],"warnings":[],"questions":[],"operations":[{"id":"node_import_1","type":"createNode","nodeType":"manual-json-import","nodeLabel":"手动输入数据"},{"id":"node_pearson_1","type":"createNode","nodeType":"pearson","nodeLabel":"Pearson 相关系数"},{"id":"edge_1","type":"connectNodes","sourceRef":"node_import_1","targetRef":"node_pearson_1"}]}',
  ].join('\n')
}

const buildConfigurationSystemPrompt = (
  request: WorkflowAiPlanRequest,
  skeletonPlan: WorkflowAiPlan,
) => {
  const modeLabel = request.mode === 'create' ? '从零创建工作流' : '修改现有工作流'
  const usedNodeTypes = skeletonPlan.operations
    .filter((operation): operation is Extract<WorkflowAiOperation, { type: 'createNode' }> => operation.type === 'createNode')
    .map((operation) => operation.nodeType)
  const catalog = JSON.stringify(buildPromptNodeCatalog(request.nodeCatalog, usedNodeTypes), null, 2)
  const strategyHints = buildPromptStrategyHints(request, 'configuration', request.nodeCatalog)

  return [
    '你是多因子相关性分析系统的工作流编排助手。',
    `当前任务模式：${modeLabel}。`,
    '当前阶段是配置补全，只允许围绕已确定骨架补齐最小可运行配置。',
    '你必须输出一个 JSON 对象，字段为 summary、assumptions、warnings、questions、operations。',
    '你应尽量保留既有骨架，不要新增无关节点。',
    'createNode 必须使用字段 id、type、nodeType、nodeLabel、position、config。',
    'connectNodes 必须使用字段 id、type、sourceRef、targetRef。',
    '如信息不足，请优先在 questions 中指出；不要硬编复杂增强能力。',
    ...strategyHints,
    '以下是当前骨架中涉及节点的精简目录 JSON：',
    catalog,
  ].join('\n')
}

const buildUserPrompt = (request: WorkflowAiPlanRequest) => {
  const snapshot = request.workflowSnapshot
    ? `\n当前工作流快照 JSON：\n${JSON.stringify(request.workflowSnapshot, null, 2)}`
    : '\n当前没有现有工作流快照，请从零创建。'

  return [
    `用户需求：${request.prompt}`,
    snapshot,
    '请只返回 JSON，不要返回 Markdown 代码块之外的解释。',
  ].join('\n')
}

const buildConfigurationUserPrompt = (request: WorkflowAiPlanRequest, skeletonPlan: WorkflowAiPlan) =>
  [
    `用户需求：${request.prompt}`,
    request.workflowSnapshot
      ? `当前工作流快照 JSON：\n${JSON.stringify(request.workflowSnapshot, null, 2)}`
      : '当前没有现有工作流快照，请从零创建。',
    `已确认的工作流骨架 JSON：\n${JSON.stringify(skeletonPlan, null, 2)}`,
    '请在保持这份骨架整体结构不变的前提下，补齐最小可运行配置并只返回 JSON。',
  ].join('\n\n')

const truncateRawOutput = (value: string) => {
  const normalized = value.trim()
  if (normalized.length <= RAW_OUTPUT_EXCERPT_LIMIT) return normalized
  return `${normalized.slice(0, RAW_OUTPUT_EXCERPT_LIMIT)}...`
}

const buildRepairPrompt = (basePrompt: string, context: WorkflowAiGenerateAttemptContext) =>
  [
    basePrompt,
    `上一轮失败原因：${context.failureReason ?? '上一轮输出不符合要求'}`,
    '请修正上一轮输出，只返回合法 JSON。',
    `上一轮模型原始输出：\n${truncateRawOutput(context.previousRawOutput ?? '')}`,
  ].join('\n\n')

const isTimeoutError = (error: unknown) => {
  if (!error) return false

  if (typeof DOMException !== 'undefined' && error instanceof DOMException) {
    return error.name === 'TimeoutError' || error.name === 'AbortError'
  }

  const message = error instanceof Error ? `${error.name} ${error.message}` : String(error)
  return /timeout|timed out|超时|abort/i.test(message)
}

const normalizeModelRequestErrorMessage = (error: unknown) =>
  isTimeoutError(error) ? 'AI 模型请求超时，请稍后重试或切换模型配置' : error instanceof Error ? error.message : '模型请求失败'

const normalizeComparableText = (value: string) => value.trim().toLowerCase()

const resolveNodeTypeFromCatalog = (
  nodeType: string,
  nodeLabel: string | undefined,
  nodeCatalog: WorkflowAiNodeCatalogItem[],
) => {
  const normalizedNodeType = normalizeComparableText(nodeType)
  const normalizedNodeLabel = nodeLabel ? normalizeComparableText(nodeLabel) : ''
  const findByName = (value: string) =>
    nodeCatalog.find((item) => normalizeComparableText(item.name) === value)
  const findByDisplayName = (value: string) =>
    nodeCatalog.find((item) => normalizeComparableText(item.displayName) === value)

  const byName = findByName(normalizedNodeType)
  if (byName) return byName.name

  const byDisplayName = findByDisplayName(normalizedNodeType)
  if (byDisplayName) return byDisplayName.name

  if (!['trigger', 'action', 'terminal'].includes(normalizedNodeType)) {
    return nodeType
  }

  if (!normalizedNodeLabel) {
    return nodeType
  }

  const categoryMatches = nodeCatalog.filter(
    (item) => normalizeComparableText(item.category) === normalizedNodeType,
  )
  const exactLabelMatch = categoryMatches.find(
    (item) => normalizeComparableText(item.displayName) === normalizedNodeLabel,
  )
  if (exactLabelMatch) return exactLabelMatch.name

  const looseLabelMatch = categoryMatches.find((item) => {
    const displayName = normalizeComparableText(item.displayName)
    return displayName.includes(normalizedNodeLabel) || normalizedNodeLabel.includes(displayName)
  })
  if (looseLabelMatch) return looseLabelMatch.name

  return nodeType
}

export const normalizePlanWithCatalog = (
  plan: WorkflowAiPlan,
  nodeCatalog: WorkflowAiNodeCatalogItem[],
): WorkflowAiPlan => ({
  ...plan,
  operations: plan.operations.map((operation) => {
    if (operation.type !== 'createNode') {
      return operation
    }

    return {
      ...operation,
      nodeType: resolveNodeTypeFromCatalog(operation.nodeType, operation.nodeLabel, nodeCatalog),
    }
  }),
})

const createProvider = (profile: WorkflowAiModelProfile) =>
  createOpenAICompatible({
    name: 'workflow-ai',
    baseURL: profile.baseUrl,
    apiKey: profile.apiKey,
    supportsStructuredOutputs: false,
  })

const createAttemptRecord = (
  context: WorkflowAiGenerateAttemptContext,
  status: 'success' | 'failed',
  stage: WorkflowAiGenerationStage,
  message?: string,
): WorkflowAiGenerationAttempt => ({
  attempt: context.attempt,
  trigger: context.trigger,
  status,
  stage,
  message,
})

const createIssues = (
  stage: WorkflowAiGenerationStage,
  message: string,
  operationId = 'plan',
): WorkflowAiGenerationIssue[] => [
  {
    stage,
    operationId,
    message,
  },
]

export class WorkflowAiPlanningError extends Error {
  statusCode: number
  diagnostics: WorkflowAiGenerationDiagnostics

  constructor(message: string, statusCode: number, diagnostics: WorkflowAiGenerationDiagnostics) {
    super(message)
    this.name = 'WorkflowAiPlanningError'
    this.statusCode = statusCode
    this.diagnostics = diagnostics
  }
}

export class WorkflowAiRecoverablePlanError extends WorkflowAiPlanningError {
  plan: WorkflowAiPlan

  constructor(
    message: string,
    statusCode: number,
    diagnostics: WorkflowAiGenerationDiagnostics,
    plan: WorkflowAiPlan,
  ) {
    super(message, statusCode, diagnostics)
    this.name = 'WorkflowAiRecoverablePlanError'
    this.plan = plan
  }
}

export const getSystemModelProfiles = (): WorkflowAiModelProfile[] => {
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) {
    console.warn('[WorkflowAI] OPENAI_API_KEY 环境变量未设置，系统默认模型配置将不可用')
  }

  return [
    {
      id: 'system-default-zhipu-glm-4-7',
      name: '默认智谱 GLM-4.7',
      baseUrl: process.env.OPENAI_COMPAT_BASE_URL?.trim() || DEFAULT_BASE_URL,
      model: process.env.WORKFLOW_AI_DEFAULT_MODEL?.trim() || DEFAULT_MODEL,
      apiKey,
      enabled: true,
      isDefault: true,
      source: 'system',
      capabilities: { create: true, edit: true },
    },
  ]
}

export const toPublicModelProfile = (profile: WorkflowAiModelProfile): WorkflowAiModelProfile => ({
  id: profile.id,
  name: profile.name,
  baseUrl: profile.baseUrl,
  model: profile.model,
  enabled: Boolean(profile.enabled && profile.apiKey),
  isDefault: Boolean(profile.isDefault),
  source: profile.source,
  capabilities: profile.capabilities ?? { create: true, edit: true },
})

export const resolveModelProfile = (profile: WorkflowAiModelProfile): WorkflowAiModelProfile => {
  if (profile.source !== 'system') {
    return profile
  }

  const systemProfile = getSystemModelProfiles().find((item) => item.id === profile.id)
  if (!systemProfile) {
    throw new Error('未找到系统模型配置')
  }

  return {
    ...systemProfile,
    model: profile.model || systemProfile.model,
    baseUrl: profile.baseUrl || systemProfile.baseUrl,
    enabled: profile.enabled,
  }
}

export const testWorkflowAiModelProfile = async (
  profile: WorkflowAiModelProfile,
): Promise<WorkflowAiModelTestResult> => {
  const resolvedProfile = resolveModelProfile(profile)

  if (!resolvedProfile.baseUrl || !resolvedProfile.apiKey || !resolvedProfile.model) {
    throw new Error('模型配置不完整，无法测试连通性')
  }

  const provider = createProvider(resolvedProfile)
  const startedAt = Date.now()
  await generateText({
    model: provider.chatModel(resolvedProfile.model),
    prompt: '请只回复 ok',
    temperature: 0,
    maxOutputTokens: 8,
  })

  return {
    success: true,
    message: '模型配置可用',
    latencyMs: Date.now() - startedAt,
  }
}

const requestModelText = async (
  resolvedProfile: WorkflowAiModelProfile,
  systemPrompt: string,
  userPrompt: string,
) => {
  const provider = createProvider(resolvedProfile)
  return generateText({
    model: provider.chatModel(resolvedProfile.model),
    system: systemPrompt,
    prompt: userPrompt,
    temperature: 0.2,
    timeout: { totalMs: WORKFLOW_AI_MODEL_TIMEOUT_MS },
  })
}

const requestModelTextStream = (
  resolvedProfile: WorkflowAiModelProfile,
  systemPrompt: string,
  userPrompt: string,
) => {
  const provider = createProvider(resolvedProfile)
  return streamText({
    model: provider.chatModel(resolvedProfile.model),
    system: systemPrompt,
    prompt: userPrompt,
    temperature: 0.2,
    timeout: { totalMs: WORKFLOW_AI_MODEL_TIMEOUT_MS },
  })
}

const emitStageChange = (
  emitEvent: WorkflowAiStreamEmitter,
  context: WorkflowAiGenerateAttemptContext,
  stage: WorkflowAiGenerationStage,
  message: string,
) => {
  emitEvent({
    type: 'stage_changed',
    stage,
    attempt: context.attempt,
    message,
  })
}

const validatePlan = (request: WorkflowAiPlanRequest, plan: WorkflowAiPlan, rawText: string, context: WorkflowAiGenerateAttemptContext) => {
  const validation = validateWorkflowAiPlanAgainstContext(plan, {
    nodeCatalog: request.nodeCatalog,
    existingNodes: (request.workflowSnapshot?.nodes ?? []) as Array<{
      id: string
      type: string
      config?: Record<string, unknown>
    }>,
    existingEdges: (request.workflowSnapshot?.edges ?? []) as Array<{
      id?: string
      source: string
      target: string
    }>,
  })

  if (!validation.valid) {
    throw new WorkflowAiPlanningError('AI 计划校验失败', 422, {
      status: 'failed',
      stage: 'validate',
      attempts: [createAttemptRecord(context, 'failed', 'validate', validation.issues[0]?.message ?? '计划校验失败')],
      issues: validation.issues,
      rawOutputExcerpt: truncateRawOutput(rawText),
    })
  }
}

const REQUIRED_CONFIG_ISSUE_PATTERN = /^节点 (.+) 缺少必填配置: (.+)$/

const buildRecoverableDraftPlan = (
  plan: WorkflowAiPlan,
  issues: WorkflowAiGenerationIssue[],
): WorkflowAiPlan => {
  const missingConfigByNode = new Map<string, Set<string>>()

  issues.forEach((issue) => {
    const matched = issue.message.match(REQUIRED_CONFIG_ISSUE_PATTERN)
    if (!matched) return
    const nodeLabel = matched[1]?.trim()
    const propertyLabel = matched[2]?.trim()
    if (!nodeLabel || !propertyLabel) return
    const existing = missingConfigByNode.get(nodeLabel) ?? new Set<string>()
    existing.add(propertyLabel)
    missingConfigByNode.set(nodeLabel, existing)
  })

  const warningLabels = [...missingConfigByNode.keys()]
  const extraWarnings = warningLabels.length
    ? [`以下节点仍需手动补充配置后才能运行：${warningLabels.join('、')}。`]
    : []
  const extraQuestions = [...missingConfigByNode.entries()].map(
    ([nodeLabel, propertyLabels]) =>
      `请为节点「${nodeLabel}」补充以下必填配置：${[...propertyLabels].join('、')}。`,
  )

  return {
    ...plan,
    warnings: [...new Set([...(plan.warnings ?? []), ...extraWarnings])],
    questions: [...new Set([...(plan.questions ?? []), ...extraQuestions])],
  }
}

const validateConfigurablePlan = (
  request: WorkflowAiPlanRequest,
  plan: WorkflowAiPlan,
  rawText: string,
  context: WorkflowAiGenerateAttemptContext,
) => {
  const validation = validateWorkflowAiPlanAgainstContext(plan, {
    nodeCatalog: request.nodeCatalog,
    existingNodes: (request.workflowSnapshot?.nodes ?? []) as Array<{
      id: string
      type: string
      config?: Record<string, unknown>
    }>,
    existingEdges: (request.workflowSnapshot?.edges ?? []) as Array<{
      id?: string
      source: string
      target: string
    }>,
  })

  if (!validation.valid) {
    const isRecoverable = validation.issues.length > 0
      && validation.issues.every((issue) => REQUIRED_CONFIG_ISSUE_PATTERN.test(issue.message))

    if (isRecoverable) {
      throw new WorkflowAiRecoverablePlanError('AI 计划仍需补充部分配置', 422, {
        status: 'failed',
        stage: 'validate',
        attempts: [
          createAttemptRecord(
            context,
            'failed',
            'validate',
            validation.issues[0]?.message ?? '计划仍需补充部分配置',
          ),
        ],
        issues: validation.issues,
        rawOutputExcerpt: truncateRawOutput(rawText),
      }, buildRecoverableDraftPlan(plan, validation.issues))
    }

    throw new WorkflowAiPlanningError('AI 计划校验失败', 422, {
      status: 'failed',
      stage: 'validate',
      attempts: [createAttemptRecord(context, 'failed', 'validate', validation.issues[0]?.message ?? '计划校验失败')],
      issues: validation.issues,
      rawOutputExcerpt: truncateRawOutput(rawText),
    })
  }

  return plan
}

const validateSkeletonPlan = (
  request: WorkflowAiPlanRequest,
  plan: WorkflowAiPlan,
  rawText: string,
  context: WorkflowAiGenerateAttemptContext,
) => {
  const skeletonPlan = filterPlanOperationsByTypes(normalizePlanWithCatalog(plan, request.nodeCatalog), [
    'createNode',
    'connectNodes',
  ])

  const hasUnsupportedOperation = plan.operations.some(
    (operation) => operation.type !== 'createNode' && operation.type !== 'connectNodes',
  )
  if (hasUnsupportedOperation) {
    throw new WorkflowAiPlanningError('骨架规划包含不允许的操作类型', 422, {
      status: 'failed',
      stage: 'validate',
      attempts: [createAttemptRecord(context, 'failed', 'validate', '骨架规划包含不允许的操作类型')],
      issues: createIssues('validate', '骨架规划包含不允许的操作类型'),
      rawOutputExcerpt: truncateRawOutput(rawText),
    })
  }

  const validation = validateWorkflowAiPlanAgainstContext(skeletonPlan, {
    nodeCatalog: request.nodeCatalog,
    existingNodes: (request.workflowSnapshot?.nodes ?? []) as Array<{
      id: string
      type: string
      config?: Record<string, unknown>
    }>,
    existingEdges: (request.workflowSnapshot?.edges ?? []) as Array<{
      id?: string
      source: string
      target: string
    }>,
    skipRequiredConfig: true,
  })

  if (!validation.valid) {
    throw new WorkflowAiPlanningError('AI 骨架规划校验失败', 422, {
      status: 'failed',
      stage: 'validate',
      attempts: [createAttemptRecord(context, 'failed', 'validate', validation.issues[0]?.message ?? '骨架规划校验失败')],
      issues: validation.issues,
      rawOutputExcerpt: truncateRawOutput(rawText),
    })
  }

  return skeletonPlan
}

const generateWorkflowAiPlanAttempt = async (
  resolvedProfile: WorkflowAiModelProfile,
  context: WorkflowAiGenerateAttemptContext,
  systemPrompt: string,
  userPrompt: string,
  parser: (rawText: string) => WorkflowAiPlan,
  validator: (plan: WorkflowAiPlan, rawText: string, context: WorkflowAiGenerateAttemptContext) => WorkflowAiPlan | void,
) => {
  let rawText = ''

  try {
    const result = await requestModelText(resolvedProfile, systemPrompt, userPrompt)
    rawText = result.text
  } catch (error) {
    const message = normalizeModelRequestErrorMessage(error)
    throw new WorkflowAiPlanningError(message, 500, {
      status: 'failed',
      stage: 'model_request',
      attempts: [createAttemptRecord(context, 'failed', 'model_request', message)],
      issues: createIssues('model_request', message),
    })
  }

  try {
    const parsedPlan = parser(rawText)
    const validatedPlan = validator(parsedPlan, rawText, context) || parsedPlan
    return {
      plan: validatedPlan,
      diagnostics: {
        status: 'success' as const,
        stage: 'validate' as const,
        attempts: [createAttemptRecord(context, 'success', 'validate', '计划生成成功')],
        issues: [] as WorkflowAiGenerationIssue[],
        rawOutputExcerpt: truncateRawOutput(rawText),
      },
      rawText,
    }
  } catch (error) {
    if (error instanceof WorkflowAiPlanningError) {
      throw error
    }

    const message = error instanceof Error ? error.message : 'AI 计划解析失败'
    throw new WorkflowAiPlanningError(message, 422, {
      status: 'failed',
      stage: 'parse',
      attempts: [createAttemptRecord(context, 'failed', 'parse', message)],
      issues: createIssues('parse', message),
      rawOutputExcerpt: truncateRawOutput(rawText),
    })
  }
}

const generateWorkflowAiStage = async (
  resolvedProfile: WorkflowAiModelProfile,
  initialContext: WorkflowAiGenerateAttemptContext,
  systemPrompt: string,
  userPrompt: string,
  parser: (rawText: string) => WorkflowAiPlan,
  validator: (plan: WorkflowAiPlan, rawText: string, context: WorkflowAiGenerateAttemptContext) => WorkflowAiPlan | void,
) => {
  try {
    return await generateWorkflowAiPlanAttempt(
      resolvedProfile,
      initialContext,
      systemPrompt,
      userPrompt,
      parser,
      validator,
    )
  } catch (initialError) {
    const normalizedInitialError =
      initialError instanceof WorkflowAiPlanningError
        ? initialError
        : new WorkflowAiPlanningError('AI 计划生成失败', 500, {
            status: 'failed',
            stage: 'model_request',
            attempts: [createAttemptRecord(initialContext, 'failed', 'model_request', '模型请求失败')],
            issues: createIssues('model_request', '模型请求失败'),
          })

    if (normalizedInitialError.diagnostics.stage === 'model_request') {
      throw normalizedInitialError
    }

    const repairContext: WorkflowAiGenerateAttemptContext = {
      attempt: initialContext.attempt + 1,
      trigger: 'repair',
      failureReason: normalizedInitialError.diagnostics.issues[0]?.message ?? normalizedInitialError.message,
      previousRawOutput: normalizedInitialError.diagnostics.rawOutputExcerpt,
    }

    try {
      const repairResult = await generateWorkflowAiPlanAttempt(
        resolvedProfile,
        repairContext,
        systemPrompt,
        buildRepairPrompt(userPrompt, repairContext),
        parser,
        validator,
      )
      return {
        ...repairResult,
        diagnostics: {
          ...repairResult.diagnostics,
          attempts: [
            ...normalizedInitialError.diagnostics.attempts,
            ...repairResult.diagnostics.attempts,
          ],
        },
      }
    } catch (repairError) {
      const normalizedRepairError =
        repairError instanceof WorkflowAiPlanningError
          ? repairError
          : new WorkflowAiPlanningError('AI 计划生成失败', 500, {
              status: 'failed',
              stage: 'model_request',
              attempts: [createAttemptRecord(repairContext, 'failed', 'model_request', '模型请求失败')],
              issues: createIssues('model_request', '模型请求失败'),
            })

      if (normalizedInitialError instanceof WorkflowAiRecoverablePlanError) {
        return {
          plan: normalizedInitialError.plan,
          diagnostics: {
            ...normalizedRepairError.diagnostics,
            attempts: [
              ...normalizedInitialError.diagnostics.attempts,
              ...normalizedRepairError.diagnostics.attempts,
            ],
            issues: [
              ...normalizedInitialError.diagnostics.issues,
              ...normalizedRepairError.diagnostics.issues,
            ],
            rawOutputExcerpt:
              normalizedRepairError.diagnostics.rawOutputExcerpt
              ?? normalizedInitialError.diagnostics.rawOutputExcerpt,
          },
          rawText: normalizedInitialError.diagnostics.rawOutputExcerpt ?? '',
        }
      }

      throw new WorkflowAiPlanningError(normalizedRepairError.message, normalizedRepairError.statusCode, {
        ...normalizedRepairError.diagnostics,
        attempts: [
          ...normalizedInitialError.diagnostics.attempts,
          ...normalizedRepairError.diagnostics.attempts,
        ],
      })
    }
  }
}

const streamWorkflowAiPlanAttempt = async (
  request: WorkflowAiPlanRequest,
  resolvedProfile: WorkflowAiModelProfile,
  context: WorkflowAiGenerateAttemptContext,
  emitEvent: WorkflowAiStreamEmitter,
  systemPrompt: string,
  userPrompt: string,
  parser: (rawText: string) => WorkflowAiPlan,
  validator: (plan: WorkflowAiPlan, rawText: string, context: WorkflowAiGenerateAttemptContext) => WorkflowAiPlan | void,
) => {
  let rawText = ''

  emitEvent({
    type: 'attempt_started',
    attempt: context.attempt,
    trigger: context.trigger,
    message: context.trigger === 'repair' ? '开始自动修复重试' : '开始首次生成',
  })

  emitStageChange(
    emitEvent,
    context,
    'model_request',
    context.trigger === 'repair' ? '正在请求模型输出（自动修复）' : '正在请求模型输出',
  )

  try {
    const result = requestModelTextStream(resolvedProfile, systemPrompt, userPrompt)
    for await (const delta of result.textStream) {
      rawText += delta
      emitEvent({
        type: 'text_delta',
        attempt: context.attempt,
        delta,
      })
    }
  } catch (error) {
    const message = normalizeModelRequestErrorMessage(error)
    throw new WorkflowAiPlanningError(message, 500, {
      status: 'failed',
      stage: 'model_request',
      attempts: [createAttemptRecord(context, 'failed', 'model_request', message)],
      issues: createIssues('model_request', message),
    })
  }

  try {
    emitStageChange(emitEvent, context, 'parse', '正在解析模型输出')
    const parsedPlan = parser(rawText)
    emitStageChange(emitEvent, context, 'validate', '正在校验工作流计划')
    const validatedPlan = validator(parsedPlan, rawText, context) || parsedPlan
    return {
      plan: validatedPlan,
      diagnostics: {
        status: 'success' as const,
        stage: 'validate' as const,
        attempts: [createAttemptRecord(context, 'success', 'validate', '计划生成成功')],
        issues: [] as WorkflowAiGenerationIssue[],
        rawOutputExcerpt: truncateRawOutput(rawText),
      },
      rawText,
    }
  } catch (error) {
    if (error instanceof WorkflowAiPlanningError) {
      throw error
    }

    const message = error instanceof Error ? error.message : 'AI 计划解析失败'
    throw new WorkflowAiPlanningError(message, 422, {
      status: 'failed',
      stage: 'parse',
      attempts: [createAttemptRecord(context, 'failed', 'parse', message)],
      issues: createIssues('parse', message),
      rawOutputExcerpt: truncateRawOutput(rawText),
    })
  }
}

const streamWorkflowAiStage = async (
  request: WorkflowAiPlanRequest,
  resolvedProfile: WorkflowAiModelProfile,
  initialContext: WorkflowAiGenerateAttemptContext,
  emitEvent: WorkflowAiStreamEmitter,
  systemPrompt: string,
  userPrompt: string,
  parser: (rawText: string) => WorkflowAiPlan,
  validator: (plan: WorkflowAiPlan, rawText: string, context: WorkflowAiGenerateAttemptContext) => WorkflowAiPlan | void,
) => {
  try {
    return await streamWorkflowAiPlanAttempt(
      request,
      resolvedProfile,
      initialContext,
      emitEvent,
      systemPrompt,
      userPrompt,
      parser,
      validator,
    )
  } catch (initialError) {
    const normalizedInitialError =
      initialError instanceof WorkflowAiPlanningError
        ? initialError
        : new WorkflowAiPlanningError('AI 计划生成失败', 500, {
            status: 'failed',
            stage: 'model_request',
            attempts: [createAttemptRecord(initialContext, 'failed', 'model_request', '模型请求失败')],
            issues: createIssues('model_request', '模型请求失败'),
          })

    if (normalizedInitialError.diagnostics.stage === 'model_request') {
      throw normalizedInitialError
    }

    emitEvent({
      type: 'diagnostic',
      diagnostics: normalizedInitialError.diagnostics,
      message: '当前阶段输出不合法，准备自动修复重试',
    })

    const repairContext: WorkflowAiGenerateAttemptContext = {
      attempt: initialContext.attempt + 1,
      trigger: 'repair',
      failureReason: normalizedInitialError.diagnostics.issues[0]?.message ?? normalizedInitialError.message,
      previousRawOutput: normalizedInitialError.diagnostics.rawOutputExcerpt,
    }

    try {
      const repairResult = await streamWorkflowAiPlanAttempt(
        request,
        resolvedProfile,
        repairContext,
        emitEvent,
        systemPrompt,
        buildRepairPrompt(userPrompt, repairContext),
        parser,
        validator,
      )
      return {
        ...repairResult,
        diagnostics: {
          ...repairResult.diagnostics,
          attempts: [
            ...normalizedInitialError.diagnostics.attempts,
            ...repairResult.diagnostics.attempts,
          ],
        },
      }
    } catch (repairError) {
      const normalizedRepairError =
        repairError instanceof WorkflowAiPlanningError
          ? repairError
          : new WorkflowAiPlanningError('AI 计划生成失败', 500, {
              status: 'failed',
              stage: 'model_request',
              attempts: [createAttemptRecord(repairContext, 'failed', 'model_request', '模型请求失败')],
              issues: createIssues('model_request', '模型请求失败'),
            })

      if (normalizedInitialError instanceof WorkflowAiRecoverablePlanError) {
        const mergedDiagnostics: WorkflowAiGenerationDiagnostics = {
          ...normalizedRepairError.diagnostics,
          attempts: [
            ...normalizedInitialError.diagnostics.attempts,
            ...normalizedRepairError.diagnostics.attempts,
          ],
          issues: [
            ...normalizedInitialError.diagnostics.issues,
            ...normalizedRepairError.diagnostics.issues,
          ],
          rawOutputExcerpt:
            normalizedRepairError.diagnostics.rawOutputExcerpt
            ?? normalizedInitialError.diagnostics.rawOutputExcerpt,
        }

        emitEvent({
          type: 'diagnostic',
          diagnostics: mergedDiagnostics,
          message: '自动修复仍未完成全部配置，已回退为待补充配置的草案计划',
        })

        return {
          plan: normalizedInitialError.plan,
          diagnostics: mergedDiagnostics,
          rawText: normalizedInitialError.diagnostics.rawOutputExcerpt ?? '',
        }
      }

      throw new WorkflowAiPlanningError(normalizedRepairError.message, normalizedRepairError.statusCode, {
        ...normalizedRepairError.diagnostics,
        attempts: [
          ...normalizedInitialError.diagnostics.attempts,
          ...normalizedRepairError.diagnostics.attempts,
        ],
      })
    }
  }
}

export const generateWorkflowAiPlan = async (
  request: WorkflowAiPlanRequest,
): Promise<WorkflowAiPlanResponse> => {
  const resolvedProfile = resolveModelProfile(request.profile)

  if (!resolvedProfile.enabled) {
    throw new Error('当前模型配置不可用，请先检查模型设置')
  }

  if (!resolvedProfile.apiKey) {
    throw new Error('模型配置缺少 API Key')
  }

  const initialContext: WorkflowAiGenerateAttemptContext = {
    attempt: 1,
    trigger: 'initial',
  }

  const skeletonStage = await generateWorkflowAiStage(
    resolvedProfile,
    initialContext,
    buildSkeletonSystemPrompt(request),
    buildUserPrompt(request),
    parsePlan,
    (plan, rawText, context) => validateSkeletonPlan(request, plan, rawText, context),
  )

  if (!skeletonStage.plan.operations.length) {
    return {
      plan: skeletonStage.plan,
      diagnostics: skeletonStage.diagnostics,
    }
  }

  const configurationStage = await generateWorkflowAiStage(
    resolvedProfile,
    {
      attempt: skeletonStage.diagnostics.attempts.length + 1,
      trigger: 'initial',
    },
    buildConfigurationSystemPrompt(request, skeletonStage.plan),
    buildConfigurationUserPrompt(request, skeletonStage.plan),
    parsePlan,
    (plan, rawText, context) => {
      const normalizedPlan = normalizePlanWithCatalog(plan, request.nodeCatalog)
      return validateConfigurablePlan(request, normalizedPlan, rawText, context)
    },
  )

  return {
    plan: configurationStage.plan,
    diagnostics: {
      ...configurationStage.diagnostics,
      attempts: [
        ...skeletonStage.diagnostics.attempts,
        ...configurationStage.diagnostics.attempts,
      ],
    },
  }
}

export const streamWorkflowAiPlan = async (
  request: WorkflowAiPlanRequest,
  emitEvent: WorkflowAiStreamEmitter,
): Promise<WorkflowAiPlanResponse> => {
  emitEvent({
    type: 'started',
    message: 'AI 编排已开始',
  })

  const resolvedProfile = resolveModelProfile(request.profile)

  if (!resolvedProfile.enabled) {
    const error = new WorkflowAiPlanningError('当前模型配置不可用，请先检查模型设置', 400, {
      status: 'failed',
      stage: 'model_request',
      attempts: [],
      issues: createIssues('model_request', '当前模型配置不可用，请先检查模型设置'),
    })
    emitEvent({ type: 'failed', message: error.message, diagnostics: error.diagnostics })
    throw error
  }

  if (!resolvedProfile.apiKey) {
    const error = new WorkflowAiPlanningError('模型配置缺少 API Key', 400, {
      status: 'failed',
      stage: 'model_request',
      attempts: [],
      issues: createIssues('model_request', '模型配置缺少 API Key'),
    })
    emitEvent({ type: 'failed', message: error.message, diagnostics: error.diagnostics })
    throw error
  }

  const initialContext: WorkflowAiGenerateAttemptContext = {
    attempt: 1,
    trigger: 'initial',
  }

  try {
    emitStageChange(emitEvent, initialContext, 'normalize', '正在规划最小工作流骨架')
    const skeletonStage = await streamWorkflowAiStage(
      request,
      resolvedProfile,
      initialContext,
      emitEvent,
      buildSkeletonSystemPrompt(request),
      buildUserPrompt(request),
      parsePlan,
      (plan, rawText, context) => validateSkeletonPlan(request, plan, rawText, context),
    )

    if (!skeletonStage.plan.operations.length) {
      emitEvent({
        type: 'completed',
        plan: skeletonStage.plan,
        diagnostics: skeletonStage.diagnostics,
      })
      return {
        plan: skeletonStage.plan,
        diagnostics: skeletonStage.diagnostics,
      }
    }

    emitStageChange(
      emitEvent,
      { attempt: skeletonStage.diagnostics.attempts.length + 1, trigger: 'initial' },
      'normalize',
      '正在基于骨架补齐最小运行配置',
    )

    const configurationStage = await streamWorkflowAiStage(
      request,
      resolvedProfile,
      {
        attempt: skeletonStage.diagnostics.attempts.length + 1,
        trigger: 'initial',
      },
      emitEvent,
      buildConfigurationSystemPrompt(request, skeletonStage.plan),
      buildConfigurationUserPrompt(request, skeletonStage.plan),
      parsePlan,
      (plan, rawText, context) => {
        const normalizedPlan = normalizePlanWithCatalog(plan, request.nodeCatalog)
        return validateConfigurablePlan(request, normalizedPlan, rawText, context)
      },
    )

    const mergedDiagnostics: WorkflowAiGenerationDiagnostics = {
      ...configurationStage.diagnostics,
      attempts: [
        ...skeletonStage.diagnostics.attempts,
        ...configurationStage.diagnostics.attempts,
      ],
    }

    emitEvent({
      type: 'completed',
      plan: configurationStage.plan,
      diagnostics: mergedDiagnostics,
    })
    return {
      plan: configurationStage.plan,
      diagnostics: mergedDiagnostics,
    }
  } catch (error) {
    const planningError =
      error instanceof WorkflowAiPlanningError
        ? error
        : new WorkflowAiPlanningError('AI 计划生成失败', 500, {
            status: 'failed',
            stage: 'model_request',
            attempts: [createAttemptRecord(initialContext, 'failed', 'model_request', '模型请求失败')],
            issues: createIssues('model_request', '模型请求失败'),
          })
    emitEvent({
      type: 'failed',
      message: planningError.message,
      diagnostics: planningError.diagnostics,
    })
    throw planningError
  }
}
