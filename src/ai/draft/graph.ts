import type { WorkflowAiGenerationIssue, WorkflowAiOperation, WorkflowAiPlan } from '../types.js'
import type {
  AiDraftEdge,
  AiDraftGraph,
  AiDraftMutation,
  AiDraftNode,
  FinalizedDraftOperation,
} from './types.js'

const clonePosition = (value?: { x: number; y: number }) => (value ? { ...value } : undefined)

const cloneConfig = (value?: Record<string, unknown>) => ({ ...(value ?? {}) })
const hasConfigEntries = (value: Record<string, unknown>) => Object.keys(value).length > 0

const isSamePosition = (
  left?: { x: number; y: number },
  right?: { x: number; y: number },
) => left?.x === right?.x && left?.y === right?.y

const isSameConfig = (left: Record<string, unknown>, right: Record<string, unknown>) =>
  JSON.stringify(left) === JSON.stringify(right)

const REQUIRED_CONFIG_ISSUE_PATTERN = /^节点 (.+) 缺少必填配置: (.+)$/

export type WorkflowAiSnapshotNode = {
  id: string
  label?: string
  type?: string
  category?: string
  position?: { x: number; y: number }
  config?: Record<string, unknown>
  output?: unknown
}

export type WorkflowAiSnapshotEdge = {
  id?: string
  source: string
  target: string
  sourceHandle?: string | null
  targetHandle?: string | null
}

const ensureDraftNode = (
  draftNodes: Map<string, AiDraftNode>,
  nodeRef: string,
): AiDraftNode => {
  const existing = draftNodes.get(nodeRef)
  if (existing) {
    return existing
  }

  const placeholder: AiDraftNode = {
    ref: nodeRef,
    source: 'existing',
    nodeType: 'unknown',
    label: nodeRef,
    config: {},
    hasExplicitConfig: false,
    status: 'clean',
    originalLabel: nodeRef,
    originalConfig: {},
  }
  draftNodes.set(nodeRef, placeholder)
  return placeholder
}

export const createDraftGraphFromPlan = (plan: WorkflowAiPlan): AiDraftGraph => {
  const draftNodes = new Map<string, AiDraftNode>()
  const draftEdges = new Map<string, AiDraftEdge>()

  plan.operations.forEach((operation: WorkflowAiOperation) => {
    if (operation.type === 'createNode') {
      draftNodes.set(operation.id, {
        ref: operation.id,
        source: 'draft',
        nodeType: operation.nodeType,
        label: operation.nodeLabel ?? operation.nodeType,
        position: clonePosition(operation.position),
        config: cloneConfig(operation.config),
        hasExplicitConfig: operation.config !== undefined,
        status: 'added',
      })
      return
    }

    if (operation.type === 'updateNodeConfig') {
      const targetNode = ensureDraftNode(draftNodes, operation.nodeRef)
      targetNode.config = {
        ...targetNode.config,
        ...cloneConfig(operation.config),
      }
      if (targetNode.source === 'existing' && targetNode.status === 'clean') {
        targetNode.status = 'updated'
      }
      return
    }

    if (operation.type === 'renameNode') {
      const targetNode = ensureDraftNode(draftNodes, operation.nodeRef)
      targetNode.label = operation.label
      if (targetNode.source === 'existing' && targetNode.status === 'clean') {
        targetNode.status = 'updated'
      }
      return
    }

    if (operation.type === 'moveNode') {
      const targetNode = ensureDraftNode(draftNodes, operation.nodeRef)
      targetNode.position = clonePosition(operation.position)
      if (targetNode.source === 'existing' && targetNode.status === 'clean') {
        targetNode.status = 'updated'
      }
      return
    }

    if (operation.type === 'removeNode') {
      const targetNode = ensureDraftNode(draftNodes, operation.nodeRef)
      targetNode.status = 'removed'
      return
    }

    if (operation.type === 'connectNodes') {
      draftEdges.set(operation.id, {
        ref: operation.id,
        sourceRef: operation.sourceRef,
        targetRef: operation.targetRef,
        sourceHandle: operation.sourceHandle,
        targetHandle: operation.targetHandle,
        status: 'added',
      })
      return
    }

    if (operation.type === 'disconnectEdge') {
      const existing = draftEdges.get(operation.edgeRef)
      if (existing) {
        existing.status = 'removed'
      } else {
        draftEdges.set(operation.edgeRef, {
          ref: operation.edgeRef,
          sourceRef: '',
          targetRef: '',
          status: 'removed',
        })
      }
    }
  })

  return {
    summary: plan.summary,
    assumptions: [...plan.assumptions],
    warnings: [...plan.warnings],
    questions: [...(plan.questions ?? [])],
    nodes: [...draftNodes.values()],
    edges: [...draftEdges.values()],
  }
}

