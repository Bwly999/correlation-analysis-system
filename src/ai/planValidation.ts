import type {
  WorkflowAiGenerationIssue,
  WorkflowAiNodeCatalogItem,
  WorkflowAiOperation,
  WorkflowAiPlan,
  WorkflowAiPlanValidationResult,
} from './types.js'

type ValidationNodeState = {
  refId: string
  nodeType: string
  category: string
  inputMode: 'single' | 'multiple'
  maxInputs: number | null
  config: Record<string, unknown>
  catalogItem: WorkflowAiNodeCatalogItem
}

type ValidationEdgeState = {
  id: string
  sourceRef: string
  targetRef: string
}

type ExistingNodeLike = {
  id: string
  type: string
  config?: Record<string, unknown>
}

type ExistingEdgeLike = {
  id?: string
  source: string
  target: string
}

export interface WorkflowAiPlanValidationContext {
  nodeCatalog: WorkflowAiNodeCatalogItem[]
  existingNodes?: ExistingNodeLike[]
  existingEdges?: ExistingEdgeLike[]
  skipRequiredConfig?: boolean
}

const normalizeConfigValue = (value: unknown) =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}

const pushIssue = (
  issues: WorkflowAiGenerationIssue[],
  operationId: string,
  message: string,
) => {
  issues.push({
    stage: 'validate',
    operationId,
    message,
  })
}

const buildDefaultConfig = (catalogItem: WorkflowAiNodeCatalogItem) =>
  Object.fromEntries(
    catalogItem.properties.map((property: WorkflowAiNodeCatalogItem['properties'][number]) => [
      property.name,
      property.defaultValue ?? null,
    ]),
  )

const validateConfigKeys = (
  issues: WorkflowAiGenerationIssue[],
  operationId: string,
  catalogItem: WorkflowAiNodeCatalogItem,
  config: Record<string, unknown>,
) => {
  const knownKeys = new Set(
    catalogItem.properties.map((property: WorkflowAiNodeCatalogItem['properties'][number]) => property.name),
  )
  Object.keys(config).forEach((key) => {
    if (!knownKeys.has(key)) {
      pushIssue(issues, operationId, `节点 ${catalogItem.displayName} 包含未定义配置项: ${key}`)
    }
  })
}

const validateRequiredProperties = (
  issues: WorkflowAiGenerationIssue[],
  operationId: string,
  catalogItem: WorkflowAiNodeCatalogItem,
  config: Record<string, unknown>,
) => {
  catalogItem.properties.forEach((property: WorkflowAiNodeCatalogItem['properties'][number]) => {
    if (!property.required || property.isRuntimeInput) return
    const value = config[property.name]
    const isMissing =
      value === undefined ||
      value === null ||
      (typeof value === 'string' && value.trim().length === 0) ||
      (Array.isArray(value) && value.length === 0)

    if (isMissing) {
      pushIssue(issues, operationId, `节点 ${catalogItem.displayName} 缺少必填配置: ${property.displayName}`)
    }
  })
}

const createNodeState = (
  refId: string,
  catalogItem: WorkflowAiNodeCatalogItem,
  config: Record<string, unknown>,
): ValidationNodeState => ({
  refId,
  nodeType: catalogItem.name,
  category: catalogItem.category,
  inputMode: catalogItem.inputMode,
  maxInputs: catalogItem.maxInputs,
  config,
  catalogItem,
})

