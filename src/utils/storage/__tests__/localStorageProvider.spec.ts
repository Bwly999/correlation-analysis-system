import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LocalStorageProvider } from '../localStorageProvider'
import { type ExecutionRecord, type SavedWorkflow } from '../types'

describe('LocalStorageProvider', () => {
  let provider: LocalStorageProvider
  let workflowRecords: SavedWorkflow[]
  let historyRecords: ExecutionRecord[]

  const createMockRequest = (result: unknown = null) => {
    const request: any = { result }
    setTimeout(() => {
      if (request.onsuccess) request.onsuccess({ target: request })
    }, 0)
    return request
  }

  beforeEach(() => {
    localStorage.clear()
    vi.unstubAllGlobals()

    provider = new LocalStorageProvider()
    workflowRecords = []
    historyRecords = []

    vi.stubGlobal('indexedDB', {})

    vi.spyOn(provider as any, 'getDB').mockImplementation(async () => {
      const workflowStore = {
        put: vi.fn().mockImplementation((record: SavedWorkflow) => {
          workflowRecords = workflowRecords.filter((item) => item.id !== record.id).concat(record)
          return createMockRequest(record)
        }),
        getAll: vi.fn().mockImplementation(() => createMockRequest([...workflowRecords])),
        get: vi.fn().mockImplementation((id: string) => {
          const record = workflowRecords.find((item) => item.id === id) ?? null
          return createMockRequest(record)
        }),
        delete: vi.fn().mockImplementation((id: string) => {
          workflowRecords = workflowRecords.filter((item) => item.id !== id)
          return createMockRequest()
        }),
      }

      const historyStore = {
        put: vi.fn().mockImplementation((record: ExecutionRecord) => {
          historyRecords = historyRecords.filter((item) => item.id !== record.id)
          historyRecords.unshift(record)
          return createMockRequest(record)
        }),
        getAll: vi.fn().mockImplementation(() => createMockRequest([...historyRecords])),
        clear: vi.fn().mockImplementation(() => {
          historyRecords = []
          return createMockRequest()
        }),
        openCursor: vi.fn().mockImplementation(() => createMockRequest(null)),
      }

      const transaction = {
        objectStore: (name: string) => (name === 'workflows' ? workflowStore : historyStore),
        oncomplete: null as null | (() => void),
        onerror: null as null | (() => void),
      }

      setTimeout(() => {
        if (transaction.oncomplete) transaction.oncomplete()
      }, 5)

      return {
        transaction: () => transaction,
      }
    })
  })

  describe('Workflow Persistence', () => {
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
      expect(list).toHaveLength(0)
    })

    it('should save workflows to IndexedDB when localStorage quota is exceeded', async () => {
      const originalSetItem = Storage.prototype.setItem
      const quotaError = new DOMException(
        "Failed to execute 'setItem' on 'Storage': Setting the value of 'saved_workflows' exceeded the quota.",
        'QuotaExceededError',
      )

      const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
        this: Storage,
        key: string,
        value: string,
      ) {
        if (key === 'saved_workflows') throw quotaError
        return originalSetItem.call(this, key, value)
      })

      await expect(provider.saveWorkflow(mockWorkflow)).resolves.toBeUndefined()
      await expect(provider.getWorkflow(mockWorkflow.id)).resolves.toEqual(mockWorkflow)

      setItemSpy.mockRestore()
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
