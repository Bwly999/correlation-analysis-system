import { type Node, type Edge } from '@vue-flow/core'

export interface WorkflowNode extends Node {
  data: {
    label: string
    type: string
    category: 'trigger' | 'action' | 'terminal'
    config: any
    status: 'idle' | 'running' | 'success' | 'error'
    output?: any
    manualInput?: any
    useManualInput?: boolean
    isPinned?: boolean
    logs: string[]
  }
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
  nodes: WorkflowNode[]
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
  nodes: any[]
  edges: any[]
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