export const validateWorkflowAiPlanAgainstContext = (
  plan: WorkflowAiPlan,
  context: WorkflowAiPlanValidationContext,
): WorkflowAiPlanValidationResult => {
  const issues: WorkflowAiGenerationIssue[] = []
  const touchedNodeRefs = new Set<string>()
  const catalogByName = new Map(context.nodeCatalog.map((item) => [item.name, item]))
  const nodes = new Map<string, ValidationNodeState>()
  const edges: ValidationEdgeState[] = []

  context.existingNodes?.forEach((node) => {
    const catalogItem = catalogByName.get(node.type)
    if (!catalogItem) return
    const config = {
      ...buildDefaultConfig(catalogItem),
      ...normalizeConfigValue(node.config),
    }
    nodes.set(node.id, createNodeState(node.id, catalogItem, config))
  })

  context.existingEdges?.forEach((edge, index) => {
    edges.push({
      id: edge.id ?? `existing_edge_${index + 1}`,
      sourceRef: edge.source,
      targetRef: edge.target,
    })
  })

  if (plan.operations.length === 0 && !(plan.questions?.length || plan.warnings?.length)) {
    pushIssue(issues, 'plan', '空计划缺少追问信息或风险提示')
  }

  const getNodeState = (refId: string) => nodes.get(refId)

  plan.operations.forEach((operation: WorkflowAiOperation, index: number) => {
    const operationId = operation.id || `op_${index + 1}`

    if (operation.type === 'createNode') {
      const catalogItem = catalogByName.get(operation.nodeType)
      if (!catalogItem) {
        pushIssue(issues, operationId, `未找到节点定义: ${operation.nodeType}`)
        return
      }

      const config = {
        ...buildDefaultConfig(catalogItem),
        ...normalizeConfigValue(operation.config),
      }
      validateConfigKeys(issues, operationId, catalogItem, normalizeConfigValue(operation.config))
      nodes.set(operation.id, createNodeState(operation.id, catalogItem, config))
      touchedNodeRefs.add(operation.id)
      return
    }

    if (operation.type === 'updateNodeConfig') {
      const targetNode = getNodeState(operation.nodeRef)
      if (!targetNode) {
        pushIssue(issues, operationId, '操作引用了不存在的节点')
        return
      }
      const nextConfig = {
        ...targetNode.config,
        ...normalizeConfigValue(operation.config),
      }
      validateConfigKeys(issues, operationId, targetNode.catalogItem, normalizeConfigValue(operation.config))
      nodes.set(operation.nodeRef, {
        ...targetNode,
        config: nextConfig,
      })
      touchedNodeRefs.add(operation.nodeRef)
      return
    }

    if (operation.type === 'renameNode' || operation.type === 'moveNode' || operation.type === 'removeNode') {
      if (!getNodeState(operation.nodeRef)) {
        pushIssue(issues, operationId, '操作引用了不存在的节点')
        return
      }

      if (operation.type === 'removeNode') {
        nodes.delete(operation.nodeRef)
        for (let edgeIndex = edges.length - 1; edgeIndex >= 0; edgeIndex -= 1) {
          if (edges[edgeIndex]?.sourceRef === operation.nodeRef || edges[edgeIndex]?.targetRef === operation.nodeRef) {
            edges.splice(edgeIndex, 1)
          }
        }
      }
      return
    }

    if (operation.type === 'disconnectEdge') {
      const edgeIndex = edges.findIndex((edge) => edge.id === operation.edgeRef)
      if (edgeIndex < 0) {
        pushIssue(issues, operationId, '操作引用了不存在的连线')
        return
      }
      edges.splice(edgeIndex, 1)
      return
    }

    if (operation.type === 'connectNodes') {
      const sourceNode = getNodeState(operation.sourceRef)
      const targetNode = getNodeState(operation.targetRef)

      if (!sourceNode || !targetNode) {
        pushIssue(issues, operationId, '连接引用了不存在的节点')
        return
      }

      if (!sourceNode.catalogItem.allowedNextCategories.includes(targetNode.category)) {
        pushIssue(
          issues,
          operationId,
          `连接规则不合法: ${sourceNode.catalogItem.displayName} 不能连接到 ${targetNode.catalogItem.displayName}`,
        )
        return
      }

      if (targetNode.maxInputs !== null) {
        const incomingCount = edges.filter((edge) => edge.targetRef === operation.targetRef).length
        if (incomingCount + 1 > targetNode.maxInputs) {
          pushIssue(issues, operationId, `节点 ${targetNode.catalogItem.displayName} 超出输入数量限制`)
          return
        }
      }

      edges.push({
        id: operation.id,
        sourceRef: operation.sourceRef,
        targetRef: operation.targetRef,
      })
    }
  })

  if (!context.skipRequiredConfig) {
    touchedNodeRefs.forEach((nodeRef) => {
      const node = nodes.get(nodeRef)
      if (!node) return
      validateRequiredProperties(issues, nodeRef, node.catalogItem, node.config)
    })
  }

  return {
    valid: issues.length === 0,
    issues,
  }
}
