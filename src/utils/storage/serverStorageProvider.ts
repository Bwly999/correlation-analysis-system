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
import { encodeWorkflowHeaderValue } from '@/shared/workflowHeaderEncoding'
import {
  buildRequestErrorFromResponse,
  buildRequestErrorFromUnknown,
} from '@/utils/requestError'

const WORKFLOW_USER_ID_STORAGE_KEY = 'workflow-storage-user-id'
const WORKFLOW_USER_NAME_STORAGE_KEY = 'workflow-storage-user-name'
const FALLBACK_WORKFLOW_USER_NAME = '默认用户'

const resolveBrowserStorage = () => {
  if (typeof window === 'undefined') return null

  try {
    return window.localStorage
  } catch {
    return null
  }
}

const getOrCreateFallbackWorkflowUser = () => {
  const storage = resolveBrowserStorage()
  const generatedId = `local-workflow-user-${Math.random().toString(36).slice(2, 10)}`
  if (!storage) {
    return {
      id: generatedId,
      name: FALLBACK_WORKFLOW_USER_NAME,
    }
  }

  const cachedId = storage.getItem(WORKFLOW_USER_ID_STORAGE_KEY)?.trim()
  const cachedName = storage.getItem(WORKFLOW_USER_NAME_STORAGE_KEY)?.trim()
  if (cachedId) {
    return {
      id: cachedId,
      name: cachedName || FALLBACK_WORKFLOW_USER_NAME,
    }
  }

  storage.setItem(WORKFLOW_USER_ID_STORAGE_KEY, generatedId)
  storage.setItem(WORKFLOW_USER_NAME_STORAGE_KEY, FALLBACK_WORKFLOW_USER_NAME)
  return {
    id: generatedId,
    name: FALLBACK_WORKFLOW_USER_NAME,
  }
}

/**
 * 服务器存储驱动实现 (Stub)
 * 后续只需对接真实的后端 API 即可投入生产环境使用
 */
export class ServerStorageProvider implements IStorageProvider {
  private baseUrl = import.meta.env.VITE_API_BASE_URL || '/api'

  private resolveWorkflowHeaders(): Record<string, string> {
    const envUserId = import.meta.env.VITE_WORKFLOW_USER_ID?.trim()
    const envUserName = import.meta.env.VITE_WORKFLOW_USER_NAME?.trim()
    const fallbackUser = getOrCreateFallbackWorkflowUser()
    const userId = envUserId || fallbackUser.id
    const userName = envUserName || fallbackUser.name
    if (!userId) return {}

    return {
      'x-workflow-user-id': encodeWorkflowHeaderValue(userId),
      'x-workflow-user-name': encodeWorkflowHeaderValue(userName || FALLBACK_WORKFLOW_USER_NAME),
    }
  }

  private async request(path: string, options?: RequestInit, allowNotFound = false) {
    let response: Response
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...createWorkflowApiAuthHeaders(),
          ...this.resolveWorkflowHeaders(),
          ...options?.headers,
        },
      })
    } catch (error) {
      throw buildRequestErrorFromUnknown(error, {
        fallbackMessage: '工作流存储请求失败，请稍后重试',
        networkErrorMessage: '工作流存储请求失败，请检查网络连接后重试',
      })
    }
    if (allowNotFound && response.status === 404) return null
    if (!response.ok) {
      throw await buildRequestErrorFromResponse(response, {
        fallbackMessage: '工作流存储请求失败，请稍后重试',
      })
    }
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
