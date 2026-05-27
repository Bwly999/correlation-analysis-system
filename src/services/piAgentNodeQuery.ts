import type { WorkflowAiNodeCatalogItem } from '@/ai/types'
import { CONNECTION_RULES } from '@/workflow/connectionRules'
import { creatableNodeDefinitions, getNodeDefinition } from '@/nodes/registry'
import type { NodeDefinition, NodeProperty } from '@/nodes/types'

type QueryMode = 'info' | 'docs' | 'search_properties' | 'runtime_requirements'

type NodePropertyOption = {
  value: string
  label: string
  description?: string
}

type FrontendNodeProperty = WorkflowAiNodeCatalogItem['properties'][number] & {
  options?: NodePropertyOption[]
  dependsOn?: string[]
  visibleWhen?: (config: Record<string, unknown>) => boolean
}

type FrontendNodeCatalogItem = Omit<WorkflowAiNodeCatalogItem, 'properties'> & {
  properties: FrontendNodeProperty[]
}

const buildResult = (structuredContent: Record<string, unknown>) => ({
  content: [{ type: 'text' as const, text: JSON.stringify(structuredContent, null, 2) }],
  details: structuredContent,
})

const paginate = <T>(items: T[], input: { limit?: number; offset?: number } = {}) => {
  const limit = Math.min(Math.max(Math.floor(input.limit ?? 20), 1), 100)
  const offset = Math.max(Math.floor(input.offset ?? 0), 0)
  const pageItems = items.slice(offset, offset + limit)
  const nextOffset = offset + pageItems.length

  return {
    total: items.length,
    count: pageItems.length,
    offset,
    limit,
    hasMore: nextOffset < items.length,
    nextOffset: nextOffset < items.length ? nextOffset : null,
    items: pageItems,
  }
}

const extractSampleRows = (value: unknown): Array<Record<string, unknown>> => {
  if (Array.isArray(value)) {
    return value.filter(
      (item): item is Record<string, unknown> =>
        Boolean(item) && typeof item === 'object' && !Array.isArray(item),
    )
  }

  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const normalized = value as { kind?: string; payload?: unknown }
    if (normalized.kind === 'table' && Array.isArray(normalized.payload)) {
      return normalized.payload.filter(
        (item): item is Record<string, unknown> =>
          Boolean(item) && typeof item === 'object' && !Array.isArray(item),
      )
    }
  }

  return []
}

const collectFieldOptions = (upstreamSample?: unknown): NodePropertyOption[] => {
  const rows = extractSampleRows(upstreamSample)
  if (!rows.length) return []

  return [...new Set(rows.flatMap((row) => Object.keys(row)))].map((field) => ({
    value: field,
    label: field,
  }))
}

const normalizeOption = (option: unknown): NodePropertyOption | null => {
  if (typeof option === 'string' || typeof option === 'number' || typeof option === 'boolean') {
    const value = String(option)
    return { value, label: value }
  }

  if (!option || typeof option !== 'object' || Array.isArray(option)) return null

  const candidate = option as {
    value?: unknown
    label?: unknown
    name?: unknown
    description?: unknown
  }

  if (
    typeof candidate.value !== 'string'
    && typeof candidate.value !== 'number'
    && typeof candidate.value !== 'boolean'
  ) {
    return null
  }

  const value = String(candidate.value)
  const label =
    typeof candidate.label === 'string'
      ? candidate.label
      : typeof candidate.name === 'string'
        ? candidate.name
        : value

  return {
    value,
    label,
    ...(typeof candidate.description === 'string' ? { description: candidate.description } : {}),
  }
}