export const createEmptyDraftGraph = (summary = ''): AiDraftGraph => ({
  summary,
  assumptions: [],
  warnings: [],
  questions: [],
  nodes: [],
  edges: [],
})

export const createDraftGraphFromWorkflowSnapshot = (snapshot?: {
  nodes?: unknown[]
  edges?: unknown[]
}): AiDraftGraph => {
  if (!snapshot) {
    return createEmptyDraftGraph()
  }

  const nodes = Array.isArray(snapshot.nodes) ? (snapshot.nodes as WorkflowAiSnapshotNode[]) : []
  const edges = Array.isArray(snapshot.edges) ? (snapshot.edges as WorkflowAiSnapshotEdge[]) : []

  return {
    summary: '',
    assumptions: [],
    warnings: [],
    questions: [],
    nodes: nodes.map((node) => ({
      ref: node.id,
      source: 'existing',
      nodeType: node.type ?? 'unknown',
      label: node.label ?? node.type ?? node.id,
      position: clonePosition(node.position),
      config: cloneConfig(node.config),
      hasExplicitConfig: Object.keys(node.config ?? {}).length > 0,
      status: 'clean',
      originalLabel: node.label ?? node.type ?? node.id,
      originalPosition: clonePosition(node.position),
      originalConfig: cloneConfig(node.config),
    })),
    edges: edges.map((edge) => ({
      ref: edge.id ?? `existing:${edge.source}:${edge.target}`,
      sourceRef: edge.source,
      targetRef: edge.target,
      sourceHandle: edge.sourceHandle ?? undefined,
      targetHandle: edge.targetHandle ?? undefined,
      status: 'clean',
    })),
  }
}

export const finalizeDraftGraphToPlan = (draft: AiDraftGraph): WorkflowAiPlan => {
  const operations: FinalizedDraftOperation[] = []

  draft.nodes
    .filter((node) => node.source === 'existing' && node.status === 'removed')
    .forEach((node) => {
      operations.push({
        id: `remove_${node.ref}`,
        type: 'removeNode',
        nodeRef: node.ref,
      })
    })

  draft.edges
    .filter((edge) => edge.status === 'removed' && edge.sourceRef && edge.targetRef)
    .forEach((edge) => {
      operations.push({
        id: `disconnect_${edge.ref}`,
        type: 'disconnectEdge',
        edgeRef: edge.ref,
      })
    })

  draft.nodes
    .filter((node) => node.source === 'draft' && node.status !== 'removed')
    .forEach((node) => {
      const config = cloneConfig(node.config)
      operations.push({
        id: node.ref,
        type: 'createNode',
        nodeType: node.nodeType,
        nodeLabel: node.label,
        ...(node.position ? { position: clonePosition(node.position) } : {}),
        ...(node.hasExplicitConfig || hasConfigEntries(config) ? { config } : {}),
      })
    })

  draft.nodes
    .filter((node) => node.source === 'existing' && node.status === 'updated')
    .forEach((node) => {
      if (node.originalLabel !== undefined && node.label !== node.originalLabel) {
        operations.push({
          id: `rename_${node.ref}`,
          type: 'renameNode',
          nodeRef: node.ref,
          label: node.label,
        })
      }

      if (!isSameConfig(node.config, node.originalConfig ?? {})) {
        operations.push({
          id: `config_${node.ref}`,
          type: 'updateNodeConfig',
          nodeRef: node.ref,
          config: cloneConfig(node.config),
        })
      }

      if (!isSamePosition(node.position, node.originalPosition)) {
        if (node.position) {
          operations.push({
            id: `move_${node.ref}`,
            type: 'moveNode',
            nodeRef: node.ref,
            position: clonePosition(node.position)!,
          })
        }
      }
    })

  draft.edges
    .filter((edge) => edge.status === 'added')
    .forEach((edge) => {
      operations.push({
        id: edge.ref,
        type: 'connectNodes',
        sourceRef: edge.sourceRef,
        targetRef: edge.targetRef,
        ...(edge.sourceHandle ? { sourceHandle: edge.sourceHandle } : {}),
        ...(edge.targetHandle ? { targetHandle: edge.targetHandle } : {}),
      })
    })

  return {
    summary: draft.summary,
    assumptions: [...draft.assumptions],
    warnings: [...draft.warnings],
    questions: [...draft.questions],
    operations,
  }
}

