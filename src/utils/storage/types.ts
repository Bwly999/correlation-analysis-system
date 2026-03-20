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
  // 工作流相关
  getWorkflows(): Promise<SavedWorkflow[]>
  getWorkflow(id: string): Promise<SavedWorkflow | null>
  saveWorkflow(workflow: SavedWorkflow): Promise<void>
  deleteWorkflow(id: string): Promise<void>

  // 运行历史相关
  saveHistory(record: ExecutionRecord, limit?: number): Promise<ExecutionRecord[]>
  getAllHistory(): Promise<ExecutionRecord[]>
  clearAllHistory(): Promise<void>
}
