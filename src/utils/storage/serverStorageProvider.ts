import type { IStorageProvider, SavedWorkflow, ExecutionRecord } from './types'

/**
 * 服务器存储驱动实现 (Stub)
 * 后续只需对接真实的后端 API 即可投入生产环境使用
 */
export class ServerStorageProvider implements IStorageProvider {
  private baseUrl = import.meta.env.VITE_API_BASE_URL || '/api'

  private async request(path: string, options?: RequestInit) {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    })
    if (!response.ok) throw new Error(`Server Storage Error: ${response.statusText}`)
    return response.json()
  }

  async getWorkflows(): Promise<SavedWorkflow[]> {
    console.log('[ServerStorage] Fetching all workflows...')
    return this.request('/workflows')
  }

  async getWorkflow(id: string): Promise<SavedWorkflow | null> {
    console.log(`[ServerStorage] Fetching workflow: ${id}`)
    return this.request(`/workflows/${id}`)
  }

  async saveWorkflow(workflow: SavedWorkflow): Promise<void> {
    console.log(`[ServerStorage] Saving workflow: ${workflow.id}`)
    await this.request('/workflows', {
      method: 'POST',
      body: JSON.stringify(workflow),
    })
  }

  async deleteWorkflow(id: string): Promise<void> {
    console.log(`[ServerStorage] Deleting workflow: ${id}`)
    await this.request(`/workflows/${id}`, { method: 'DELETE' })
  }

  async saveHistory(record: ExecutionRecord, limit = 20): Promise<ExecutionRecord[]> {
    console.log('[ServerStorage] Saving execution history...')
    return this.request('/history', {
      method: 'POST',
      body: JSON.stringify({ record, limit }),
    })
  }

  async getAllHistory(): Promise<ExecutionRecord[]> {
    console.log('[ServerStorage] Fetching history...')
    return this.request('/history')
  }

  async clearAllHistory(): Promise<void> {
    console.log('[ServerStorage] Clearing history...')
    await this.request('/history', { method: 'DELETE' })
  }
}
