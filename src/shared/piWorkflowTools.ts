export type PiWorkflowToolTarget = 'frontend_canvas' | 'server_runtime'

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
    name: 'wf_addNode',
    target: 'frontend_canvas',
    riskLevel: 'medium',
    executorKey: 'addNode',
    description: '在当前工作流画布中添加一个新节点。',
    inputSchema: {
      nodeType: 'string',
      label: 'string?',
      position: '{ x: number; y: number }?',
      config: 'record?',
    },
  },
  {
    name: 'wf_connectNodes',
    target: 'frontend_canvas',
    riskLevel: 'medium',
    executorKey: 'connectNodes',
    description: '在当前工作流画布中连接两个节点。',
    inputSchema: {
      sourceId: 'string',
      targetId: 'string',
      sourceHandle: 'string?',
      targetHandle: 'string?',
    },
  },
  {
    name: 'wf_updateNodeConfig',
    target: 'frontend_canvas',
    riskLevel: 'medium',
    executorKey: 'updateNodeConfig',
    description: '更新指定节点的配置。',
    inputSchema: {
      nodeId: 'string',
      config: 'record',
    },
  },
  {
    name: 'wf_renameNode',
    target: 'frontend_canvas',
    riskLevel: 'medium',
    executorKey: 'renameNode',
    description: '重命名指定节点。',
    inputSchema: {
      nodeId: 'string',
      label: 'string',
    },
  },
  {
    name: 'wf_removeNode',
    target: 'frontend_canvas',
    riskLevel: 'high',
    executorKey: 'removeNode',
    description: '删除指定节点以及关联连线。',
    inputSchema: {
      nodeId: 'string',
    },
  },
  {
    name: 'wf_disconnectEdge',
    target: 'frontend_canvas',
    riskLevel: 'high',
    executorKey: 'disconnectEdge',
    description: '断开指定连线。',
    inputSchema: {
      edgeId: 'string',
    },
  },
  {
    name: 'wf_moveNode',
    target: 'frontend_canvas',
    riskLevel: 'medium',
    executorKey: 'moveNode',
    description: '移动指定节点到新位置。',
    inputSchema: {
      nodeId: 'string',
      position: '{ x: number; y: number }',
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
    target: 'server_runtime',
    riskLevel: 'low',
    executorKey: 'getNodeCatalog',
    description: '读取当前工作流节点目录。',
    inputSchema: {
      limit: 'number?',
      offset: 'number?',
    },
  },
  {
    name: 'workflow_list_data_sources',
    target: 'server_runtime',
    riskLevel: 'low',
    executorKey: 'listDataSources',
    description: '列出当前会话可用数据源。',
    inputSchema: {
      limit: 'number?',
      offset: 'number?',
    },
  },
  {
    name: 'workflow_get_data_source_schema',
    target: 'server_runtime',
    riskLevel: 'low',
    executorKey: 'getDataSourceSchema',
    description: '读取指定数据源的字段摘要。',
    inputSchema: {
      dataSourceId: 'string',
    },
  },
  {
    name: 'workflow_search_nodes',
    target: 'server_runtime',
    riskLevel: 'low',
    executorKey: 'searchNodes',
    description: '搜索可用工作流节点。',
    inputSchema: {
      query: 'string?',
      limit: 'number?',
      offset: 'number?',
    },
  },
  {
    name: 'workflow_get_node',
    target: 'server_runtime',
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
  {
    name: 'workflow_get_node_options',
    target: 'server_runtime',
    riskLevel: 'low',
    executorKey: 'getNodeOptions',
    description: '解析节点属性的动态候选项。',
    inputSchema: {
      nodeType: 'string',
      propertyName: 'string',
      config: 'record?',
      upstreamSample: 'unknown?',
    },
  },
  {
    name: 'workflow_profile_data_source',
    target: 'server_runtime',
    riskLevel: 'low',
    executorKey: 'profileDataSource',
    description: '为指定数据源生成字段画像。',
    inputSchema: {
      dataSourceId: 'string',
    },
  },
  {
    name: 'workflow_recommend_methods',
    target: 'server_runtime',
    riskLevel: 'low',
    executorKey: 'recommendMethods',
    description: '基于数据画像推荐分析方法。',
    inputSchema: {
      dataSourceId: 'string',
    },
  },
  {
    name: 'workflow_create_workflow',
    target: 'server_runtime',
    riskLevel: 'medium',
    executorKey: 'createWorkflow',
    description: '创建一个真实可持久化的工作流。',
    inputSchema: {
      workflowId: 'string?',
      name: 'string?',
    },
  },
  {
    name: 'workflow_get_workflow',
    target: 'server_runtime',
    riskLevel: 'low',
    executorKey: 'getWorkflow',
    description: '读取指定工作流。',
    inputSchema: {
      workflowId: 'string',
      mode: '\'full\' | \'structure\' | \'minimal\'?',
    },
  },
  {
    name: 'workflow_update_partial_workflow',
    target: 'server_runtime',
    riskLevel: 'high',
    executorKey: 'updatePartialWorkflow',
    description: '按操作列表真实增量更新工作流。',
    inputSchema: {
      workflowId: 'string',
      operations: 'WorkflowAiOperation[]',
      summary: 'string?',
      validateAfterApply: 'boolean?',
    },
  },
  {
    name: 'workflow_update_full_workflow',
    target: 'server_runtime',
    riskLevel: 'high',
    executorKey: 'updateFullWorkflow',
    description: '整包替换工作流内容。',
    inputSchema: {
      workflow: 'SavedWorkflowLike',
    },
  },
  {
    name: 'workflow_validate_workflow',
    target: 'server_runtime',
    riskLevel: 'low',
    executorKey: 'validateWorkflow',
    description: '校验指定工作流或临时工作流快照。',
    inputSchema: {
      workflowId: 'string?',
      workflowSnapshot: 'snapshot?',
    },
  },
  {
    name: 'workflow_executions',
    target: 'server_runtime',
    riskLevel: 'low',
    executorKey: 'executions',
    description: '查询执行历史、节点结果或产物。',
    inputSchema: {
      mode: '\'list\' | \'get\' | \'node_result\' | \'artifacts\'?',
      executionId: 'string?',
      nodeId: 'string?',
      limit: 'number?',
      offset: 'number?',
    },
  },
  {
    name: 'workflow_list_workflow_versions',
    target: 'server_runtime',
    riskLevel: 'low',
    executorKey: 'listWorkflowVersions',
    description: '读取工作流版本列表。',
    inputSchema: {
      workflowId: 'string',
      limit: 'number?',
      offset: 'number?',
    },
  },
  {
    name: 'workflow_get_workflow_version',
    target: 'server_runtime',
    riskLevel: 'low',
    executorKey: 'getWorkflowVersion',
    description: '读取工作流指定版本详情。',
    inputSchema: {
      workflowId: 'string',
      versionId: 'string',
    },
  },
  {
    name: 'workflow_rollback_workflow_version',
    target: 'server_runtime',
    riskLevel: 'high',
    executorKey: 'rollbackWorkflowVersion',
    description: '回滚工作流到指定历史版本。',
    inputSchema: {
      workflowId: 'string',
      versionId: 'string',
    },
  },
  {
    name: 'workflow_get_execution_result',
    target: 'server_runtime',
    riskLevel: 'low',
    executorKey: 'getExecutionResult',
    description: '读取指定 executionId 的执行结果。',
    inputSchema: {
      executionId: 'string',
    },
  },
  {
    name: 'workflow_extract_result_evidence',
    target: 'server_runtime',
    riskLevel: 'low',
    executorKey: 'extractResultEvidence',
    description: '从指定 executionId 抽取可引用证据。',
    inputSchema: {
      executionId: 'string',
    },
  },
]

export const getPiWorkflowToolSpec = (name: string): PiWorkflowToolSpec | undefined =>
  PI_WORKFLOW_TOOL_SPECS.find((spec) => spec.name === name)

export const getPiWorkflowToolSpecsByTarget = (target: PiWorkflowToolTarget): PiWorkflowToolSpec[] =>
  PI_WORKFLOW_TOOL_SPECS.filter((spec) => spec.target === target)
