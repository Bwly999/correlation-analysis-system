export type PiWorkflowToolTarget = 'frontend_canvas' | 'frontend_bridge' | 'server_runtime'

export type PiWorkflowToolRiskLevel = 'low' | 'medium' | 'high'

export interface PiWorkflowToolSpec {
  name: string
  target: PiWorkflowToolTarget
  riskLevel: PiWorkflowToolRiskLevel
  inputSchema: Record<string, unknown>
  description: string
  executorKey: string
}

export const PI_WORKFLOW_TOOL_SPECS: PiWorkflowToolSpec[] = [
  {
    name: 'workflow_update_partial_workflow',
    target: 'frontend_canvas',
    riskLevel: 'high',
    executorKey: 'updatePartialWorkflow',
    description: '按操作列表渐进式修改当前前端工作流画布。',
    inputSchema: {
      workflowId: 'string?',
      operations: 'WorkflowAiOperation[]',
      summary: 'string?',
      validateAfterApply: 'boolean?',
    },
  },
  {
    name: 'wf_executeWorkflow',
    target: 'frontend_canvas',
    riskLevel: 'medium',
    executorKey: 'runWorkflow',
    description: '统一执行当前 GUI 画布，可执行整链或调试单节点。',
    inputSchema: {
      scope: '\'workflow\' | \'node\'',
      nodeId: 'string?',
      mode: '\'reuse_cached_upstream\' | \'rerun_upstream\'?',
    },
  },
  {
    name: 'workflow_get_session_context',
    target: 'server_runtime',
    riskLevel: 'low',
    executorKey: 'getSessionContext',
    description: '读取当前工作流分析会话上下文。',
    inputSchema: {},
  },
  {
    name: 'workflow_get_node_catalog',
    target: 'frontend_bridge',
    riskLevel: 'low',
    executorKey: 'getNodeCatalog',
    description: '读取当前工作流节点目录。',
    inputSchema: {
      limit: 'number?',
      offset: 'number?',
    },
  },
  {
    name: 'workflow_get_node',
    target: 'frontend_bridge',
    riskLevel: 'low',
    executorKey: 'getNode',
    description: '按模式读取单个节点详情。',
    inputSchema: {
      nodeType: 'string',
      mode: '\'info\' | \'docs\' | \'search_properties\' | \'runtime_requirements\'?',
      propertyQuery: 'string?',
      config: 'record?',
    },
  },
]

export const getPiWorkflowToolSpec = (name: string): PiWorkflowToolSpec | undefined =>
  PI_WORKFLOW_TOOL_SPECS.find((spec) => spec.name === name)

export const getPiWorkflowToolSpecsByTarget = (target: PiWorkflowToolTarget): PiWorkflowToolSpec[] =>
  PI_WORKFLOW_TOOL_SPECS.filter((spec) => spec.target === target)
