/**
 * WorkflowApi — 工作流操作的统一入口
 *
 * 前端 GUI 交互（点击、拖拽）和 Agent 工具调用均通过此 API 操作工作流画布。
 * 内部封装 Pinia workflowStore，确保所有操作的副作用一致性。
 */

import { useWorkflowStore } from '@/stores/workflowStore'
import type { WorkflowNode } from '@/utils/storage'
import type { Edge } from '@vue-flow/core'

const getStore = () => useWorkflowStore()

export const WorkflowApi = {
  /**
   * 在画布上添加一个节点
   *
   * @param nodeType - 节点类型名称（如 'manual-input'）
   * @param label - 节点显示标签，默认使用节点类型定义中的 displayName
   * @param position - 节点在画布上的位置，默认 { x: 200, y: 200 }
   * @param config - 节点初始配置
   * @returns 创建的节点对象
   */
  addNode(
    nodeType: string,
    label?: string,
    position?: { x: number; y: number },
    config?: Record<string, unknown>,
  ): WorkflowNode {
    const store = getStore()
    return store.createNodeFromDefinition(nodeType, label, position, config)
  },

  /**
   * 连接两个节点
   *
   * @param sourceId - 源节点 ID
   * @param targetId - 目标节点 ID
   * @param handles - 连接的 handle 信息
   * @returns 创建的连线对象
   */
  connectNodes(
    sourceId: string,
    targetId: string,
    handles?: { sourceHandle?: string; targetHandle?: string },
  ): Edge {
    const store = getStore()
    return store.connectNodesById(sourceId, targetId, handles)
  },

  /**
   * 更新节点的配置参数
   *
   * @param nodeId - 节点 ID
   * @param config - 要合并更新的配置对象
   */
  updateNodeConfig(nodeId: string, config: Record<string, unknown>): void {
    const store = getStore()
    store.updateNodeConfigById(nodeId, config)
  },

  /**
   * 重命名节点
   *
   * @param nodeId - 节点 ID
   * @param label - 新的显示标签
   */
  renameNode(nodeId: string, label: string): void {
    const store = getStore()
    store.renameNodeById(nodeId, label)
  },

  /**
   * 删除节点（同时删除关联的连线）
   *
   * @param nodeId - 要删除的节点 ID
   */
  removeNode(nodeId: string): void {
    const store = getStore()
    store.removeNode(nodeId)
  },

  /**
   * 断开两个节点之间的连线
   *
   * @param edgeId - 连线 ID
   */
  disconnectEdge(edgeId: string): void {
    const store = getStore()
    store.removeEdge(edgeId)
  },

  /**
   * 移动节点到新的画布位置
   *
   * @param nodeId - 节点 ID
   * @param position - 新的位置坐标
   */
  moveNode(nodeId: string, position: { x: number; y: number }): void {
    const store = getStore()
    store.setNodePositionById(nodeId, position)
  },
}
