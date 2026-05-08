import type { WorkflowAiOperation } from '../../../ai/types.js'

export type RepairPlanInput = {
  failedNodeId: string
  nodeType: string
  error: string
  upstreamTrace?: unknown[]
}

export type AgenticRepairPlan = {
  summary: string
  operations: WorkflowAiOperation[]
  confidence: 'low' | 'medium' | 'high'
  requiresUserConfirmation: boolean
}

const missingRequiredFieldPattern = /缺少必填字段\s+([a-zA-Z0-9_.-]+)/

export const isHighRiskRepairOperation = (operation: WorkflowAiOperation) =>
  operation.type === 'removeNode' || operation.type === 'disconnectEdge'

const buildMissingFieldRepair = (input: RepairPlanInput, fieldName: string): AgenticRepairPlan => {
  const operations: WorkflowAiOperation[] = [
    {
      id: `repair_${input.failedNodeId}_${fieldName}`,
      type: 'updateNodeConfig',
      nodeRef: input.failedNodeId,
      config: {
        [fieldName]: '',
      },
    },
  ]

  return {
    summary: `尝试补齐节点 ${input.failedNodeId} 的缺失配置`,
    operations,
    confidence: 'medium',
    requiresUserConfirmation: operations.some(isHighRiskRepairOperation),
  }
}

export const createRepairPlan = (input: RepairPlanInput): AgenticRepairPlan => {
  const missingField = input.error.match(missingRequiredFieldPattern)?.[1]
  if (missingField) {
    return buildMissingFieldRepair(input, missingField)
  }

  return {
    summary: `暂无法自动修复节点 ${input.failedNodeId} 的执行问题`,
    operations: [],
    confidence: 'low',
    requiresUserConfirmation: true,
  }
}
