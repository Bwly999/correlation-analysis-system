import type { WorkflowAiNodeCatalogItem } from '../../ai/types.js'
import { CONNECTION_RULES } from '../../workflow/connectionRules.js'
import { creatableNodeDefinitions, nodeDefinitions } from '../../nodes/registry.js'
import type { NodeDefinition, NodeProperty } from '../../nodes/types.js'

type NodePropertyOption = {
  value: string
  label: string
  description?: string
}

type NodePropertyOptionsResolver = (
  input: {
    config: Record<string, unknown>
    upstreamSample?: unknown
  },
) => NodePropertyOption[] | Promise<NodePropertyOption[]>

type ServerNodeProperty = WorkflowAiNodeCatalogItem['properties'][number] & {
  options?: NodePropertyOption[]
  dependsOn?: string[]
  visibleWhen?: (config: Record<string, unknown>) => boolean
  resolveOptions?: NodePropertyOptionsResolver
}

type ServerNodeCatalogItem = Omit<WorkflowAiNodeCatalogItem, 'properties'> & {
  properties: ServerNodeProperty[]
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const extractSampleRows = (value: unknown): Array<Record<string, unknown>> => {
  if (Array.isArray(value)) {
    return value.filter(isPlainObject)
  }

  if (isPlainObject(value)) {
    const normalized = value as { kind?: string; payload?: unknown }
    if (normalized.kind === 'table' && Array.isArray(normalized.payload)) {
      return normalized.payload.filter(isPlainObject)
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

  if (!isPlainObject(option)) return null

  const rawValue = option.value
  if (
    typeof rawValue !== 'string'
    && typeof rawValue !== 'number'
    && typeof rawValue !== 'boolean'
  ) {
    return null
  }

  const value = String(rawValue)
  const label =
    typeof option.label === 'string'
      ? option.label
      : typeof option.name === 'string'
        ? option.name
        : value

  return {
    value,
    label,
    ...(typeof option.description === 'string' ? { description: option.description } : {}),
  }
}

const createPropertyOptionsResolver = (property: NodeProperty): NodePropertyOptionsResolver | undefined => {
  if (property.resolveOptions) {
    const resolveOptions = property.resolveOptions as NonNullable<NodeProperty['resolveOptions']>
    return ({ config, upstreamSample }) => {
      const resolved = resolveOptions({
        config,
        property,
        inputData: upstreamSample,
      })

      return Promise.resolve(resolved).then((options) =>
        Array.isArray(options)
          ? options.map(normalizeOption).filter((item): item is NodePropertyOption => item !== null)
          : [],
      )
    }
  }

  if (property.useUpstreamFactors) {
    return ({ upstreamSample }) => collectFieldOptions(upstreamSample)
  }

  return undefined
}

const toServerProperty = (property: NodeProperty): ServerNodeProperty => {
  const options = Array.isArray(property.options)
    ? property.options.map(normalizeOption).filter((item): item is NodePropertyOption => item !== null)
    : undefined
  const resolveOptions = createPropertyOptionsResolver(property)

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
    ...(resolveOptions ? { resolveOptions } : {}),
  }
}

const toCatalogItem = (definition: NodeDefinition): ServerNodeCatalogItem => {
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
    properties: definition.properties.map(toServerProperty),
    help: null,
    assistantHints: definition.assistantHints ?? null,
  }
}

const buildCatalogFromDefinitions = (definitions: NodeDefinition[]): ServerNodeCatalogItem[] =>
  definitions.map(toCatalogItem)

const ACTIVE_SERVER_NODE_CATALOG = buildCatalogFromDefinitions(creatableNodeDefinitions)
const ALL_SERVER_NODE_CATALOG = buildCatalogFromDefinitions(nodeDefinitions)

const cloneCatalogItem = (item: ServerNodeCatalogItem): ServerNodeCatalogItem => ({
  ...item,
  properties: item.properties.map((property) => ({
    ...property,
    ...(property.options ? { options: property.options.map((option) => ({ ...option })) } : {}),
  })),
  ...(item.assistantHints && typeof item.assistantHints === 'object'
    ? { assistantHints: { ...(item.assistantHints as Record<string, unknown>) } }
    : {}),
})

const ACTIVE_NODE_CATALOG_BY_NAME = new Map(
  ACTIVE_SERVER_NODE_CATALOG.map((item) => [item.name, item] as const),
)

const ALL_NODE_CATALOG_BY_NAME = new Map(
  ALL_SERVER_NODE_CATALOG.map((item) => [item.name, item] as const),
)

export const buildServerWorkflowAiNodeCatalog = (): WorkflowAiNodeCatalogItem[] =>
  ACTIVE_SERVER_NODE_CATALOG.map(cloneCatalogItem)

export const buildServerWorkflowAiValidationCatalog = (
  existingNodeTypes: string[] = [],
): WorkflowAiNodeCatalogItem[] => {
  const selectedNodeTypes = new Set(existingNodeTypes)
  const catalog = ACTIVE_SERVER_NODE_CATALOG.map(cloneCatalogItem)
  const includedNames = new Set(catalog.map((item) => item.name))

  selectedNodeTypes.forEach((nodeType) => {
    if (includedNames.has(nodeType)) return
    const legacyItem = ALL_NODE_CATALOG_BY_NAME.get(nodeType)
    if (!legacyItem) return
    catalog.push(cloneCatalogItem(legacyItem))
  })

  return catalog
}

export const getServerNodeCatalogItem = (nodeType: string): ServerNodeCatalogItem | null =>
  ACTIVE_NODE_CATALOG_BY_NAME.get(nodeType) ? cloneCatalogItem(ACTIVE_NODE_CATALOG_BY_NAME.get(nodeType)!) : null

export const resolveServerNodePropertyOptions = async (
  nodeType: string,
  propertyName: string,
  config: Record<string, unknown> = {},
  upstreamSample?: unknown,
) => {
  const item = getServerNodeCatalogItem(nodeType)
  if (!item) {
    return {
      found: false,
      propertyName,
      visible: false,
      options: [],
      message: `未找到节点定义: ${nodeType}`,
    }
  }

  const property = item.properties.find((candidate) => candidate.name === propertyName)
  if (!property) {
    return {
      found: false,
      propertyName,
      visible: false,
      options: [],
      message: `未找到属性 ${propertyName}`,
    }
  }

  const visible = !property.visibleWhen || property.visibleWhen(config)
  const options = property.resolveOptions
    ? await property.resolveOptions({ config, upstreamSample })
    : property.options ?? []

  return {
    found: true,
    propertyName,
    visible,
    dependsOn: property.dependsOn ?? [],
    options,
  }
}
