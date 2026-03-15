import type { ExecutionRecord, IStorageProvider, SavedWorkflow } from './types'

export class LocalStorageProvider implements IStorageProvider {
  private workflowKey = 'saved_workflows'
  private historyKey = 'execution_history_fallback'
  private dbName = 'WorkflowSystemDB'
  private storeName = 'execution_history'
  private version = 1
  private db: IDBDatabase | null = null

  async getWorkflows(): Promise<SavedWorkflow[]> {
    const raw = localStorage.getItem(this.workflowKey)
    return raw ? JSON.parse(raw) : []
  }

  async getWorkflow(id: string): Promise<SavedWorkflow | null> {
    const workflows = await this.getWorkflows()
    return workflows.find((workflow) => workflow.id === id) || null
  }

  async saveWorkflow(workflow: SavedWorkflow): Promise<void> {
    const workflows = await this.getWorkflows()
    const updated = workflows.filter((item) => item.id !== workflow.id).concat(workflow)
    localStorage.setItem(this.workflowKey, JSON.stringify(updated))
  }

  async deleteWorkflow(id: string): Promise<void> {
    const workflows = await this.getWorkflows()
    const filtered = workflows.filter((workflow) => workflow.id !== id)
    localStorage.setItem(this.workflowKey, JSON.stringify(filtered))
  }

  private canUseIndexedDB() {
    return typeof indexedDB !== 'undefined'
  }

  private getLocalHistory(): ExecutionRecord[] {
    const raw = localStorage.getItem(this.historyKey)
    const records = raw ? (JSON.parse(raw) as ExecutionRecord[]) : []
    return records.sort((a, b) => (b.startTime || 0) - (a.startTime || 0))
  }

  private saveLocalHistory(records: ExecutionRecord[]) {
    localStorage.setItem(this.historyKey, JSON.stringify(records))
  }

  private async getDB(): Promise<IDBDatabase> {
    if (!this.canUseIndexedDB()) {
      throw new Error('IndexedDB unavailable')
    }

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
    if (!this.canUseIndexedDB()) {
      const history = this.getLocalHistory().filter((item) => item.id !== record.id)
      const limitedHistory = [record, ...history].slice(0, limit)
      this.saveLocalHistory(limitedHistory)
      return limitedHistory
    }

    const db = await this.getDB()
    const history = await this.getAllHistory()

    history.unshift(record)
    const limitedHistory = history.slice(0, limit)
    const idsToKeep = new Set(limitedHistory.map((item) => item.id))

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], 'readwrite')
      const store = transaction.objectStore(this.storeName)

      store.put(record)

      const cursorRequest = store.openCursor()
      cursorRequest.onsuccess = (event: Event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>).result
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
    if (!this.canUseIndexedDB()) {
      return this.getLocalHistory()
    }

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
    if (!this.canUseIndexedDB()) {
      localStorage.removeItem(this.historyKey)
      return
    }

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
