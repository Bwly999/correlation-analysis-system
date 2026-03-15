import type { ExecutionRecord, IStorageProvider, SavedWorkflow } from './types'

export class LocalStorageProvider implements IStorageProvider {
  private workflowKey = 'saved_workflows'
  private historyKey = 'execution_history_fallback'
  private dbName = 'WorkflowSystemDB'
  private workflowStoreName = 'workflows'
  private historyStoreName = 'execution_history'
  private version = 2
  private db: IDBDatabase | null = null
  private workflowMigrationPromise: Promise<void> | null = null

  private getLocalWorkflows(): SavedWorkflow[] {
    const raw = localStorage.getItem(this.workflowKey)
    return raw ? (JSON.parse(raw) as SavedWorkflow[]) : []
  }

  private saveLocalWorkflows(workflows: SavedWorkflow[]) {
    localStorage.setItem(this.workflowKey, JSON.stringify(workflows))
  }

  private canUseIndexedDB() {
    return typeof indexedDB !== 'undefined'
  }

  private async getWorkflowStore(mode: IDBTransactionMode) {
    const db = await this.getDB()
    return db.transaction([this.workflowStoreName], mode).objectStore(this.workflowStoreName)
  }

  private async migrateLegacyWorkflowsToIndexedDB() {
    if (!this.canUseIndexedDB()) return
    if (this.workflowMigrationPromise) return this.workflowMigrationPromise

    const legacyWorkflows = this.getLocalWorkflows()
    if (legacyWorkflows.length === 0) return

    this.workflowMigrationPromise = new Promise(async (resolve, reject) => {
      try {
        const db = await this.getDB()
        const transaction = db.transaction([this.workflowStoreName], 'readwrite')
        const store = transaction.objectStore(this.workflowStoreName)

        legacyWorkflows.forEach((workflow) => store.put(workflow))

        transaction.oncomplete = () => {
          localStorage.removeItem(this.workflowKey)
          resolve()
        }
        transaction.onerror = () => reject(transaction.error)
      } catch (error) {
        reject(error)
      }
    }).finally(() => {
      this.workflowMigrationPromise = null
    })

    return this.workflowMigrationPromise
  }

  async getWorkflows(): Promise<SavedWorkflow[]> {
    if (!this.canUseIndexedDB()) {
      return this.getLocalWorkflows()
    }

    await this.migrateLegacyWorkflowsToIndexedDB()

    try {
      const store = await this.getWorkflowStore('readonly')
      return await new Promise((resolve, reject) => {
        const request = store.getAll()

        request.onsuccess = () => {
          const workflows = (request.result as SavedWorkflow[]) || []
          resolve(workflows)
        }

        request.onerror = () => reject(request.error)
      })
    } catch (_error) {
      return this.getLocalWorkflows()
    }
  }

  async getWorkflow(id: string): Promise<SavedWorkflow | null> {
    if (!this.canUseIndexedDB()) {
      const workflows = this.getLocalWorkflows()
      return workflows.find((workflow) => workflow.id === id) || null
    }

    await this.migrateLegacyWorkflowsToIndexedDB()

    try {
      const store = await this.getWorkflowStore('readonly')
      return await new Promise((resolve, reject) => {
        const request = store.get(id)

        request.onsuccess = () => resolve((request.result as SavedWorkflow | null) || null)
        request.onerror = () => reject(request.error)
      })
    } catch (_error) {
      const workflows = this.getLocalWorkflows()
      return workflows.find((workflow) => workflow.id === id) || null
    }
  }

  async saveWorkflow(workflow: SavedWorkflow): Promise<void> {
    if (!this.canUseIndexedDB()) {
      const workflows = this.getLocalWorkflows()
      const updated = workflows.filter((item) => item.id !== workflow.id).concat(workflow)
      this.saveLocalWorkflows(updated)
      return
    }

    await this.migrateLegacyWorkflowsToIndexedDB()

    try {
      const store = await this.getWorkflowStore('readwrite')
      await new Promise<void>((resolve, reject) => {
        const request = store.put(workflow)
        request.onsuccess = () => resolve()
        request.onerror = () => reject(request.error)
      })
    } catch (_error) {
      const workflows = this.getLocalWorkflows()
      const updated = workflows.filter((item) => item.id !== workflow.id).concat(workflow)
      this.saveLocalWorkflows(updated)
    }
  }

  async deleteWorkflow(id: string): Promise<void> {
    if (!this.canUseIndexedDB()) {
      const workflows = this.getLocalWorkflows()
      const filtered = workflows.filter((workflow) => workflow.id !== id)
      this.saveLocalWorkflows(filtered)
      return
    }

    await this.migrateLegacyWorkflowsToIndexedDB()

    try {
      const store = await this.getWorkflowStore('readwrite')
      await new Promise<void>((resolve, reject) => {
        const request = store.delete(id)
        request.onsuccess = () => resolve()
        request.onerror = () => reject(request.error)
      })
    } catch (_error) {
      const workflows = this.getLocalWorkflows()
      const filtered = workflows.filter((workflow) => workflow.id !== id)
      this.saveLocalWorkflows(filtered)
    }
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
        if (!db.objectStoreNames.contains(this.workflowStoreName)) {
          db.createObjectStore(this.workflowStoreName, { keyPath: 'id' })
        }
        if (!db.objectStoreNames.contains(this.historyStoreName)) {
          db.createObjectStore(this.historyStoreName, { keyPath: 'id' })
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
      const transaction = db.transaction([this.historyStoreName], 'readwrite')
      const store = transaction.objectStore(this.historyStoreName)

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
      const transaction = db.transaction([this.historyStoreName], 'readonly')
      const store = transaction.objectStore(this.historyStoreName)
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
      const transaction = db.transaction([this.historyStoreName], 'readwrite')
      const store = transaction.objectStore(this.historyStoreName)
      const request = store.clear()

      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }
}