const toFrontendProperty = (property: NodeProperty): FrontendNodeProperty => {
  const options = Array.isArray(property.options)
    ? property.options.map(normalizeOption).filter((item): item is NodePropertyOption => item !== null)
    : undefined

  return {
    name: property.name,
    displayName: property.displayName,
    type: property.type,
    required: property.required ?? false,
    isRuntimeInput: property.isRuntimeInput ?? false,
    defaultValue: property.default ?? null,
    description: property.description ?? '',
    ...(property.numberMode ? { numberMode: property.numberMode } : {}),
    ...(typeof property.step === 'number' ? { step: property.step } : {}),
    ...(typeof property.maxFractionDigits === 'number'
      ? { maxFractionDigits: property.maxFractionDigits }
      : {}),
    ...(options?.length ? { options } : {}),
    ...(property.dependencies?.length ? { dependsOn: property.dependencies } : {}),
    ...(property.displayIf ? { visibleWhen: property.displayIf } : {}),
  }
}

const toCatalogItem = (definition: NodeDefinition): FrontendNodeCatalogItem => {
  const inputMode = definition.inputMode ?? 'single'
  const minInputs =
    definition.minInputs
    ?? (definition.category === 'trigger' ? 0 : 1)
  const maxInputs =
    definition.maxInputs
    ?? (inputMode === 'multiple' ? null : 1)

  return {
    name: definition.name,
    displayName: definition.displayName,
    category: definition.category,
    description: definition.description,
    inputMode,
    minInputs,
    maxInputs,
    allowedNextCategories: CONNECTION_RULES[definition.category] ?? [],
    properties: definition.properties.map(toFrontendProperty),
    help: definition.help ?? null,
    assistantHints: definition.assistantHints ?? null,
  }
}

const ACTIVE_NODE_CATALOG = creatableNodeDefinitions.map(toCatalogItem)
const ACTIVE_NODE_CATALOG_BY_NAME = new Map(
  ACTIVE_NODE_CATALOG.map((item) => [item.name, item] as const),
)

const extractMatchedUseCases = (item: WorkflowAiNodeCatalogItem) => {
  const assistantHints = item.assistantHints as { useCases?: string[]; keywords?: string[] } | null | undefined
  return [...(assistantHints?.useCases ?? []), ...(assistantHints?.keywords ?? [])].slice(0, 4)
}

const toCompactNodeCatalogItem = (item: WorkflowAiNodeCatalogItem) => ({
  name: item.name,
  displayName: item.displayName,
  category: item.category,
  description: item.description,
  inputMode: item.inputMode,
  minInputs: item.minInputs,
  maxInputs: item.maxInputs,
  allowedNextCategories: item.allowedNextCategories,
  matchedUseCases: extractMatchedUseCases(item),
  recommendedFollowUp: `如果这个节点和当前问题相关，下一步用 workflow_get_node 查看 ${item.name} 的配置字段和运行要求。`,
})

const buildNodeRecommendedNextStep = (item: WorkflowAiNodeCatalogItem) => {
  const requiredInputs = item.properties
    .filter((property) => property.required)
    .map((property) => property.displayName || property.name)
  const requiredText = requiredInputs.length > 0 ? `重点确认 ${requiredInputs.join('、')}。` : '重点确认可选配置和输入约束。'
  return `如果用户还没有得到最终答案，继续围绕 ${item.displayName} 的配置与适用场景补充说明；${requiredText}`
}

const buildNodeQuestionExamples = (item: WorkflowAiNodeCatalogItem) => {
  const useCases = extractMatchedUseCases(item)
  if (useCases.length > 0) {
    return useCases.map((useCase) => `${item.displayName} 是否适合${useCase}？`)
  }

  return [
    `${item.displayName} 需要配置哪些关键字段？`,
    `${item.displayName} 适合放在当前分析链路的哪个位置？`,
  ]
}

const enrichNodeInfoResult = (result: Record<string, unknown>) => {
  const item = result.item as WorkflowAiNodeCatalogItem | undefined
  if (!item || !Array.isArray(item.properties)) {
    return result
  }

  const keyProperties = item.properties
    .filter((property) => property.required || Boolean(property.description))
    .slice(0, 5)
    .map((property) => ({
      name: property.name,
      displayName: property.displayName,
      required: property.required,
      type: property.type,
      description: property.description,
    }))
  const requiredInputs = item.properties
    .filter((property) => property.required)
    .map((property) => property.name)

  return {
    ...result,
    keyProperties,
    requiredInputs,
    recommendedNextStep: buildNodeRecommendedNextStep(item),
    exampleQuestionsThisNodeCanAnswer: buildNodeQuestionExamples(item),
  }
}

