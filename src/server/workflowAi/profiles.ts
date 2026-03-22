import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { generateText } from 'ai'
import type {
  WorkflowAiModelProfile,
  WorkflowAiModelTestResult,
  WorkflowAiNodeCatalogItem,
  WorkflowAiOperation,
  WorkflowAiPlan,
  WorkflowAiPlanMode,
  WorkflowAiPlanRequest,
} from '../../ai/types.js'

const DEFAULT_BASE_URL = 'https://open.bigmodel.cn/api/paas/v4'
const DEFAULT_MODEL = 'glm-4.7'
const DEFAULT_API_KEY = ''

const stripCodeFence = (value: string) =>
  value
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim()

type RawPlanOperation = Record<string, unknown> & {
  type?: string
  id?: string
}

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
  const normalized = stripCodeFence(rawText)
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

const buildSystemPrompt = (mode: WorkflowAiPlanMode, nodeCatalog: WorkflowAiNodeCatalogItem[]) => {
  const modeLabel = mode === 'create' ? '从零创建工作流' : '修改现有工作流'
  const catalog = JSON.stringify(nodeCatalog, null, 2)

  return [
    '你是多因子相关性分析系统的工作流编排助手。',
    `当前任务模式：${modeLabel}。`,
    '你只能使用系统提供的现有节点，不能发明新节点，也不能输出解释性散文。',
    '你必须输出一个 JSON 对象，字段为 summary、assumptions、warnings、questions、operations。',
    'operations 必须只使用以下类型：createNode、updateNodeConfig、renameNode、removeNode、connectNodes、disconnectEdge、moveNode。',
    'createNode 必须使用字段 id、type、nodeType、nodeLabel、position、config。',
    'connectNodes 必须使用字段 id、type、sourceRef、targetRef，严禁使用 sourceNodeId、targetNodeId、name 等别名。',
    '如果信息不足，可以在 questions 返回需要追问的简短中文问题，并让 operations 为空数组。',
    '如果用户要求修改现有工作流，优先最小改动，不要重建整个流程。',
    '节点 label、summary、warnings、questions 都必须使用中文。',
    '请严格遵守节点连接规则、单输入/多输入限制和属性名称。',
    '以下是系统可用节点目录 JSON：',
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

export const getSystemModelProfiles = (): WorkflowAiModelProfile[] => [
  {
    id: 'system-default-zhipu-glm-4-7',
    name: '默认智谱 GLM-4.7',
    baseUrl: process.env.OPENAI_COMPAT_BASE_URL?.trim() || DEFAULT_BASE_URL,
    model: process.env.WORKFLOW_AI_DEFAULT_MODEL?.trim() || DEFAULT_MODEL,
    apiKey: process.env.OPENAI_API_KEY?.trim() || DEFAULT_API_KEY,
    enabled: true,
    isDefault: true,
    source: 'system',
    capabilities: { create: true, edit: true },
  },
]

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

export const generateWorkflowAiPlan = async (request: WorkflowAiPlanRequest): Promise<WorkflowAiPlan> => {
  const resolvedProfile = resolveModelProfile(request.profile)

  if (!resolvedProfile.enabled) {
    throw new Error('当前模型配置不可用，请先检查模型设置')
  }

  if (!resolvedProfile.apiKey) {
    throw new Error('模型配置缺少 API Key')
  }

  const provider = createProvider(resolvedProfile)
  const result = await generateText({
    model: provider.chatModel(resolvedProfile.model),
    system: buildSystemPrompt(request.mode, request.nodeCatalog),
    prompt: buildUserPrompt(request),
    temperature: 0.2,
  })

  return normalizePlanWithCatalog(parsePlan(result.text), request.nodeCatalog)
}


