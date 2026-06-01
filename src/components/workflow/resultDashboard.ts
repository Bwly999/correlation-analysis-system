import {
  getResultKindLabel,
  getResultPreviewSummary,
  normalizeWorkflowResult,
} from './resultView'
import type { WorkflowNode } from '@/utils/storage'
import type { WorkflowNodeOutput } from '@/utils/storage'

export type ResultDashboardNode = {
  nodeId: string
  label: string
  type: string
  category: 'trigger' | 'action' | 'terminal'
  isExecutionTarget: boolean
  status: WorkflowNode['data']['status']
  hasOutput: boolean
  isTerminal: boolean
  resultKind: string | null
  resultKindLabel: string
  summary: string
  error?: string
  output: WorkflowNodeOutput | null
}

export type WorkflowResultDashboardSummary = {
  workflowName: string
  status: 'success' | 'error' | 'stopped'
  startTime: number
  duration: number
  nodeCount: number
  selectedDefaultNodeIds: string[]
  nodes: ResultDashboardNode[]
  metrics: {
    outputCount: number
    errorCount: number
    terminalOutputCount: number
  }
}

const sortDashboardNodes = (nodes: ResultDashboardNode[]) =>
  [...nodes].sort((a, b) => {
    if (a.isTerminal !== b.isTerminal) return a.isTerminal ? -1 : 1
    if (a.hasOutput !== b.hasOutput) return a.hasOutput ? -1 : 1
    return a.label.localeCompare(b.label, 'zh-CN')
  })

export const toResultDashboardNode = (
  node: WorkflowNode,
  executionTargetIds: string[],
  runtimeOutput: WorkflowNodeOutput | null,
  runtimeError?: string,
): ResultDashboardNode => {
  const normalized = runtimeOutput ? normalizeWorkflowResult(runtimeOutput) : null

  return {
    nodeId: node.id,
    label: node.data.label,
    type: node.data.type,
    category: node.data.category,
    isExecutionTarget: executionTargetIds.includes(node.id),
    status: node.data.status,
    hasOutput: Boolean(normalized),
    isTerminal: node.data.category === 'terminal',
    resultKind: normalized?.kind ?? null,
    resultKindLabel: normalized ? getResultKindLabel(normalized) : '暂无结果',
    summary: normalized ? getResultPreviewSummary(normalized) : runtimeError || '本次运行未产出结果',
    error: runtimeError,
    output: runtimeOutput,
  }
}

export const getDefaultSelectedNodeIds = (nodes: ResultDashboardNode[]) => {
  const terminalOutputs = nodes.filter((node) => node.isTerminal && node.hasOutput)
  if (terminalOutputs.length > 0) return terminalOutputs.map((node) => node.nodeId)

  const executionTargetOutputs = nodes.filter((node) => node.isExecutionTarget && node.hasOutput)
  if (executionTargetOutputs.length > 0) return executionTargetOutputs.map((node) => node.nodeId)

  return nodes.filter((node) => node.hasOutput).map((node) => node.nodeId)
}

export const buildResultDashboardGroups = (nodes: ResultDashboardNode[]) => ({
  withOutput: nodes.filter((node) => node.hasOutput),
  withError: nodes.filter((node) => !node.hasOutput && node.status === 'error'),
  withoutOutput: nodes.filter((node) => !node.hasOutput && node.status !== 'error'),
})

export const buildResultDashboardSummary = ({
  workflowName,
  status,
  startTime,
  duration,
  executionTargetIds,
  nodes,
  getNodeOutput,
  getNodeError,
}: {
  workflowName: string
  status: 'success' | 'error' | 'stopped'
  startTime: number
  duration: number
  executionTargetIds: string[]
  terminalNodeIds: string[]
  nodes: WorkflowNode[]
  getNodeOutput: (nodeId: string) => WorkflowNodeOutput | null
  getNodeError: (nodeId: string) => string | undefined
}): WorkflowResultDashboardSummary => {
  const dashboardNodes = sortDashboardNodes(
    nodes.map((node) =>
      toResultDashboardNode(
        node,
        executionTargetIds,
        getNodeOutput(node.id),
        getNodeError(node.id),
      ),
    ),
  )
  const selectedDefaultNodeIds = getDefaultSelectedNodeIds(dashboardNodes)

  return {
    workflowName,
    status,
    startTime,
    duration,
    nodeCount: dashboardNodes.length,
    selectedDefaultNodeIds,
    nodes: dashboardNodes,
    metrics: {
      outputCount: dashboardNodes.filter((node) => node.hasOutput).length,
      errorCount: dashboardNodes.filter((node) => node.status === 'error').length,
      terminalOutputCount: dashboardNodes.filter((node) => node.isTerminal && node.hasOutput).length,
    },
  }
}