const resolveRuntimeRequirements = (
  item: FrontendNodeCatalogItem,
  config: Record<string, unknown>,
  upstreamSample?: unknown,
) =>
  item.properties.map((property) => ({
    name: property.name,
    displayName: property.displayName,
    required: property.required ?? false,
    isRuntimeInput: property.isRuntimeInput ?? false,
    visible: !property.visibleWhen || property.visibleWhen(config),
    dependsOn: property.dependsOn ?? [],
    type: property.type,
    description: property.description ?? '',
    options: property.options ?? (getNodeDefinition(item.name)?.properties.find((candidate) => candidate.name === property.name)?.useUpstreamFactors
      ? collectFieldOptions(upstreamSample)
      : []),
  }))

export const buildWorkflowAiNodeCatalog = (): WorkflowAiNodeCatalogItem[] =>
  ACTIVE_NODE_CATALOG.map((item) => ({
    ...item,
    properties: item.properties.map((property) => ({
      name: property.name,
      displayName: property.displayName,
      type: property.type,
      required: property.required,
      isRuntimeInput: property.isRuntimeInput,
      defaultValue: property.defaultValue,
      description: property.description,
      ...(property.numberMode ? { numberMode: property.numberMode } : {}),
      ...(typeof property.step === 'number' ? { step: property.step } : {}),
      ...(typeof property.maxFractionDigits === 'number'
        ? { maxFractionDigits: property.maxFractionDigits }
        : {}),
    })),
  }))

export const queryPiAgentNodeCatalog = (input: { limit?: number; offset?: number } = {}) =>
  (() => {
    const page = paginate(ACTIVE_NODE_CATALOG.map(toCompactNodeCatalogItem), input)
    return buildResult({
      summary: `已读取节点目录，共 ${page.count} 条`,
      ...page,
    })
  })()

export const queryPiAgentNode = (input: {
  nodeType: string
  mode?: QueryMode
  propertyQuery?: string
  config?: Record<string, unknown>
  upstreamSample?: unknown
}) => {
  const item = ACTIVE_NODE_CATALOG_BY_NAME.get(input.nodeType)
  const mode = input.mode ?? 'info'

  if (!item) {
    return buildResult({
      summary: `未找到节点定义: ${input.nodeType}`,
      found: false,
      message: `未找到节点定义: ${input.nodeType}`,
    })
  }

  if (mode === 'docs') {
    return buildResult({
      summary: `已读取节点文档: ${item.displayName}`,
      found: true,
      item,
      docs: [
        `# ${item.displayName}`,
        '',
        item.description,
        '',
        ...item.properties.map((property) =>
          `- ${property.displayName}（${property.name}）: ${property.description ?? '无说明'}`),
      ].join('\n'),
    })
  }

  if (mode === 'search_properties') {
    const query = typeof input.propertyQuery === 'string' ? input.propertyQuery.trim().toLowerCase() : ''
    const properties = item.properties.filter((property) =>
      `${property.name} ${property.displayName} ${property.description ?? ''}`.toLowerCase().includes(query))

    return buildResult({
      summary: `已读取节点属性: ${item.displayName}`,
      found: true,
      item,
      properties,
    })
  }

  if (mode === 'runtime_requirements') {
    return buildResult({
      summary: `已读取节点运行要求: ${item.displayName}`,
      found: true,
      item,
      runtimeRequirements: resolveRuntimeRequirements(item, input.config ?? {}, input.upstreamSample),
    })
  }

  return buildResult(
    enrichNodeInfoResult({
      summary: `已读取节点信息: ${item.displayName}`,
      found: true,
      item,
    }),
  )
}
