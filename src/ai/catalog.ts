import type { Edge } from '@vue-flow/core'
import { creatableNodeDefinitions } from '@/nodes/registry'
import { CONNECTION_RULES } from '@/workflow/connectionRules'
import type { WorkflowNode } from '@/utils/storage'
import type { WorkflowAiNodeCatalogItem, WorkflowAiPlanMode } from './types'

export const buildWorkflowAiNodeCatalog = (): WorkflowAiNodeCatalogItem[] =>
  creatableNodeDefinitions.map((definition) => ({
    name: definition.name,
    displayName: definition.displayName,
    category: definition.category,
    description: definition.description,
    inputMode: definition.inputMode ?? 'single',
    minInputs: definition.minInputs ?? 0,
    maxInputs: definition.maxInputs ?? (definition.inputMode === 'multiple' ? null : 1),
    allowedNextCategories: CONNECTION_RULES[definition.category] ?? [],
    properties: definition.properties.map((property) => ({
      name: property.name,
      displayName: property.displayName,
      type: property.type,
      required: property.required ?? false,
      isRuntimeInput: property.isRuntimeInput ?? false,
      defaultValue: property.default ?? null,
      description: property.description ?? '',
    })),
    help: definition.help ?? null,
    assistantHints: definition.assistantHints ?? null,
  }))

export const buildWorkflowAiSnapshot = (nodes: WorkflowNode[], edges: Edge[]) => ({
  nodes: nodes.map((node) => ({
    id: node.id,
    label: node.data.label,
    type: node.data.type,
    category: node.data.category,
    position: node.position,
    config: node.data.config,
    output: node.data.output ?? null,
  })),
  edges: edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceHandle: edge.sourceHandle ?? null,
    targetHandle: edge.targetHandle ?? null,
  })),
})

export const buildWorkflowAiSystemPrompt = (
  mode: WorkflowAiPlanMode,
  nodeCatalog: WorkflowAiNodeCatalogItem[],
) => {
  const modeLabel = mode === 'create' ? '从零创建工作流' : '修改现有工作流'
  const catalog = JSON.stringify(nodeCatalog, null, 2)

  return [
    '你是多因子相关性分析系统的工作流编排助手。',
    `当前任务模式：${modeLabel}。`,
    '你只能使用系统提供的现有节点，不能发明新节点，也不能输出解释性散文。',
    '你必须输出一个 JSON 对象，字段为 summary、assumptions、warnings、questions、operations。',
    'operations 必须只使用以下类型：createNode、updateNodeConfig、renameNode、removeNode、connectNodes、disconnectEdge、moveNode。',
    '如果信息不足，可以在 questions 返回需要追问的简短中文问题，并让 operations 为空数组。',
    '如果用户要求修改现有工作流，优先最小改动，不要重建整个流程。',
    '节点 label、summary、warnings、questions 都必须使用中文。',
    '请严格遵守节点连接规则、单输入/多输入限制和属性名称。',
    '以下是系统可用节点目录 JSON：',
    catalog,
  ].join('\n')
}
