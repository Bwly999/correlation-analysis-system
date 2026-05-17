/**
 * 原子工作流操作工具 — 每个工具映射到一个前端 WorkflowApi 函数
 *
 * 与旧版粗粒度 workflowTools.ts 的区别：
 * - 每个工具是原子的（一个工具 = 一个操作）
 * - 执行通过 FrontendBridge 转发到前端，而非后端本地执行
 * - LLM 可以逐步操作画布，实时看到每一步的结果
 *
 * 原则：后端不碰执行，前端不碰推理。
 */
import { defineTool } from '@earendil-works/pi-coding-agent'
import { Type } from 'typebox'
import type { FrontendBridge } from '../frontendBridge.js'
import type { PiAgentSafeToolResult } from '../../../ai/types.js'

const POSITION_SCHEMA = Type.Object({
  x: Type.Number({ description: 'X 坐标' }),
  y: Type.Number({ description: 'Y 坐标' }),
})

const EXECUTION_SCOPE_SCHEMA = Type.Union([
  Type.Literal('workflow'),
  Type.Literal('node'),
], { description: '执行范围：整条工作流或单节点调试' })

const DEBUG_MODE_SCHEMA = Type.Union([
  Type.Literal('reuse_cached_upstream'),
  Type.Literal('rerun_upstream'),
], { description: '单节点调试模式' })

const buildFallbackDetails = (scope: 'global' | 'single', message: string): PiAgentSafeToolResult => ({
  ok: false,
  scope,
  executionId: null,
  status: 'failed',
  summary: message,
  nodes: [],
  artifacts: [],
  warnings: [message],
})

const errorResult = (message: string) => ({
  content: [{ type: 'text' as const, text: message }],
  details: buildFallbackDetails('global', message),
  isError: true,
})

/**
 * 创建原子工作流操作工具集
 *
 * @param bridge - 前端桥接实例（每个用户会话独立）
 * @returns Pi SDK defineTool 定义的工具数组
 */
