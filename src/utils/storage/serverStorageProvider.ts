import type {
  ExecutionRecord,
  ExecutionRecordSummary,
  IStorageProvider,
  SavedWorkflow,
  StorageUser,
  WorkflowRollbackResult,
  WorkflowVersionDetail,
  WorkflowVersionMetadata,
} from './types'
import { httpClient } from '@/services/httpClient'
import {
  buildRequestErrorFromResponseData,
  buildRequestErrorFromUnknown,
} from '@/utils/requestError'

/**
 * 服务器存储驱动实现 (Stub)
 * 后续只需对接真实的后端 API 即可投入生产环境使用
 */
export class ServerStorageProvider implements IStorageProvider {
  private async request<T>(
    path: string,
    options?: { method?: string; body?: string; headers?: Record<string, string> },
    allowNotFound = false,
  ): Promise<T | null> {
    let response: { status: number; data: unknown }
    try {
      response = await httpClient.request({
        url: path,
        method: options?.method ?? 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...(options?.headers ?? {}),
        },
        data: options?.body ? JSON.parse(options.body) : undefined,
      })
    } catch (error) {
      throw buildRequestErrorFromUnknown(error, {
        fallbackMessage: '工作流存储请求失败，请稍后重试',
        networkErrorMessage: '工作流存储请求失败，请检查网络连接后重试',
      })
    }
    if (allowNotFound && response.status === 404) return null
    if (response.status < 200 || response.status >= 300) {
      throw buildRequestErrorFromResponseData(response, {
        fallbackMessage: '工作流存储请求失败，请稍后重试',
      })
    }
    return (response.data === '' ? null : response.data) as T | null
  }

  async getCurrentUser(): Promise<StorageUser | null> {
    console.log('[ServerStorage] Fetching current user...')
    return this.request<StorageUser>('/storage/me')
  }

  async getWorkflows(): Promise<SavedWorkflow[]> {
    console.log('[ServerStorage] Fetching all workflows...')
    return (await this.request<SavedWorkflow[]>('/storage/workflows')) ?? []
  }

  async getWorkflow(id: string): Promise<SavedWorkflow | null> {
    console.log(`[ServerStorage] Fetching workflow: ${id}`)
    return this.request<SavedWorkflow>(`/storage/workflows/${id}`, undefined, true)
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
    return (await this.request<WorkflowVersionMetadata[]>(`/storage/workflows/${workflowId}/versions`)) ?? []
  }

  async getWorkflowVersion(workflowId: string, versionId: string): Promise<WorkflowVersionDetail | null> {
    console.log(`[ServerStorage] Fetching workflow version detail: ${workflowId}/${versionId}`)
    return this.request<WorkflowVersionDetail>(`/storage/workflows/${workflowId}/versions/${versionId}`, undefined, true)
  }

  async rollbackWorkflowVersion(workflowId: string, versionId: string): Promise<WorkflowRollbackResult | null> {
    console.log(`[ServerStorage] Rolling back workflow version: ${workflowId}/${versionId}`)
    return this.request<WorkflowRollbackResult>(`/storage/workflows/${workflowId}/versions/${versionId}/rollback`, {
      method: 'POST',
    }, true)
  }

  async saveHistory(record: ExecutionRecord, limit = 20): Promise<ExecutionRecordSummary[]> {
    console.log('[ServerStorage] Saving execution history...')
    return (await this.request<ExecutionRecordSummary[]>('/storage/history', {
      method: 'POST',
      body: JSON.stringify({ record, limit }),
    })) ?? []
  }

  async getHistorySummaries(): Promise<ExecutionRecordSummary[]> {
    console.log('[ServerStorage] Fetching history summaries...')
    return (await this.request<ExecutionRecordSummary[]>('/storage/history/summaries')) ?? []
  }

  async getHistoryRecord(recordId: string): Promise<ExecutionRecord | null> {
    console.log(`[ServerStorage] Fetching history record: ${recordId}`)
    return this.request<ExecutionRecord>(`/storage/history/${encodeURIComponent(recordId)}`, undefined, true)
  }

  async clearAllHistory(): Promise<void> {
    console.log('[ServerStorage] Clearing history...')
    await this.request('/storage/history', { method: 'DELETE' })
  }
}
