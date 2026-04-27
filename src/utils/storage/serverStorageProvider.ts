import type {
  ExecutionRecord,
  IStorageProvider,
  SavedWorkflow,
  StorageUser,
  WorkflowRollbackResult,
  WorkflowVersionDetail,
  WorkflowVersionMetadata,
} from './types'
import { createWorkflowApiAuthHeaders } from '@/services/apiAuth'

/**
 * 服务器存储驱动实现 (Stub)
 * 后续只需对接真实的后端 API 即可投入生产环境使用
 */
export class ServerStorageProvider implements IStorageProvider {
  private baseUrl = import.meta.env.VITE_API_BASE_URL || '/api'

  private resolveWorkflowHeaders() {
    const userId = import.meta.env.VITE_WORKFLOW_USER_ID?.trim()
    const userName = import.meta.env.VITE_WORKFLOW_USER_NAME?.trim()
    if (!userId) return {}

    return {
      'x-workflow-user-id': userId,
      ...(userName ? { 'x-workflow-user-name': userName } : {}),
    }
  }

  private async request(path: string, options?: RequestInit, allowNotFound = false) {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...createWorkflowApiAuthHeaders(),
        ...this.resolveWorkflowHeaders(),
        ...options?.headers,
      },
    })
    if (allowNotFound && response.status === 404) return null
    if (!response.ok) throw new Error(`Server Storage Error: ${response.statusText}`)
    const text = await response.text()
    return text ? JSON.parse(text) : null
  }

  async getCurrentUser(): Promise<StorageUser | null> {
    console.log('[ServerStorage] Fetching current user...')
    return this.request('/storage/me')
  }

  async getWorkflows(): Promise<SavedWorkflow[]> {
    console.log('[ServerStorage] Fetching all workflows...')
    return this.request('/storage/workflows')
  }

  async getWorkflow(id: string): Promise<SavedWorkflow | null> {
    console.log(`[ServerStorage] Fetching workflow: ${id}`)
    return this.request(`/storage/workflows/${id}`, undefined, true)
  }

  async saveWorkflow(workflow: SavedWorkflow): Promise<void> {
    console.log(`[ServerStorage] Saving workflow: ${workflow.id}`)
    await this.request('/storage/workflows', {
      method: 'POST',
      body: JSON.stringify(workflow),
    })
  }

  async deleteWorkflow(id: string): Promise<void> {
    console.log(`[ServerStorage] Deleting workflow: ${id}`)
    await this.request(`/storage/workflows/${id}`, { method: 'DELETE' })
  }

  async getWorkflowVersions(workflowId: string): Promise<WorkflowVersionMetadata[]> {
    console.log(`[ServerStorage] Fetching workflow versions: ${workflowId}`)
    return this.request(`/storage/workflows/${workflowId}/versions`)
  }

  async getWorkflowVersion(workflowId: string, versionId: string): Promise<WorkflowVersionDetail | null> {
    console.log(`[ServerStorage] Fetching workflow version detail: ${workflowId}/${versionId}`)
    return this.request(`/storage/workflows/${workflowId}/versions/${versionId}`, undefined, true)
  }

  async rollbackWorkflowVersion(workflowId: string, versionId: string): Promise<WorkflowRollbackResult | null> {
    console.log(`[ServerStorage] Rolling back workflow version: ${workflowId}/${versionId}`)
    return this.request(`/storage/workflows/${workflowId}/versions/${versionId}/rollback`, {
      method: 'POST',
    }, true)
  }

  async saveHistory(record: ExecutionRecord, limit = 20): Promise<ExecutionRecord[]> {
    console.log('[ServerStorage] Saving execution history...')
    return this.request('/storage/history', {
      method: 'POST',
      body: JSON.stringify({ record, limit }),
    })
  }

  async getAllHistory(): Promise<ExecutionRecord[]> {
    console.log('[ServerStorage] Fetching history...')
    return this.request('/storage/history')
  }

  async clearAllHistory(): Promise<void> {
    console.log('[ServerStorage] Clearing history...')
    await this.request('/storage/history', { method: 'DELETE' })
  }
}
