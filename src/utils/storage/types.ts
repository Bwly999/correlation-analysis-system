import type { Edge } from '@vue-flow/core'
import type { NodeResult } from '@/nodes/result'

export type WorkflowSerializablePrimitive = string | number | boolean | null
export type WorkflowSerializableValue =
  | WorkflowSerializablePrimitive
  | WorkflowSerializableValue[]
  | { [key: string]: WorkflowSerializableValue }

export type WorkflowNodeOutput = NodeResult | WorkflowSerializableValue | null

export interface WorkflowNodeData {
  label: string
  type: string
  category: 'trigger' | 'action' | 'terminal'
  config: Record<string, unknown>
  status: 'idle' | 'running' | 'success' | 'error'
  output?: WorkflowNodeOutput
  manualInput?: string
  useManualInput?: boolean
  isPinned?: boolean
  logs: string[]
  error?: string
}

export interface WorkflowNode {
  id: string
  type?: string
  label?: string
  position: { x: number; y: number }
  selected?: boolean
  dragging?: boolean
  data: WorkflowNodeData
}

export interface WorkflowNodeSnapshot {
  id: string
  type?: string
  position: { x: number; y: number }
  label?: string
  selected?: boolean
  dragging?: boolean
  data: WorkflowNodeData
}

/**
 * 工作流元数据，用于列表展示
 */
export interface WorkflowMetadata {
  id: string
  name: string
  updatedAt: number
}

export interface StorageUser {
  id: string
  name?: string
}

/**
 * 完整保存的工作流数据
 */
export interface SavedWorkflow extends WorkflowMetadata {
  nodes: WorkflowNodeSnapshot[]
  edges: Edge[]
}

/**
 * 执行历史记录
 */
export interface ExecutionRecord {
  id: string
  workflowId: string
  workflowName: string
  startTime: number
  duration: number
  status: 'success' | 'error' | 'stopped'
  nodes: WorkflowNodeSnapshot[]
  edges: Edge[]
}

/**
 * 存储提供者接口定义
 */
export interface IStorageProvider {
  /**
   * 返回当前存储后端识别到的用户上下文。
   *
   * 约束：
   * - 本地模式可返回 `null`，表示数据仅保存在当前浏览器，不引入用户概念。
   * - server 模式应返回当前登录用户或当前请求绑定的用户。
   * - 若后端未登录、未配置或该存储实现天然无用户语义，也应返回 `null`，而不是抛错。
   */
  getCurrentUser(): Promise<StorageUser | null>

  /**
   * 读取当前存储作用域下的工作流列表。
   *
   * 约束：
   * - 返回值应已按实现侧约定完成作用域隔离，例如 server 模式下只返回当前用户可见的工作流。
   * - 返回结果用于工作流管理中心列表展示，至少应保证 `id`、`name`、`updatedAt`、`nodes`、`edges` 可用。
   * - 若当前作用域下没有任何工作流，应返回空数组。
   */
  getWorkflows(): Promise<SavedWorkflow[]>

  /**
   * 按 id 读取单个工作流。
   *
   * 约束：
   * - 若工作流不存在，或当前作用域无权限访问，应返回 `null`。
   * - 不建议把“未找到”作为异常抛出，避免调用方额外区分 404 与真实故障。
   * - 返回内容应为完整可加载的工作流快照。
   */
  getWorkflow(id: string): Promise<SavedWorkflow | null>

  /**
   * 保存工作流。
   *
   * 约束：
   * - 调用方传入的是完整快照，而非增量 patch，实现侧应负责覆盖写入或 upsert。
   * - server 模式下工作流归属应由服务端根据当前用户上下文决定，不要求前端显式传 `userId`。
   * - 成功后无需返回工作流对象；若保存失败，应抛出异常供上层提示用户。
   */
  saveWorkflow(workflow: SavedWorkflow): Promise<void>

  /**
   * 删除指定工作流。
   *
   * 约束：
   * - 删除范围应遵循当前存储作用域，例如 server 模式下只能删除当前用户自己的工作流。
   * - 若目标不存在，可由实现自行决定静默成功或抛错；推荐与当前实现保持幂等。
   */
  deleteWorkflow(id: string): Promise<void>

  /**
   * 保存一条执行历史，并返回截断后的最新历史列表。
   *
   * 约束：
   * - `limit` 表示历史保留上限，实现侧应在写入后裁剪旧记录。
   * - 返回值应是最终持久化后的历史列表，供 store 直接刷新内存状态。
   * - 历史列表同样应遵循当前作用域隔离，例如 server 模式下只返回当前用户历史。
   */
  saveHistory(record: ExecutionRecord, limit?: number): Promise<ExecutionRecord[]>

  /**
   * 读取当前存储作用域下的全部执行历史。
   *
   * 约束：
   * - 返回结果应按时间倒序，最新记录排在前面。
   * - 若没有历史记录，应返回空数组。
   */
  getAllHistory(): Promise<ExecutionRecord[]>

  /**
   * 清空当前存储作用域下的全部执行历史。
   *
   * 约束：
   * - 不应影响其他作用域的数据，例如 server 模式下不应误清空其他用户历史。
   * - 成功后返回 `void`，失败时抛出异常。
   */
  clearAllHistory(): Promise<void>
}
