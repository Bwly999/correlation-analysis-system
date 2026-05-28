/**
 * 前端画布工具：后端只调度，真实工作流操作由前端 WorkflowApi 执行。
 */
import { defineTool } from '@earendil-works/pi-coding-agent'
import { Type } from 'typebox'
import type { FrontendBridge } from '../frontendBridge.js'

const WORKFLOW_UPDATE_TIMEOUT_MS = 90_000
const EXECUTE_WORKFLOW_TIMEOUT_MS = 600_000

const stringEnum = <T extends readonly string[]>(
  values: T,
  options?: Record<string, unknown>,
) =>
  Type.Unsafe<T[number]>({
    type: 'string',
    enum: [...values],
    ...options,
  } as any)

const POSITION_SCHEMA = Type.Object({
  x: Type.Number({ description: 'X 坐标' }),
  y: Type.Number({ description: 'Y 坐标' }),
})

const WORKFLOW_OPERATION_TYPE_SCHEMA = stringEnum(
  [
    'createNode',
    'updateNodeConfig',
    'renameNode',
    'removeNode',
    'connectNodes',
    'disconnectEdge',
    'moveNode',
  ] as const,
  { description: '增量操作类型' },
)

const WORKFLOW_OPERATION_SCHEMA = Type.Object({
  id: Type.String({ description: '操作唯一标识，用于同批次内引用新建节点' }),
  type: WORKFLOW_OPERATION_TYPE_SCHEMA,
  nodeType: Type.Optional(Type.String({ description: 'createNode 使用的节点类型名称' })),
  nodeLabel: Type.Optional(Type.String({ description: 'createNode 使用的节点显示名称' })),
  config: Type.Optional(Type.Record(Type.String(), Type.Unknown(), { description: '节点配置' })),
  sourceRef: Type.Optional(Type.String({ description: 'connectNodes 使用的源节点 ID 或同批次操作 ID' })),
  targetRef: Type.Optional(Type.String({ description: 'connectNodes 使用的目标节点 ID 或同批次操作 ID' })),
  sourceHandle: Type.Optional(Type.String({ description: '源节点输出端口' })),
  targetHandle: Type.Optional(Type.String({ description: '目标节点输入端口' })),
  nodeRef: Type.Optional(Type.String({ description: 'update/rename/remove/move 使用的节点 ID 或同批次操作 ID' })),
  edgeRef: Type.Optional(Type.String({ description: 'disconnectEdge 使用的连线 ID' })),
  label: Type.Optional(Type.String({ description: 'renameNode 使用的新节点名称' })),
  position: Type.Optional(POSITION_SCHEMA),
})

const EXECUTION_SCOPE_SCHEMA = stringEnum(['workflow', 'node'] as const, {
  description: '执行范围：workflow 表示整条工作流，node 表示单节点调试',
})

const DEBUG_MODE_SCHEMA = stringEnum(['reuse_cached_upstream', 'rerun_upstream'] as const, {
  description: '单节点调试模式',
})

const WORKFLOW_UPDATE_PARAMETERS = Type.Object({
  workflowId: Type.Optional(Type.String({ description: '可选工作流 ID；前端画布会以当前画布为准' })),
  operations: Type.Array(WORKFLOW_OPERATION_SCHEMA, { description: '按顺序应用到当前画布的增量操作列表' }),
  summary: Type.Optional(Type.String({ description: '本次修改摘要' })),
  validateAfterApply: Type.Optional(Type.Boolean({ description: '应用前是否校验操作，默认 true' })),
})

type WorkflowUpdateParams = {
  operations: Array<{
    id: string
    type: 'createNode' | 'updateNodeConfig' | 'renameNode' | 'removeNode' | 'connectNodes' | 'disconnectEdge' | 'moveNode'
    nodeType?: string
    nodeRef?: string
    sourceRef?: string
    targetRef?: string
    edgeRef?: string
    config?: Record<string, unknown>
    label?: string
    position?: { x: number; y: number }
  }>
}

const EXECUTE_WORKFLOW_PARAMETERS = Type.Object({
  scope: EXECUTION_SCOPE_SCHEMA,
  nodeId: Type.Optional(Type.String({ description: 'scope=node 时要调试的节点 ID' })),
  mode: Type.Optional(DEBUG_MODE_SCHEMA),
})

