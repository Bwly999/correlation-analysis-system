import { isNodeResult, normalizeNodeResult } from '../../nodes/result.js'
import {
  materializeDraftGraphToWorkflowSnapshot,
  type WorkflowAiSnapshotEdge,
  type WorkflowAiSnapshotNode,
} from '../../ai/draft/graph.js'
import type { AiDraftGraph } from '../../ai/draft/types.js'
import type { WorkflowAiPlanRequest } from '../../ai/types.js'

type InspectionSourceKind = 'canvas-cache' | 'canvas-ephemeral-run' | 'draft-ephemeral-run'

type ExecutedInspectionResult =
  | {
      ok: true
      value: unknown
      sourceKind: InspectionSourceKind
      nodeId: string
      nodeLabel: string
    }
  | {
      ok: false
      message: string
      nodeId: string
      nodeLabel: string
    }

type ExecutableWorkflowSnapshot = {
  name?: string
  nodes: WorkflowAiSnapshotNode[]
  edges: WorkflowAiSnapshotEdge[]
}

type InspectionNodeProperty = {
  name: string
  displayName: string
  required?: boolean
  isRuntimeInput?: boolean
  type: string
  displayIf?: (config: Record<string, unknown>) => boolean
}

type InspectionNodeDefinition = {
  name: string
  displayName: string
  category: 'trigger' | 'action' | 'terminal'
  inputMode?: 'single' | 'multiple'
  properties: InspectionNodeProperty[]
  execute: (input: unknown, config: Record<string, unknown>) => Promise<unknown> | unknown
}

const UNSUPPORTED_RUNTIME_INPUT_TYPES = new Set(['file'])

const isMissingValue = (value: unknown) =>
  value === undefined
  || value === null
  || value === ''
  || (Array.isArray(value) && value.length === 0)

const cloneValue = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

const createTableResultLike = (rows: Array<Record<string, unknown>>) => ({
  kind: 'table' as const,
  payload: rows,
})