const cloneDraftNode = (node: AiDraftNode): AiDraftNode => ({
  ...node,
  position: clonePosition(node.position),
  config: cloneConfig(node.config),
  originalPosition: clonePosition(node.originalPosition),
  originalConfig: cloneConfig(node.originalConfig),
})

const cloneDraftEdge = (edge: AiDraftEdge): AiDraftEdge => ({
  ...edge,
})

export const applyDraftMutations = (
  draft: AiDraftGraph,
  mutations: AiDraftMutation[],
): AiDraftGraph => {
  const nextDraft: AiDraftGraph = {
    summary: draft.summary,
    assumptions: [...draft.assumptions],
    warnings: [...draft.warnings],
    questions: [...draft.questions],
    nodes: draft.nodes.map(cloneDraftNode),
    edges: draft.edges.map(cloneDraftEdge),
  }

  const nodeMap = new Map(nextDraft.nodes.map((node) => [node.ref, node] as const))
  const edgeMap = new Map(nextDraft.edges.map((edge) => [edge.ref, edge] as const))

  mutations.forEach((mutation) => {
    if (mutation.type === 'setSummary') {
      nextDraft.summary = mutation.summary
      return
    }

    if (mutation.type === 'setAssumptions') {
      nextDraft.assumptions = [...mutation.assumptions]
      return
    }

    if (mutation.type === 'setWarnings') {
      nextDraft.warnings = [...mutation.warnings]
      return
    }

    if (mutation.type === 'setQuestions') {
      nextDraft.questions = [...mutation.questions]
      return
    }

    if (mutation.type === 'createNode') {
      const nextNode: AiDraftNode = {
        ref: mutation.ref,
        source: 'draft',
        nodeType: mutation.nodeType,
        label: mutation.label ?? mutation.nodeType,
        position: clonePosition(mutation.position),
        config: cloneConfig(mutation.config),
        hasExplicitConfig: mutation.config !== undefined,
        status: 'added',
      }
      nodeMap.set(mutation.ref, nextNode)
      return
    }

    if (mutation.type === 'updateNodeConfig') {
      const node = ensureDraftNode(nodeMap, mutation.ref)
      node.config = {
        ...node.config,
        ...cloneConfig(mutation.config),
      }
      node.hasExplicitConfig = true
      if (node.source === 'existing' && node.status === 'clean') {
        node.status = 'updated'
      }
      return
    }

    if (mutation.type === 'renameNode') {
      const node = ensureDraftNode(nodeMap, mutation.ref)
      node.label = mutation.label
      if (node.source === 'existing' && node.status === 'clean') {
        node.status = 'updated'
      }
      return
    }

    if (mutation.type === 'moveNode') {
      const node = ensureDraftNode(nodeMap, mutation.ref)
      node.position = clonePosition(mutation.position)
      if (node.source === 'existing' && node.status === 'clean') {
        node.status = 'updated'
      }
      return
    }

    if (mutation.type === 'removeNode') {
      const node = ensureDraftNode(nodeMap, mutation.ref)
      node.status = 'removed'
      return
    }

    if (mutation.type === 'connectNodes') {
      edgeMap.set(mutation.ref, {
        ref: mutation.ref,
        sourceRef: mutation.sourceRef,
        targetRef: mutation.targetRef,
        sourceHandle: mutation.sourceHandle,
        targetHandle: mutation.targetHandle,
        status: 'added',
      })
      return
    }

    if (mutation.type === 'disconnectEdge') {
      const edge = edgeMap.get(mutation.ref)
      if (edge) {
        edge.status = 'removed'
      } else {
        edgeMap.set(mutation.ref, {
          ref: mutation.ref,
          sourceRef: '',
          targetRef: '',
          status: 'removed',
        })
      }
    }
  })

  nextDraft.nodes = [...nodeMap.values()]
  nextDraft.edges = [...edgeMap.values()]
  return nextDraft
}

