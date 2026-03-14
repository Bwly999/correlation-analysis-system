import type {
  IStorageProvider,
  SavedWorkflow,
  ExecutionRecord,
} from './types'

/**
 * 默认的本地存储提供者，结合了 localStorage (工作流) 和 IndexedDB (执行历史)
 */
export class LocalStorageProvider implements IStorageProvider {
  private workflowKey = 'saved_workflows'
  private dbName = 'WorkflowSystemDB'
  private storeName = 'execution_history'
  private version = 1
  private db: IDBDatabase | null = null

  // --- 工作流 (localStorage) 实现 ---

  async getWorkflows(): Promise<SavedWorkflow[]> {
    const raw = localStorage.getItem(this.workflowKey)
    return raw ? JSON.parse(raw) : []
  }

  async getWorkflow(id: string): Promise<SavedWorkflow | null> {
    const workflows = await this.getWorkflows()
    return workflows.find((w) => w.id === id) || null
  }

  async saveWorkflow(workflow: SavedWorkflow): Promise<void> {
    const workflows = await this.getWorkflows()
    const updated = workflows.filter((w) => w.id !== workflow.id).concat(workflow)
    localStorage.setItem(this.workflowKey, JSON.stringify(updated))
  }

  async deleteWorkflow(id: string): Promise<void> {
    const workflows = await this.getWorkflows()
    const filtered = workflows.filter((w) => w.id !== id)
    localStorage.setItem(this.workflowKey, JSON.stringify(filtered))
  }

  // --- 执行历史 (IndexedDB) 实现 ---

  private async getDB(): Promise<IDBDatabase> {
    if (this.db) return this.db

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version)

      request.onupgradeneeded = () => {
        const db = request.result
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName, { keyPath: 'id' })
        }
      }

      request.onsuccess = () => {
        this.db = request.result
        resolve(this.db)
      }

      request.onerror = () => reject(request.error)
    })
  }

  async saveHistory(record: ExecutionRecord, limit = 20): Promise<ExecutionRecord[]> {
    const db = await this.getDB()
    const history = await this.getAllHistory()

    history.unshift(record)
    const limitedHistory = history.slice(0, limit)
    const idsToKeep = new Set(limitedHistory.map((r) => r.id))

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], 'readwrite')
      const store = transaction.objectStore(this.storeName)

      store.put(record)

      const cursorRequest = store.openCursor()
      cursorRequest.onsuccess = (event: any) => {
        const cursor = event.target.result
        if (cursor) {
          if (!idsToKeep.has(cursor.value.id)) {
            cursor.delete()
          }
          cursor.continue()
        }
      }

      transaction.oncomplete = () => resolve(limitedHistory)
      transaction.onerror = () => reject(transaction.error)
    })
  }

  async getAllHistory(): Promise<ExecutionRecord[]> {
    const db = await this.getDB()
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], 'readonly')
      const store = transaction.objectStore(this.storeName)
      const request = store.getAll()

      request.onsuccess = () => {
        const result = (request.result as ExecutionRecord[]).sort(
          (a, b) => (b.startTime || 0) - (a.startTime || 0),
        )
        resolve(result)
      }
      request.onerror = () => reject(request.error)
    })
  }

  async clearAllHistory(): Promise<void> {
    const db = await this.getDB()
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], 'readwrite')
      const store = transaction.objectStore(this.storeName)
      const request = store.clear()
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }
}
