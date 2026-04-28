import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { generateText, streamText } from 'ai'
import { buildRecoverableDraftPlanFromIssues } from '../../ai/draft/graph.js'
import { validateWorkflowAiPlanAgainstContext } from '../../ai/planValidation.js'
import { searchWorkflowRecipes } from '../../ai/recipes/search.js'
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

const DEFAULT_BASE_URL = 'https://open.bigmodel.cn/api/coding/paas/v4'
const DEFAULT_MODEL = 'glm-4.7'
const RAW_OUTPUT_EXCERPT_LIMIT = 1200
const WORKFLOW_AI_MODEL_TIMEOUT_MS = 45_000
const WORKFLOW_AI_MAX_OUTPUT_TOKENS = 1200

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

type PromptRecipeItem = {
  id: string
  name: string
  reason: string
  minimalPattern: string[]
  preferredEntryNodes: string[]
  preferredTerminalNodes: string[]
  requiresSchemaInspection: boolean
}

type PromptContextRecipeItem = {
  id: string
  name: string
  reason: string
  minimalPattern: string[]
}

type PromptContextSchemaItem = {
  nodeId: string
  nodeLabel: string
  resultKind: 'table' | 'tableCollection' | 'json' | 'unknown'
  rowCount?: number
  numericColumns: string[]
  categoricalColumns?: string[]
  datetimeColumns?: string[]
  candidateTargetColumns: string[]
  candidateFeatureColumns: string[]
  blockedReasons: string[]
}