export const buildDraftMutationsFromPlan = (plan: WorkflowAiPlan): AiDraftMutation[] => {
  const mutations: AiDraftMutation[] = [
    {
      type: 'setSummary',
      summary: plan.summary,
    },
    {
      type: 'setAssumptions',
      assumptions: [...plan.assumptions],
    },
    {
      type: 'setWarnings',
      warnings: [...plan.warnings],
    },
    {
      type: 'setQuestions',
      questions: [...(plan.questions ?? [])],
    },
  ]

  plan.operations.forEach((operation) => {
    if (operation.type === 'createNode') {
      mutations.push({
        type: 'createNode',
        ref: operation.id,
        nodeType: operation.nodeType,
        label: operation.nodeLabel,
        position: clonePosition(operation.position),
        config: cloneConfig(operation.config),
      })
      return
    }

    if (operation.type === 'updateNodeConfig') {
      mutations.push({
        type: 'updateNodeConfig',
        ref: operation.nodeRef,
        config: cloneConfig(operation.config),
      })
      return
    }

    if (operation.type === 'renameNode') {
      mutations.push({
        type: 'renameNode',
        ref: operation.nodeRef,
        label: operation.label,
      })
      return
    }

    if (operation.type === 'moveNode') {
      mutations.push({
        type: 'moveNode',
        ref: operation.nodeRef,
        position: clonePosition(operation.position)!,
      })
      return
    }

    if (operation.type === 'removeNode') {
      mutations.push({
        type: 'removeNode',
        ref: operation.nodeRef,
      })
      return
    }

    if (operation.type === 'connectNodes') {
      mutations.push({
        type: 'connectNodes',
        ref: operation.id,
        sourceRef: operation.sourceRef,
        targetRef: operation.targetRef,
        sourceHandle: operation.sourceHandle,
        targetHandle: operation.targetHandle,
      })
      return
    }

    if (operation.type === 'disconnectEdge') {
      mutations.push({
        type: 'disconnectEdge',
        ref: operation.edgeRef,
      })
    }
  })

  return mutations
}

export const materializeDraftGraphToWorkflowSnapshot = (
  draft: AiDraftGraph,
  snapshot?: {
    name?: string
    nodes?: unknown[]
    edges?: unknown[]
  },
): {
  name: string
  nodes: WorkflowAiSnapshotNode[]
  edges: WorkflowAiSnapshotEdge[]
} => {
  const baseNodes = Array.isArray(snapshot?.nodes) ? (snapshot?.nodes as WorkflowAiSnapshotNode[]) : []
  const baseEdges = Array.isArray(snapshot?.edges) ? (snapshot?.edges as WorkflowAiSnapshotEdge[]) : []

  const nodeMap = new Map<string, WorkflowAiSnapshotNode>(
    baseNodes.map((node) => [
      node.id,
      {
        ...node,
        label: node.label ?? node.type ?? node.id,
        config: cloneConfig(node.config),
      },
    ]),
  )

  draft.nodes.forEach((node) => {
    if (node.source === 'existing') {
      if (node.status === 'removed') {
        nodeMap.delete(node.ref)
        return
      }

      const existingNode = nodeMap.get(node.ref)
      if (existingNode) {
        existingNode.label = node.label
        existingNode.type = node.nodeType
        existingNode.position = clonePosition(node.position)
        existingNode.config = cloneConfig(node.config)
      }
      return
    }

    if (node.status !== 'removed') {
      nodeMap.set(node.ref, {
        id: node.ref,
        label: node.label,
        type: node.nodeType,
        category: 'action',
        position: clonePosition(node.position) ?? { x: 0, y: 0 },
        config: cloneConfig(node.config),
      })
    }
  })

  const edgeMap = new Map<string, WorkflowAiSnapshotEdge>(
    baseEdges.map((edge) => [edge.id ?? `existing:${edge.source}:${edge.target}`, { ...edge }]),
  )

  draft.edges.forEach((edge) => {
    if (edge.status === 'removed') {
      edgeMap.delete(edge.ref)
      return
    }

    if (edge.status === 'added') {
      edgeMap.set(edge.ref, {
        id: edge.ref,
        source: edge.sourceRef,
        target: edge.targetRef,
        sourceHandle: edge.sourceHandle,
        targetHandle: edge.targetHandle,
      })
    }
  })

  return {
    name: snapshot?.name ?? '',
    nodes: [...nodeMap.values()],
    edges: [...edgeMap.values()].filter(
      (edge) => nodeMap.has(edge.source) && nodeMap.has(edge.target),
    ),
  }
}

export const buildRecoverableDraftPlanFromIssues = (
  plan: WorkflowAiPlan,
  issues: WorkflowAiGenerationIssue[],
): WorkflowAiPlan => {
  const draft = createDraftGraphFromPlan(plan)
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

  draft.warnings = [...new Set([...draft.warnings, ...extraWarnings])]
  draft.questions = [...new Set([...draft.questions, ...extraQuestions])]

  return finalizeDraftGraphToPlan(draft)
}
