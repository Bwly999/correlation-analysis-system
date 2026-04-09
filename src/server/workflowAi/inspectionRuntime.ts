import { isNodeResult, normalizeNodeResult } from '../../nodes/result.js'
import {
  materializeDraftGraphToWorkflowSnapshot,
  type WorkflowAiSnapshotEdge,
  type WorkflowAiSnapshotNode,
} from '../../ai/draft/graph.js'
import type { AiDraftGraph } from '../../ai/draft/types.js'
import type { WorkflowAiPlanRequest } from '../../ai/types.js'
import { INSPECTABLE_NODE_DEFINITIONS } from './inspectionRuntimeShared.js'
import type { InspectionNodeDefinition } from './inspectionRuntimeShared.js'

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

const UNSUPPORTED_RUNTIME_INPUT_TYPES = new Set(['file'])

const isMissingValue = (value: unknown) =>
  value === undefined
  || value === null
  || value === ''
  || (Array.isArray(value) && value.length === 0)

const cloneValue = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

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
