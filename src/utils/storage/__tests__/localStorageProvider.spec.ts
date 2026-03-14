import { describe, it, expect, beforeEach, vi } from 'vitest'
import { LocalStorageProvider } from '../localStorageProvider'
import { type SavedWorkflow, type ExecutionRecord } from '../types'

describe('LocalStorageProvider', () => {
  let provider: LocalStorageProvider

  // 模拟一个功能完整的 Mock IDBRequest
  const createMockRequest = (result: any = null) => {
    const req: any = { result }
    setTimeout(() => {
      if (req.onsuccess) req.onsuccess({ target: req })
    }, 0)
    return req
  }

  beforeEach(() => {
    localStorage.clear()
    provider = new LocalStorageProvider()

    // 深度模拟 IndexedDB API 以测试 History 逻辑
    vi.spyOn(provider as any, 'getDB').mockImplementation(async () => {
      const mockStore = {
        put: vi.fn().mockImplementation(() => createMockRequest()),
        getAll: vi.fn().mockImplementation(() => createMockRequest([])),
        clear: vi.fn().mockImplementation(() => createMockRequest()),
        openCursor: vi.fn().mockImplementation(() => createMockRequest(null)),
      }

      const mockTransaction = {
        objectStore: () => mockStore,
        oncomplete: null as any,
        onerror: null as any,
      }

      // 模拟事务提交
      setTimeout(() => {
        if (mockTransaction.oncomplete) mockTransaction.oncomplete()
      }, 5)

      return {
        transaction: () => mockTransaction,
      }
    })
  })

  describe('Workflow Persistence (localStorage)', () => {
    const mockWorkflow: SavedWorkflow = {
      id: 'wf_1',
      name: 'Test Workflow',
      updatedAt: Date.now(),
      nodes: [],
      edges: [],
    }

    it('should save and retrieve a workflow', async () => {
      await provider.saveWorkflow(mockWorkflow)
      const result = await provider.getWorkflow('wf_1')
      expect(result).toEqual(mockWorkflow)
    })

    it('should delete a workflow', async () => {
      await provider.saveWorkflow(mockWorkflow)
      await provider.deleteWorkflow('wf_1')
      const list = await provider.getWorkflows()
      expect(list.length).toBe(0)
    })
  })

  describe('Execution History (IndexedDB Abstraction)', () => {
    const mockRecord: ExecutionRecord = {
      id: 'exec_1',
      workflowId: 'wf_1',
      workflowName: 'Test',
      startTime: Date.now(),
      duration: 100,
      status: 'success',
      nodes: [],
      edges: [],
    }

    it('should call saveHistory without crashing', async () => {
      // 验证在模拟环境下逻辑链路是通的
      const result = await provider.saveHistory(mockRecord)
      expect(Array.isArray(result)).toBe(true)
    })

    it('should call getAllHistory and return a list', async () => {
      const history = await provider.getAllHistory()
      expect(Array.isArray(history)).toBe(true)
    })

    it('should call clearAllHistory', async () => {
      await expect(provider.clearAllHistory()).resolves.toBeUndefined()
    })
  })
})