const assertWorkflowUpdateParams = (params: WorkflowUpdateParams) => {
  if (!params.operations.length) {
    throw new Error('operations 不能为空')
  }

  params.operations.forEach((operation, index) => {
    const prefix = `第 ${index + 1} 个操作(${operation.type})`
    if (operation.type === 'createNode' && !operation.nodeType) {
      throw new Error(`${prefix} 缺少 nodeType`)
    }
    if (operation.type === 'updateNodeConfig' && (!operation.nodeRef || !operation.config)) {
      throw new Error(`${prefix} 缺少 nodeRef 或 config`)
    }
    if (operation.type === 'renameNode' && (!operation.nodeRef || !operation.label)) {
      throw new Error(`${prefix} 缺少 nodeRef 或 label`)
    }
    if (operation.type === 'removeNode' && !operation.nodeRef) {
      throw new Error(`${prefix} 缺少 nodeRef`)
    }
    if (operation.type === 'connectNodes' && (!operation.sourceRef || !operation.targetRef)) {
      throw new Error(`${prefix} 缺少 sourceRef 或 targetRef`)
    }
    if (operation.type === 'disconnectEdge' && !operation.edgeRef) {
      throw new Error(`${prefix} 缺少 edgeRef`)
    }
    if (operation.type === 'moveNode' && (!operation.nodeRef || !operation.position)) {
      throw new Error(`${prefix} 缺少 nodeRef 或 position`)
    }
  })
}

/**
 * 创建前端画布工具集。
 */
export function createAtomicWorkflowTools(bridge: FrontendBridge) {
  const updatePartialWorkflow = defineTool({
    name: 'workflow_update_partial_workflow',
    label: '增量修改画布',
    description: `按操作列表渐进式修改当前前端工作流画布。

用法：
- 适合添加节点、连接节点、改配置、重命名、删除、断线和移动节点
- 同一批 operations 中，新建节点可用 createNode 操作的 id 被后续操作引用
- 高风险删除/断线操作应先向用户确认`,
    promptSnippet: '用 workflow_update_partial_workflow 渐进式修改当前前端画布',
    promptGuidelines: [
      '修改工作流结构时优先使用 workflow_update_partial_workflow，不要调用旧的 wf_addNode/wf_connectNodes 等原子工具。',
      '每次只提交完成当前意图所需的最小 operations，并给出简短 summary。',
      '删除节点或断开连线前必须先确认用户意图。',
    ],
    parameters: WORKFLOW_UPDATE_PARAMETERS,
    async execute(toolCallId, params, _signal, onUpdate) {
      assertWorkflowUpdateParams(params)
      onUpdate?.({
        content: [{ type: 'text', text: '正在等待前端画布应用增量修改...' }],
        details: { status: 'waiting_frontend_canvas' },
      })
      return await bridge.request(
        toolCallId,
        'workflow_update_partial_workflow',
        params as Record<string, unknown>,
        { timeoutMs: WORKFLOW_UPDATE_TIMEOUT_MS },
      )
    },
  })

  const executeWorkflow = defineTool({
    name: 'wf_executeWorkflow',
    label: '执行工作流',
    description: `统一执行当前 GUI 画布，可执行整条工作流或调试单节点。

参数说明：
- scope: workflow 表示整条工作流，node 表示单节点调试
- nodeId: 当 scope=node 时，要调试的节点 ID
- mode: 单节点调试模式，rerun_upstream 表示强制重跑上游`,
    promptSnippet: '用 wf_executeWorkflow 执行整条画布或调试单个节点',
    promptGuidelines: [
      '需要运行或验证结果时使用 wf_executeWorkflow，确保与用户点击执行按钮走同一条前端链路。',
      '调试单节点时设置 scope=node 并提供 nodeId；需要强制重跑上游时设置 mode=rerun_upstream。',
    ],
    parameters: EXECUTE_WORKFLOW_PARAMETERS,
    async execute(toolCallId, params, _signal, onUpdate) {
      onUpdate?.({
        content: [{ type: 'text', text: '正在等待前端画布执行工作流...' }],
        details: { status: 'waiting_frontend_canvas' },
      })
      return await bridge.request(
        toolCallId,
        'wf_executeWorkflow',
        params as Record<string, unknown>,
        { timeoutMs: EXECUTE_WORKFLOW_TIMEOUT_MS },
      )
    },
  })

  return [
    updatePartialWorkflow,
    executeWorkflow,
  ]
}
