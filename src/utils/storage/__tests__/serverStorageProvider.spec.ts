import { describe, it, expect, vi } from 'vitest'
import { type IStorageProvider, type SavedWorkflow, type StorageUser } from '../types'

/**
 * 这是一个用于演示的 Mock Server Provider
 * 它模拟了未来通过 Axios/Fetch 调用后端 API 的行为
 */
class MockServerStorageProvider implements IStorageProvider {
  async getCurrentUser(): Promise<StorageUser | null> {
    return { id: 'user_1', name: '测试用户' }
  }

  async getWorkflows(): Promise<SavedWorkflow[]> {
    // 模拟 API 请求
    return [{ id: 'server_wf', name: 'Cloud Workflow', updatedAt: 123, nodes: [], edges: [] }]
  }
  async getWorkflow(id: string): Promise<SavedWorkflow | null> {
    return { id, name: 'Cloud Workflow', updatedAt: 123, nodes: [], edges: [] }
  }
  async saveWorkflow(workflow: SavedWorkflow): Promise<void> {
    // 模拟 POST /workflows
    console.log('Saved to server:', workflow.id)
  }
  async deleteWorkflow(id: string): Promise<void> {
    // 模拟 DELETE /workflows/:id
    console.log('Deleted from server:', id)
  }
  async getWorkflowVersions(): Promise<any[]> {
    return []
  }
  async getWorkflowVersion(): Promise<any> {
    return null
  }
  async rollbackWorkflowVersion(): Promise<any> {
    return null
  }
  async saveHistory(): Promise<any[]> {
    return []
  }
  async getHistorySummaries(): Promise<any[]> {
    return []
  }
  async getHistoryRecord(): Promise<any> {
    return null
  }
  async clearAllHistory(): Promise<void> {}
}

describe('Storage Abstraction Extensibility', () => {
  it('should allow plugging in a server-based provider', async () => {
    const serverProvider: IStorageProvider = new MockServerStorageProvider()
    await expect(serverProvider.getCurrentUser()).resolves.toEqual({
      id: 'user_1',
      name: '测试用户',
    })

    const workflows = await serverProvider.getWorkflows()
    expect(workflows.length).toBe(1)
    expect(workflows[0]?.name).toBe('Cloud Workflow')

    const saveSpy = vi.spyOn(serverProvider, 'saveWorkflow')
    await serverProvider.saveWorkflow({
      id: 'new',
      name: 'New',
      updatedAt: 0,
      nodes: [],
      edges: [],
    })
    expect(saveSpy).toHaveBeenCalled()
  })
})