const extractRowsFromInput = (value: unknown) => {
  if (isNodeResult(value) && value.kind === 'table' && Array.isArray(value.payload)) {
    return value.payload as Array<Record<string, unknown>>
  }

  return null
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const manualJsonImportDefinition: InspectionNodeDefinition = {
  name: 'manual-json-import',
  displayName: '手动输入数据',
  category: 'trigger',
  properties: [
    {
      name: 'jsonData',
      displayName: 'JSON 数据内容',
      required: true,
      type: 'json',
    },
  ],
  execute: (_input, config) => {
    const rawData = config.jsonData
    if (typeof rawData !== 'string' || !rawData.trim()) {
      throw new Error('请输入 JSON 数据内容')
    }

    const parsedData = JSON.parse(rawData)
    const rows = Array.isArray(parsedData) ? parsedData : [parsedData]
    if (!rows.every((row) => isPlainObject(row))) {
      throw new Error('JSON 数据必须是对象数组')
    }

    return createTableResultLike(rows)
  },
}

const fieldSelectionDefinition: InspectionNodeDefinition = {
  name: 'field-selection',
  displayName: '字段选择',
  category: 'action',
  properties: [],
  execute: (input, config) => {
    const rows = extractRowsFromInput(input)
    if (!rows) throw new Error('输入数据格式不正确')

    const selectedFields = Array.isArray(config.fields)
      ? config.fields.filter((field): field is string => typeof field === 'string')
      : []
    const mode = config.mode === 'exclude' ? 'exclude' : 'include'

    const outputRows = rows.map((row) => {
      const nextRow: Record<string, unknown> = {}
      Object.keys(row).forEach((field) => {
        const selected = selectedFields.includes(field)
        if ((mode === 'include' && selected) || (mode === 'exclude' && !selected)) {
          nextRow[field] = row[field]
        }
      })
      return nextRow
    })

    return createTableResultLike(outputRows)
  },
}

const dataFilterDefinition: InspectionNodeDefinition = {
  name: 'data-filter',
  displayName: '数据筛选',
  category: 'action',
  properties: [],
  execute: (input, config) => {
    const rows = extractRowsFromInput(input)
    if (!rows) throw new Error('输入数据格式不正确')

    const conditions = Array.isArray(config.conditions)
      ? config.conditions.filter((item): item is Record<string, unknown> => isPlainObject(item))
      : []
    const matchMode = config.matchMode === 'any' ? 'any' : 'all'

    const toNumber = (value: unknown) => {
      if (typeof value === 'number' && Number.isFinite(value)) return value
      if (typeof value === 'string' && value.trim()) {
        const parsed = Number(value)
        return Number.isFinite(parsed) ? parsed : null
      }
      return null
    }

    const filteredRows = rows.filter((row) => {
      const results = conditions.map((condition) => {
        const field = typeof condition.field === 'string' ? condition.field : ''
        const operator = typeof condition.operator === 'string' ? condition.operator : 'equals'
        const expectedValue = condition.value
        const rowValue = row[field]

        if (!field) return true
        if (operator === 'contains') return String(rowValue ?? '').includes(String(expectedValue ?? ''))
        if (operator === 'equals') return rowValue === expectedValue
        if (operator === 'not_equals') return rowValue !== expectedValue
        if (operator === 'is_empty') return rowValue === null || rowValue === undefined || rowValue === ''
        if (operator === 'not_empty') return !(rowValue === null || rowValue === undefined || rowValue === '')

        const left = toNumber(rowValue)
        const right = toNumber(expectedValue)
        if (left === null || right === null) return false
        if (operator === 'gt') return left > right
        if (operator === 'gte') return left >= right
        if (operator === 'lt') return left < right
        if (operator === 'lte') return left <= right

        return false
      })

      return matchMode === 'any' ? results.some(Boolean) : results.every(Boolean)
    })

    return createTableResultLike(filteredRows)
  },
}

const sortDefinition: InspectionNodeDefinition = {
  name: 'sort',
  displayName: '排序',
  category: 'action',
  properties: [],
  execute: (input, config) => {
    const rows = extractRowsFromInput(input)
    if (!rows) throw new Error('输入数据格式不正确')

    const sortRules = Array.isArray(config.sortRules)
      ? config.sortRules.filter((rule): rule is Record<string, unknown> => isPlainObject(rule))
      : []

    const toNumber = (value: unknown) => {
      if (typeof value === 'number' && Number.isFinite(value)) return value
      if (typeof value === 'string' && value.trim()) {
        const parsed = Number(value)
        return Number.isFinite(parsed) ? parsed : null
      }
      return null
    }

    const outputRows = [...rows].sort((left, right) => {
      for (const rule of sortRules) {
        const field = typeof rule.field === 'string' ? rule.field : ''
        if (!field) continue
        const direction = rule.direction === 'desc' ? 'desc' : 'asc'
        const leftValue = left[field]
        const rightValue = right[field]
        const leftNumber = toNumber(leftValue)
        const rightNumber = toNumber(rightValue)
        let result = 0

        if (leftNumber !== null && rightNumber !== null) {
          result = leftNumber - rightNumber
        } else {
          result = String(leftValue ?? '').localeCompare(String(rightValue ?? ''), 'zh-CN')
        }

        if (result !== 0) {
          return direction === 'desc' ? -result : result
        }
      }

      return 0
    })

    return createTableResultLike(outputRows)
  },
}

const dataLimitDefinition: InspectionNodeDefinition = {
  name: 'data-limit',
  displayName: '数据量限制',
  category: 'action',
  properties: [],
  execute: (input, config) => {
    const rows = extractRowsFromInput(input)
    if (!rows) throw new Error('输入数据格式不正确')

    const limit = Math.max(0, Math.floor(Number(config.limit ?? 100)))
    const mode = config.mode === 'tail' ? 'tail' : 'head'

    return createTableResultLike(mode === 'tail' ? rows.slice(-limit) : rows.slice(0, limit))
  },
}

const jsTransformDefinition: InspectionNodeDefinition = {
  name: 'js-transform',
  displayName: 'JS代码执行',
  category: 'action',
  properties: [],
  execute: (input, config) => {
    const rows = extractRowsFromInput(input)
    if (!rows) throw new Error('JS代码执行节点只支持表格数据输入')

    const code = typeof config.code === 'string' ? config.code : ''
    if (!code.trim()) {
      throw new Error('请输入 JS 转换代码')
    }

    const runner = new Function('rows', code) as (rows: Array<Record<string, unknown>>) => unknown
    const result = runner(rows)
    if (!Array.isArray(result) || !result.every((row) => isPlainObject(row))) {
      throw new Error('JS代码执行节点必须返回数组对象列表')
    }

    return createTableResultLike(result)
  },
}

const INSPECTABLE_NODE_DEFINITIONS = new Map<string, InspectionNodeDefinition>([
  [manualJsonImportDefinition.name, manualJsonImportDefinition],
  [fieldSelectionDefinition.name, fieldSelectionDefinition],
  [dataFilterDefinition.name, dataFilterDefinition],
  [sortDefinition.name, sortDefinition],
  [dataLimitDefinition.name, dataLimitDefinition],
  [jsTransformDefinition.name, jsTransformDefinition],
])

const getSnapshotNodes = (request: WorkflowAiPlanRequest, draft?: AiDraftGraph): ExecutableWorkflowSnapshot => {
  if (draft) {
    const materialized = materializeDraftGraphToWorkflowSnapshot(draft, request.workflowSnapshot)
    return {
      name: materialized.name,
      nodes: materialized.nodes,
      edges: materialized.edges,
    }
  }

  return {
    name: request.workflowSnapshot?.name,
    nodes: Array.isArray(request.workflowSnapshot?.nodes)
      ? cloneValue(request.workflowSnapshot.nodes as WorkflowAiSnapshotNode[])
      : [],
    edges: Array.isArray(request.workflowSnapshot?.edges)
      ? cloneValue(request.workflowSnapshot.edges as WorkflowAiSnapshotEdge[])
      : [],
  }
}

const getTargetNodeIds = (
  snapshot: ExecutableWorkflowSnapshot,
  targetNodeRefs?: string[],
) => {
  if (targetNodeRefs?.length) return targetNodeRefs

  const incomingTargets = new Set(snapshot.edges.map((edge) => edge.target))
  return snapshot.nodes
    .map((node) => node.id)
    .filter((nodeId) => !incomingTargets.has(nodeId))
}

const findNode = (snapshot: ExecutableWorkflowSnapshot, nodeId: string) =>
  snapshot.nodes.find((node) => node.id === nodeId)

const getIncomingEdges = (snapshot: ExecutableWorkflowSnapshot, nodeId: string) =>
  snapshot.edges.filter((edge) => edge.target === nodeId)

const getNodeLabel = (node: WorkflowAiSnapshotNode) => node.label ?? node.type ?? node.id
const getInspectableNodeDefinition = (nodeType?: string | null) =>
  nodeType ? INSPECTABLE_NODE_DEFINITIONS.get(nodeType) ?? null : null

const validateRuntimeInputs = (
  definition: InspectionNodeDefinition,
  config: Record<string, unknown>,
): string | null => {
  const visibleRuntimeProperties = definition.properties.filter(
    (property) => property.isRuntimeInput && (!property.displayIf || property.displayIf(config)),
  )

  for (const property of visibleRuntimeProperties) {
    if (!property.required) continue
    if (UNSUPPORTED_RUNTIME_INPUT_TYPES.has(property.type)) {
      return `节点 ${definition.displayName} 依赖浏览器文件输入，服务端无法无副作用重放`
    }
    if (isMissingValue(config[property.name])) {
      return `节点 ${definition.displayName} 缺少运行时输入：${property.displayName}`
    }
  }

  return null
}

const resolveInspectionTargetRefs = (
  snapshot: ExecutableWorkflowSnapshot,
  nodeIds: string[],
  includeTerminalNodes: boolean,
) => {
  if (includeTerminalNodes) return nodeIds

  const resolvedRefs = new Set<string>()

  const walkUpstream = (nodeId: string) => {
    const node = findNode(snapshot, nodeId)
    if (!node) return
    const definition = getInspectableNodeDefinition(node.type)
    if (!definition) return

    if (definition.category !== 'terminal') {
      resolvedRefs.add(nodeId)
      return
    }

    getIncomingEdges(snapshot, nodeId).forEach((edge) => walkUpstream(edge.source))
  }

  nodeIds.forEach((nodeId) => walkUpstream(nodeId))
  return [...resolvedRefs]
}

const executeNodeForInspection = async (
  snapshot: ExecutableWorkflowSnapshot,
  nodeId: string,
  sourceKind: Extract<InspectionSourceKind, 'canvas-ephemeral-run' | 'draft-ephemeral-run'>,
  cache = new Map<string, ExecutedInspectionResult>(),
): Promise<ExecutedInspectionResult> => {
  const cached = cache.get(nodeId)
  if (cached) return cached

  const node = findNode(snapshot, nodeId)
  if (!node || !node.type) {
    const missingResult: ExecutedInspectionResult = {
      ok: false,
      message: '未找到待执行节点',
      nodeId,
      nodeLabel: nodeId,
    }
    cache.set(nodeId, missingResult)
    return missingResult
  }

  if (node.output && isNodeResult(node.output)) {
    const cachedResult: ExecutedInspectionResult = {
      ok: true,
      value: normalizeNodeResult(node.output),
      sourceKind: 'canvas-cache',
      nodeId: node.id,
      nodeLabel: getNodeLabel(node),
    }
    cache.set(nodeId, cachedResult)
    return cachedResult
  }

  const definition = getInspectableNodeDefinition(node.type)
  if (!definition) {
    const unsupportedResult: ExecutedInspectionResult = {
      ok: false,
      message: `节点 ${getNodeLabel(node)} 当前不支持服务端无副作用摘要执行`,
      nodeId: node.id,
      nodeLabel: getNodeLabel(node),
    }
    cache.set(nodeId, unsupportedResult)
    return unsupportedResult
  }

  const normalizedConfig = cloneValue(node.config ?? {})
  const runtimeInputIssue = validateRuntimeInputs(definition, normalizedConfig)
  if (runtimeInputIssue) {
    const invalidResult: ExecutedInspectionResult = {
      ok: false,
      message: runtimeInputIssue,
      nodeId: node.id,
      nodeLabel: getNodeLabel(node),
    }
    cache.set(nodeId, invalidResult)
    return invalidResult
  }

  const incomingEdges = getIncomingEdges(snapshot, node.id)
  const structuredInputs: Array<{
    sourceNodeId: string
    sourceNodeLabel: string
    edgeId?: string
    order?: number
    result: unknown
  }> = []
  const inputValues: unknown[] = []

  for (const [index, edge] of incomingEdges.entries()) {
    const upstreamResult = await executeNodeForInspection(snapshot, edge.source, sourceKind, cache)
    if (!upstreamResult.ok) {
      const blockedResult: ExecutedInspectionResult = {
        ok: false,
        message: upstreamResult.message,
        nodeId: node.id,
        nodeLabel: getNodeLabel(node),
      }
      cache.set(nodeId, blockedResult)
      return blockedResult
    }

    const normalizedUpstreamResult = isNodeResult(upstreamResult.value)
      ? normalizeNodeResult(upstreamResult.value)
      : upstreamResult.value
    inputValues.push(normalizedUpstreamResult)
    structuredInputs.push({
      sourceNodeId: edge.source,
      sourceNodeLabel: upstreamResult.nodeLabel,
      edgeId: edge.id,
      order: index,
      result: normalizedUpstreamResult,
    })
  }

  const executionInput =
    (definition.inputMode ?? 'single') === 'multiple'
      ? { inputs: structuredInputs }
      : inputValues[0] ?? null

  try {
    const executed = await definition.execute(executionInput, normalizedConfig)
    const resultValue = isNodeResult(executed) ? normalizeNodeResult(executed) : executed
    const successResult: ExecutedInspectionResult = {
      ok: true,
      value: resultValue,
      sourceKind,
      nodeId: node.id,
      nodeLabel: getNodeLabel(node),
    }
    cache.set(nodeId, successResult)
    return successResult
  } catch (error) {
    const failedResult: ExecutedInspectionResult = {
      ok: false,
      message: error instanceof Error ? error.message : '节点执行失败',
      nodeId: node.id,
      nodeLabel: getNodeLabel(node),
    }
    cache.set(nodeId, failedResult)
    return failedResult
  }
}

export const inspectWorkflowNodeResults = async (
  request: WorkflowAiPlanRequest,
  options?: {
    draft?: AiDraftGraph
    targetNodeRefs?: string[]
    includeTerminalNodes?: boolean
  },
) => {
  const snapshot = getSnapshotNodes(request, options?.draft)
  const preferredNodeIds = getTargetNodeIds(snapshot, options?.targetNodeRefs)
  const targetNodeIds = resolveInspectionTargetRefs(
    snapshot,
    preferredNodeIds,
    options?.includeTerminalNodes ?? false,
  )
  const sourceKind: Extract<InspectionSourceKind, 'canvas-ephemeral-run' | 'draft-ephemeral-run'> =
    options?.draft ? 'draft-ephemeral-run' : 'canvas-ephemeral-run'

  return Promise.all(
    targetNodeIds.map((nodeId) => executeNodeForInspection(snapshot, nodeId, sourceKind)),
  )
}