type PromptContextUserAnswerItem = {
  key: string
  value: string
  label?: string
  reason?: string
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

const selectSkeletonNodeCatalog = (request: WorkflowAiPlanRequest) => {
  const prompt = request.prompt.toLowerCase()
  const recipeNodeNames = new Set(
    buildPromptRecipes(request).flatMap((recipe) => [
      ...recipe.minimalPattern,
      ...recipe.preferredEntryNodes,
      ...recipe.preferredTerminalNodes,
    ]),
  )

  const matchedNodes = request.nodeCatalog.filter((item) => {
    if (recipeNodeNames.has(item.name)) return true
    if (prompt.includes(item.name.toLowerCase())) return true
    if (prompt.includes(item.displayName.toLowerCase())) return true

    const assistantHints = (item.assistantHints ?? {}) as {
      keywords?: string[]
      useCases?: string[]
    }
    const hintTerms = [...(assistantHints.keywords ?? []), ...(assistantHints.useCases ?? [])]

    return hintTerms.some((term) => prompt.includes(term.toLowerCase()))
  })

  return matchedNodes.length >= 2 ? matchedNodes : request.nodeCatalog
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

const buildPromptRecipes = (request: WorkflowAiPlanRequest): PromptRecipeItem[] =>
  searchWorkflowRecipes({
    prompt: request.prompt,
    mode: request.mode,
  }).slice(0, 3)

const buildRecipePromptBlock = (request: WorkflowAiPlanRequest) => {
  const recipes = buildPromptRecipes(request)
  if (!recipes.length) return []

  return [
    '以下是根据当前需求召回的候选编排模板，请优先参考其最小骨架，不要随意发散：',
    `候选编排模板 JSON：\n${JSON.stringify(recipes, null, 2)}`,
  ]
}

const buildContextHintPromptBlock = (request: WorkflowAiPlanRequest) => {
  const recipes = (request.contextHints?.recipes ?? []) as PromptContextRecipeItem[]
  const schemaSummaries = (request.contextHints?.schemaSummaries ?? []) as PromptContextSchemaItem[]
  const userAnswers = (request.contextHints?.userAnswers ?? []) as PromptContextUserAnswerItem[]

  if (!recipes.length && !schemaSummaries.length && !userAnswers.length) return []

  return [
    '应用内工具已提供以下上下文摘要，请优先基于这些事实决定骨架和最小配置，不要重复假设：',
    ...(recipes.length
      ? [`本地候选模板 JSON：\n${JSON.stringify(recipes, null, 2)}`]
      : []),
    ...(schemaSummaries.length
      ? [`本地字段摘要 JSON：\n${JSON.stringify(schemaSummaries, null, 2)}`]
      : []),
    ...(userAnswers.length
      ? [
          '以下是用户针对上一轮缺失信息补充的明确答案，优先使用这些答案，不要继续追问相同问题：',
          `用户补充信息 JSON：\n${JSON.stringify(userAnswers, null, 2)}`,
        ]
      : []),
  ]
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
  const nodeCatalog = selectSkeletonNodeCatalog(request)
  const catalog = JSON.stringify(buildPromptNodeCatalog(nodeCatalog))
  const strategyHints = buildPromptStrategyHints(request, 'skeleton', request.nodeCatalog)
  const recipePromptBlock = buildRecipePromptBlock(request)
  const contextHintPromptBlock = buildContextHintPromptBlock(request)

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
    ...recipePromptBlock,
    ...contextHintPromptBlock,
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
  const catalog = JSON.stringify(buildPromptNodeCatalog(request.nodeCatalog, usedNodeTypes))
  const strategyHints = buildPromptStrategyHints(request, 'configuration', request.nodeCatalog)
  const contextHintPromptBlock = buildContextHintPromptBlock(request)

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
    ...contextHintPromptBlock,
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

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

type InlineJsonPromptData = {
  instructionText: string
  jsonText: string
  rows: Array<Record<string, unknown>>
}

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const extractInlineJsonPromptData = (prompt: string): InlineJsonPromptData | null => {
  for (let startIndex = 0; startIndex < prompt.length; startIndex += 1) {
    if (prompt[startIndex] !== '[') continue

    let depth = 0
    let inString = false
    let escaped = false

    for (let index = startIndex; index < prompt.length; index += 1) {
      const current = prompt[index]!

      if (inString) {
        if (escaped) {
          escaped = false
          continue
        }
        if (current === '\\') {
          escaped = true
          continue
        }
        if (current === '"') {
          inString = false
        }
        continue
      }

      if (current === '"') {
        inString = true
        continue
      }

      if (current === '[') {
        depth += 1
        continue
      }

      if (current !== ']') continue

      depth -= 1
      if (depth !== 0) continue

      const jsonText = prompt.slice(startIndex, index + 1).trim()

      try {
        const parsed = JSON.parse(jsonText)
        if (!Array.isArray(parsed) || !parsed.every(isPlainObject)) {
          continue
        }

        const instructionText = `${prompt.slice(0, startIndex)} ${prompt.slice(index + 1)}`
          .replace(/\s+/g, ' ')
          .trim()

        return {
          instructionText,
          jsonText,
          rows: parsed as Array<Record<string, unknown>>,
        }
      } catch {
        break
      }
    }
  }

  return null
}

const isMissingCellValue = (value: unknown) =>
  value === null || value === undefined || (typeof value === 'string' && value.trim().length === 0)

const isNumericLikeValue = (value: unknown) =>
  (typeof value === 'number' && Number.isFinite(value))
  || (typeof value === 'string' && value.trim().length > 0 && Number.isFinite(Number(value)))

const collectFieldNames = (rows: Array<Record<string, unknown>>) => {
  const fields: string[] = []
  const seen = new Set<string>()

  rows.forEach((row) => {
    Object.keys(row).forEach((field) => {
      if (seen.has(field)) return
      seen.add(field)
      fields.push(field)
    })
  })

  return fields
}

const inferNumericFields = (rows: Array<Record<string, unknown>>, fields: string[]) =>
  fields.filter((field) => {
    const presentValues = rows
      .map((row) => row[field])
      .filter((value) => !isMissingCellValue(value))
    return presentValues.length >= 2 && presentValues.every(isNumericLikeValue)
  })

const includesFieldReference = (text: string, field: string) => {
  if (!field.trim()) return false
  if (/^[A-Za-z0-9_]+$/.test(field)) {
    return new RegExp(`(^|[^A-Za-z0-9_])${escapeRegExp(field)}([^A-Za-z0-9_]|$)`, 'i').test(text)
  }
  return text.includes(field)
}

const parseScalarValue = (value: string): unknown => {
  const normalized = value.trim().replace(/[，。；：]+$/u, '')
  if (!normalized) return ''

  if (
    (normalized.startsWith('"') && normalized.endsWith('"'))
    || (normalized.startsWith('\'') && normalized.endsWith('\''))
  ) {
    return normalized.slice(1, -1)
  }

  if (/^-?\d+(?:\.\d+)?$/.test(normalized)) {
    return Number(normalized)
  }

  if (/^(true|false)$/i.test(normalized)) {
    return normalized.toLowerCase() === 'true'
  }

  return normalized
}

const inferSelectedFields = (instructionText: string, fields: string[]) => {
  if (!/只保留|保留.+字段|字段选择|字段裁剪/.test(instructionText)) {
    return []
  }

  return fields.filter((field) => includesFieldReference(instructionText, field))
}

const inferFilterConfig = (instructionText: string) => {
  const match = instructionText.match(
    /([A-Za-z_][A-Za-z0-9_]*)\s*(大于等于|小于等于|不等于|大于|小于|等于|>=|<=|!=|>|<|=)\s*([^\s，。；：]+)/u,
  )
  if (!match) return null

  const operatorMap: Record<string, string> = {
    大于: 'gt',
    '>': 'gt',
    大于等于: 'gte',
    '>=': 'gte',
    小于: 'lt',
    '<': 'lt',
    小于等于: 'lte',
    '<=': 'lte',
    等于: 'equals',
    '=': 'equals',
    不等于: 'not_equals',
    '!=': 'not_equals',
  }

  return {
    matchMode: 'all',
    conditions: [
      {
        field: match[1]!,
        operator: operatorMap[match[2]!] ?? 'equals',
        value: parseScalarValue(match[3]!),
      },
    ],
  }
}

const inferSortConfig = (instructionText: string, fields: string[]) => {
  const explicitMatch = instructionText.match(
    /按\s*([A-Za-z_][A-Za-z0-9_]*)\s*(?:字段)?\s*(倒序|降序|升序|asc|desc)/iu,
  )
  const directionText = explicitMatch?.[2] ?? (/倒序|降序|desc/i.test(instructionText) ? 'desc' : /升序|asc/i.test(instructionText) ? 'asc' : '')

  if (!directionText) return null

  const field =
    explicitMatch?.[1]
    ?? fields.find((candidate) => includesFieldReference(instructionText, candidate))

  if (!field) return null

  return {
    sortRules: [
      {
        field,
        direction: /倒序|降序|desc/i.test(directionText) ? 'desc' : 'asc',
      },
    ],
  }
}

const inferLimitConfig = (instructionText: string) => {
  const match = instructionText.match(/(前|后)\s*(\d+)\s*条/u)
  if (!match) return null

  return {
    mode: match[1] === '后' ? 'tail' : 'head',
    limit: Number(match[2]),
  }
}

const inferDedupConfig = (instructionText: string) => {
  const deduplicate = /重复记录|重复行|去重|重复数据|重复样本/u.test(instructionText)
  if (!deduplicate) return null

  return {
    deduplicationMode: 'full_row',
    deduplicationKeep: 'first',
  }
}

const inferMissingOutlierConfig = (instructionText: string) => {
  const handleMissing = /缺失值|空值|缺失字段|空白值|空白数据/u.test(instructionText)
  const handleOutlier = /异常值|离群点|极端值|iqr|百分位/u.test(instructionText)
  const manualRange = /上限|下限|区间|阈值|范围/u.test(instructionText)
  if (!handleMissing && !handleOutlier) return null

  return {
    missingValueStrategy: handleMissing ? 'drop' : 'none',
    outlierMethod: handleOutlier ? (manualRange ? 'manual_range' : 'iqr') : 'none',
  }
}

const inferEncodingScalingConfig = (instructionText: string) => {
  const shouldScale = /标准化|归一化|缩放|z[-\s]?score|min[-\s]?max/u.test(instructionText)
  const shouldEncode = /编码|label\s*encoding|类别变量/u.test(instructionText)
  if (!shouldScale && !shouldEncode) return null

  return {
    scaling: shouldScale ? 'zscore' : 'none',
    encoding: shouldEncode ? 'label' : 'none',
  }
}

const inferCorrelationConfig = (instructionText: string, numericFields: string[]) => {
  if (numericFields.length < 2) return null

  const mentionedNumericFields = numericFields.filter((field) => includesFieldReference(instructionText, field))
  const targetFieldPatterns = [/^target$/i, /^y$/i, /^label$/i, /^sales$/i, /^score$/i]

  const preferredTarget =
    mentionedNumericFields.find((field) => targetFieldPatterns.some((pattern) => pattern.test(field)))
    ?? numericFields.find((field) => targetFieldPatterns.some((pattern) => pattern.test(field)))
    ?? mentionedNumericFields[mentionedNumericFields.length - 1]
    ?? numericFields[numericFields.length - 1]

  if (!preferredTarget) return null

  const xFields = numericFields.filter((field) => field !== preferredTarget)
  if (!xFields.length) return null

  return {
    xFields,
    yFields: [preferredTarget],
    heatmapTopN: Math.max(1, Math.min(8, numericFields.length)),
    rankingTopN: Math.max(1, Math.min(8, numericFields.length)),
  }
}

const createHeuristicDiagnostics = (
  plan: WorkflowAiPlan,
): WorkflowAiGenerationDiagnostics => ({
  status: 'success',
  stage: 'validate',
  attempts: [
    {
      attempt: 1,
      trigger: 'initial',
      status: 'success',
      stage: 'validate',
      message: '命中内嵌 JSON 快速规划',
    },
  ],
  issues: [],
  rawOutputExcerpt: truncateRawOutput(JSON.stringify(plan)),
})

const tryBuildHeuristicPlanResponse = (
  request: WorkflowAiPlanRequest,
): WorkflowAiPlanResponse | null => {
  const inlineJson = extractInlineJsonPromptData(request.prompt)
  if (!inlineJson) return null

  const availableNodeTypes = new Set(request.nodeCatalog.map((item) => item.name))
  if (!availableNodeTypes.has('manual-json-import')) return null

  const fields = collectFieldNames(inlineJson.rows)
  const instructionText = inlineJson.instructionText || request.prompt
  const numericFields = inferNumericFields(inlineJson.rows, fields)
  const selectedFields = inferSelectedFields(instructionText, fields)
  const effectiveFields = selectedFields.length ? selectedFields : fields
  const effectiveNumericFields = numericFields.filter((field) => effectiveFields.includes(field))
  const filterConfig = inferFilterConfig(instructionText)
  const sortConfig = inferSortConfig(instructionText, fields)
  const limitConfig = inferLimitConfig(instructionText)
  const dedupConfig = inferDedupConfig(instructionText)
  const missingOutlierConfig = inferMissingOutlierConfig(instructionText)
  const encodingScalingConfig = inferEncodingScalingConfig(instructionText)

  const mentionsCorrelation = /pearson|spearman|kendall|相关|关系/u.test(instructionText)
  const mentionsProfiling = /体检|画像|字段风险|适不适合|适合做相关|头部样本|特征/u.test(instructionText)
  const asksOnlyForFollowup = /还能做什么分析|还能做哪些分析/u.test(instructionText)

  const operations: WorkflowAiOperation[] = []
  let previousNodeId: string | null = null

  const appendNode = (
    id: string,
    nodeType: string,
    nodeLabel: string,
    config?: Record<string, unknown>,
  ) => {
    if (!availableNodeTypes.has(nodeType)) return

    operations.push({
      id,
      type: 'createNode',
      nodeType,
      nodeLabel,
      config,
    })

    if (previousNodeId) {
      operations.push({
        id: `edge_${previousNodeId}_${id}`,
        type: 'connectNodes',
        sourceRef: previousNodeId,
        targetRef: id,
      })
    }

    previousNodeId = id
  }

  appendNode('node_import_1', 'manual-json-import', '手动输入数据', {
    jsonData: inlineJson.jsonText,
    autoClean: true,
  })

  if (dedupConfig) appendNode('node_dedup_1', 'data-dedup', '去重', dedupConfig)
  if (missingOutlierConfig) appendNode('node_missing_outlier_1', 'data-missing-outlier', '缺失/异常值处理', missingOutlierConfig)
  if (encodingScalingConfig) appendNode('node_encoding_scaling_1', 'data-encoding-scaling', '编码/缩放', encodingScalingConfig)

  if (filterConfig && /筛选|过滤/u.test(instructionText)) {
    appendNode('node_filter_1', 'data-filter', '数据筛选', filterConfig)
  }

  if (selectedFields.length) {
    appendNode('node_field_selection_1', 'field-selection', '字段选择', {
      mode: 'include',
      fields: selectedFields,
    })
  }

  if (sortConfig && /排序|倒序|升序|降序|asc|desc/iu.test(instructionText)) {
    appendNode('node_sort_1', 'sort', '排序', sortConfig)
  }

  if (limitConfig) {
    appendNode('node_limit_1', 'data-limit', '数据量限制', limitConfig)
  }

  const shouldPreferProfiling =
    mentionsProfiling
    || (!mentionsCorrelation && (selectedFields.length > 0 || Boolean(sortConfig) || Boolean(limitConfig)))
    || effectiveNumericFields.length < 2

  if (!asksOnlyForFollowup) {
    if (mentionsCorrelation && !shouldPreferProfiling) {
      const terminalType = /spearman/i.test(instructionText)
        ? 'spearman'
        : /kendall/i.test(instructionText)
          ? 'kendall'
          : 'pearson'
      const correlationConfig = inferCorrelationConfig(instructionText, effectiveNumericFields)
      if (correlationConfig) {
        const terminalLabel =
          terminalType === 'spearman'
            ? 'Spearman 秩相关系数'
            : terminalType === 'kendall'
              ? 'Kendall 秩相关系数'
              : 'Pearson 相关系数'
        appendNode('node_terminal_1', terminalType, terminalLabel, correlationConfig)
      }
    } else if (availableNodeTypes.has('data-profiling')) {
      appendNode('node_terminal_1', 'data-profiling', '数据体检', {
        topFields: Math.min(8, Math.max(3, fields.length)),
      })
    }
  }

  const warnings: string[] = []
  if (mentionsCorrelation && effectiveNumericFields.length < 2) {
    warnings.push('样例数据中的可用数值字段不足，已优先回退到数据体检流程。')
  }
  if (asksOnlyForFollowup && filterConfig) {
    warnings.push('筛选条件可能导致结果为空，先保留最小筛选链路以便后续谨慎收敛。')
  }

  const summary =
    operations.some((operation) => operation.type === 'createNode' && operation.nodeType === 'data-profiling')
      ? '已基于内嵌 JSON 生成最小数据体检流程'
      : operations.some((operation) => operation.type === 'createNode' && ['pearson', 'spearman', 'kendall'].includes(operation.nodeType))
        ? '已基于内嵌 JSON 生成最小相关性分析流程'
        : '已基于内嵌 JSON 生成最小预处理流程'

  const plan: WorkflowAiPlan = {
    summary,
    assumptions: ['已直接使用用户在提示中提供的 JSON 样例作为流程输入。'],
    warnings,
    questions: [],
    operations,
  }

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
    return null
  }

  return {
    plan,
    diagnostics: createHeuristicDiagnostics(plan),
  }
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

export const createProvider = (profile: WorkflowAiModelProfile) =>
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
    maxOutputTokens: WORKFLOW_AI_MAX_OUTPUT_TOKENS,
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
    maxOutputTokens: WORKFLOW_AI_MAX_OUTPUT_TOKENS,
    timeout: { totalMs: WORKFLOW_AI_MODEL_TIMEOUT_MS },
  })
}

