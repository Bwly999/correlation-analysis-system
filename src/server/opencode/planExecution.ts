import type {
  AgentExecutionFinalResult,
  AgentExecutionRecord,
  WorkflowAiDataSourceDescriptor,
  WorkflowAiPlan,
  WorkflowAiPlanRequest,
} from '../../ai/types.js'
import { validateWorkflowAiPlanAgainstContext } from '../../ai/planValidation.js'
import { buildServerWorkflowAiValidationCatalog } from '../workflowAi/nodeCatalog.js'
import { createAgentExecutionRecord } from './agentSessionStore.js'
import { executeNodesForAgent } from '../workflowExecution/nodeExecutor.js'

const cloneValue = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

const buildBoundPlan = (
  plan: WorkflowAiPlan,
  dataSources: WorkflowAiDataSourceDescriptor[],
  bindings: Record<string, string>,
) => {
  const dataSourceMap = new Map(dataSources.map((item) => [item.id, item]))

  return {
    ...plan,
    operations: plan.operations.map((operation) => {
      if (operation.type !== 'createNode') return operation
      const dataSourceId = bindings[operation.id]
      if (!dataSourceId) return operation

      const dataSource = dataSourceMap.get(dataSourceId)
      if (!dataSource) {
        throw new Error(`未找到数据源 ${dataSourceId}`)
      }

      if (operation.nodeType !== dataSource.entryNodeType) {
        throw new Error(`节点 ${operation.id} 与数据源 ${dataSourceId} 的入口类型不匹配`)
      }

      const bindingPayload = cloneValue(dataSource.bindingPayload)
      if (
        operation.nodeType === 'file-import'
        && bindingPayload
        && typeof bindingPayload === 'object'
        && Array.isArray((bindingPayload as Record<string, unknown>).rows)
      ) {
        const rows = (bindingPayload as Record<string, unknown>).rows as Array<Record<string, unknown>>
        const format = String((bindingPayload as Record<string, unknown>).format ?? 'json')

        return {
          ...operation,
          nodeType: 'manual-json-import' as const,
          config: {
            jsonData: JSON.stringify(rows),
            autoClean: true,
            sourceFormat: format,
            __dataSourceId: dataSource.id,
          },
        }
      }

      return {
        ...operation,
        config: {
          ...(operation.config ?? {}),
          ...bindingPayload,
          __dataSourceId: dataSource.id,
        },
      }
    }),
  }
}

const resolveTerminalNodeIds = (plan: WorkflowAiPlan) => {
  const createdNodes = plan.operations.filter((operation) => operation.type === 'createNode')
  const targetIds = new Set(
    plan.operations
      .filter((operation) => operation.type === 'connectNodes')
      .map((operation) => operation.sourceRef),
  )

  return createdNodes
    .filter((operation) => !targetIds.has(operation.id))
    .map((operation) => operation.id)
}

const buildFinalResults = (
  plan: WorkflowAiPlan,
  executionResults: Awaited<ReturnType<typeof executeNodesForAgent>>,
): AgentExecutionFinalResult[] => {
  const nodeMap = new Map(
    plan.operations
      .filter((operation) => operation.type === 'createNode')
      .map((operation) => [operation.id, operation]),
  )
  const terminalIds = new Set(resolveTerminalNodeIds(plan))

  return executionResults
    .filter((result) => result.success && result.result && terminalIds.has(result.nodeId))
    .map((result) => ({
      nodeId: result.nodeId,
      nodeLabel: nodeMap.get(result.nodeId)?.nodeLabel ?? result.nodeLabel,
      resultKind: result.resultKind ?? 'unknown',
      result: result.result,
    }))
}

export const executeWorkflowPlanForSession = async (input: {
  sessionId: string
  request: WorkflowAiPlanRequest
  plan: WorkflowAiPlan
  bindings: Record<string, string>
}): Promise<AgentExecutionRecord> => {
  const dataSources = input.request.dataSources ?? []
  const boundPlan = buildBoundPlan(input.plan, dataSources, input.bindings)
  const requestedNodeTypes = boundPlan.operations
    .filter((operation): operation is Extract<WorkflowAiPlan['operations'][number], { type: 'createNode' }> => operation.type === 'createNode')
    .map((operation) => operation.nodeType)
  const validationCatalog = [
    ...input.request.nodeCatalog,
    ...buildServerWorkflowAiValidationCatalog(requestedNodeTypes)
      .filter((item) => !input.request.nodeCatalog.some((catalogItem) => catalogItem.name === item.name)),
  ]
  const validation = validateWorkflowAiPlanAgainstContext(input.plan, {
    nodeCatalog: validationCatalog,
    existingNodes: [],
    existingEdges: [],
  })

  if (!validation.valid) {
    throw new Error(`工作流计划校验失败：${validation.issues.map((issue) => issue.message).join('；')}`)
  }

  const nodeResults = await executeNodesForAgent(
    boundPlan,
    {
      ...input.request,
      workflowSnapshot: {
        name: boundPlan.summary,
        nodes: [],
        edges: [],
      },
    },
    () => undefined,
  )

  const failedNode = nodeResults.find((result) => !result.success)
  const finalResults = buildFinalResults(boundPlan, nodeResults)
  const record = createAgentExecutionRecord(input.sessionId, {
    planSummary: boundPlan.summary,
    status: failedNode ? 'failed' : 'completed',
    bindings: input.bindings,
    nodeResults,
    finalResults,
    ...(failedNode?.error ? { error: failedNode.error } : {}),
  })

  if (!record) {
    throw new Error('执行记录写入失败')
  }

  return record
}