export function createAtomicWorkflowTools(bridge: FrontendBridge) {
  const addNode = defineTool({
    name: 'wf_addNode',
    label: '添加节点',
    description: `在画布上添加一个新节点。

参数说明：
- nodeType: 节点类型名称（如 manual-json-import、js-transform、pearson-correlation 等）
- label: 节点显示标签
- position: 节点在画布上的坐标位置 { x, y }
- config: 节点初始配置参数`,
    parameters: Type.Object({
      nodeType: Type.String({ description: '节点类型名称' }),
      label: Type.Optional(Type.String({ description: '节点显示标签' })),
      position: Type.Optional(POSITION_SCHEMA),
      config: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
    }),
    async execute(callId, params, _signal, _onUpdate, _ctx) {
      try {
        return await bridge.request(callId, 'wf_addNode', params as Record<string, unknown>)
      } catch (err: any) {
        return errorResult(err?.message || '添加节点失败')
      }
    },
  })

  const connectNodes = defineTool({
    name: 'wf_connectNodes',
    label: '连接节点',
    description: `连接两个节点。注意连接规则：trigger → action → terminal，同一类别间通常不能互连。

参数说明：
- sourceId: 源节点 ID
- targetId: 目标节点 ID
- sourceHandle: 源节点的输出端口（可选）
- targetHandle: 目标节点的输入端口（可选）`,
    parameters: Type.Object({
      sourceId: Type.String({ description: '源节点 ID' }),
      targetId: Type.String({ description: '目标节点 ID' }),
      sourceHandle: Type.Optional(Type.String({ description: '源节点输出端口' })),
      targetHandle: Type.Optional(Type.String({ description: '目标节点输入端口' })),
    }),
    async execute(callId, params, _signal, _onUpdate, _ctx) {
      try {
        return await bridge.request(callId, 'wf_connectNodes', params as Record<string, unknown>)
      } catch (err: any) {
        return errorResult(err?.message || '连接节点失败')
      }
    },
  })

  const updateNodeConfig = defineTool({
    name: 'wf_updateNodeConfig',
    label: '更新节点配置',
    description: `更新指定节点的配置参数。传入的 config 对象会与现有配置合并。

参数说明：
- nodeId: 要更新的节点 ID
- config: 要合并的配置键值对`,
    parameters: Type.Object({
      nodeId: Type.String({ description: '节点 ID' }),
      config: Type.Record(Type.String(), Type.Unknown(), { description: '配置键值对' }),
    }),
    async execute(callId, params, _signal, _onUpdate, _ctx) {
      try {
        return await bridge.request(callId, 'wf_updateNodeConfig', params as Record<string, unknown>)
      } catch (err: any) {
        return errorResult(err?.message || '更新配置失败')
      }
    },
  })

  const renameNode = defineTool({
    name: 'wf_renameNode',
    label: '重命名节点',
    description: `修改节点的显示标签。

参数说明：
- nodeId: 节点 ID
- label: 新的显示标签`,
    parameters: Type.Object({
      nodeId: Type.String({ description: '节点 ID' }),
      label: Type.String({ description: '新的显示标签' }),
    }),
    async execute(callId, params, _signal, _onUpdate, _ctx) {
      try {
        return await bridge.request(callId, 'wf_renameNode', params as Record<string, unknown>)
      } catch (err: any) {
        return errorResult(err?.message || '重命名失败')
      }
    },
  })

  const removeNode = defineTool({
    name: 'wf_removeNode',
    label: '删除节点',
    description: `删除指定节点及其关联的连线。高风险操作，请先确认。

参数说明：
- nodeId: 要删除的节点 ID`,
    parameters: Type.Object({
      nodeId: Type.String({ description: '节点 ID' }),
    }),
    async execute(callId, params, _signal, _onUpdate, _ctx) {
      try {
        return await bridge.request(callId, 'wf_removeNode', params as Record<string, unknown>)
      } catch (err: any) {
        return errorResult(err?.message || '删除节点失败')
      }
    },
  })

  const disconnectEdge = defineTool({
    name: 'wf_disconnectEdge',
    label: '断开连线',
    description: `删除两个节点之间的连线。

参数说明：
- edgeId: 连线 ID`,
    parameters: Type.Object({
      edgeId: Type.String({ description: '连线 ID' }),
    }),
    async execute(callId, params, _signal, _onUpdate, _ctx) {
      try {
        return await bridge.request(callId, 'wf_disconnectEdge', params as Record<string, unknown>)
      } catch (err: any) {
        return errorResult(err?.message || '断开连线失败')
      }
    },
  })

  const moveNode = defineTool({
    name: 'wf_moveNode',
    label: '移动节点',
    description: `将节点移动到画布上的新位置。

参数说明：
- nodeId: 节点 ID
- position: 新的坐标位置 { x, y }`,
    parameters: Type.Object({
      nodeId: Type.String({ description: '节点 ID' }),
      position: POSITION_SCHEMA,
    }),
    async execute(callId, params, _signal, _onUpdate, _ctx) {
      try {
        return await bridge.request(callId, 'wf_moveNode', params as Record<string, unknown>)
      } catch (err: any) {
        return errorResult(err?.message || '移动节点失败')
      }
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
    parameters: Type.Object({
      scope: EXECUTION_SCOPE_SCHEMA,
      nodeId: Type.Optional(Type.String({ description: '单节点调试时的节点 ID' })),
      mode: Type.Optional(DEBUG_MODE_SCHEMA),
    }),
    async execute(callId, params, _signal, _onUpdate, _ctx) {
      try {
        return await bridge.request(callId, 'wf_executeWorkflow', params as Record<string, unknown>)
      } catch (err: any) {
        return errorResult(err?.message || '执行工作流失败')
      }
    },
  })

  return [
    addNode,
    connectNodes,
    updateNodeConfig,
    renameNode,
    removeNode,
    disconnectEdge,
    moveNode,
    executeWorkflow,
  ]
}