const shouldBypassStreaming = (resolvedProfile: WorkflowAiModelProfile) =>
  resolvedProfile.baseUrl.toLowerCase().includes('open.bigmodel.cn/api/coding/paas/v4')

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
      }, buildRecoverableDraftPlanFromIssues(plan, validation.issues))
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
    if (shouldBypassStreaming(resolvedProfile)) {
      const result = await requestModelText(resolvedProfile, systemPrompt, userPrompt)
      rawText = result.text
      if (rawText) {
        emitEvent({
          type: 'text_delta',
          attempt: context.attempt,
          delta: rawText,
        })
      }
    } else {
      const result = requestModelTextStream(resolvedProfile, systemPrompt, userPrompt)
      for await (const delta of result.textStream) {
        rawText += delta
        emitEvent({
          type: 'text_delta',
          attempt: context.attempt,
          delta,
        })
      }

      if (!rawText.trim()) {
        const fallbackResult = await requestModelText(resolvedProfile, systemPrompt, userPrompt)
        rawText = fallbackResult.text
        if (rawText) {
          emitEvent({
            type: 'text_delta',
            attempt: context.attempt,
            delta: rawText,
          })
        }
      }
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

  const heuristicResponse = tryBuildHeuristicPlanResponse(request)
  if (heuristicResponse) {
    return heuristicResponse
  }

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

  const heuristicResponse = tryBuildHeuristicPlanResponse(request)
  if (heuristicResponse) {
    const heuristicContext: WorkflowAiGenerateAttemptContext = {
      attempt: 1,
      trigger: 'initial',
    }
    emitEvent({
      type: 'attempt_started',
      attempt: heuristicContext.attempt,
      trigger: heuristicContext.trigger,
      message: '检测到内嵌 JSON，启用本地快速规划',
    })
    emitStageChange(emitEvent, heuristicContext, 'normalize', '正在生成本地快速规划结果')
    emitEvent({
      type: 'text_delta',
      attempt: heuristicContext.attempt,
      delta: JSON.stringify(heuristicResponse.plan),
    })
    emitStageChange(emitEvent, heuristicContext, 'validate', '正在校验本地快速规划结果')
    emitEvent({
      type: 'completed',
      plan: heuristicResponse.plan,
      diagnostics: heuristicResponse.diagnostics,
    })
    return heuristicResponse
  }

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
