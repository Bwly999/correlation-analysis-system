import type {
  ExecutionRecord,
  IStorageProvider,
  SavedWorkflow,
  WorkflowRollbackResult,
  WorkflowVersionDetail,
  WorkflowVersionMetadata,
  WorkflowVersionSource,
} from './types'

export class LocalStorageProvider implements IStorageProvider {
  private workflowKey = 'saved_workflows'
  private workflowVersionKey = 'workflow_versions'
  private historyKey = 'execution_history_fallback'
  private dbName = 'WorkflowSystemDB'
  private workflowStoreName = 'workflows'
  private historyStoreName = 'execution_history'
  private version = 2
  private db: IDBDatabase | null = null
  private workflowMigrationPromise: Promise<void> | null = null

  async getCurrentUser() {
    return null
  }

  private cloneJson<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T
  }

  private createWorkflowVersionId() {
    return `wfver_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  }

  private getLocalWorkflows(): SavedWorkflow[] {
    const raw = localStorage.getItem(this.workflowKey)
    return raw ? (JSON.parse(raw) as SavedWorkflow[]) : []
  }

  private saveLocalWorkflows(workflows: SavedWorkflow[]) {
    localStorage.setItem(this.workflowKey, JSON.stringify(workflows))
  }

  private getLocalWorkflowVersions(): WorkflowVersionDetail[] {
    const raw = localStorage.getItem(this.workflowVersionKey)
    return raw ? (JSON.parse(raw) as WorkflowVersionDetail[]) : []
  }

  private saveLocalWorkflowVersions(versions: WorkflowVersionDetail[]) {
    localStorage.setItem(this.workflowVersionKey, JSON.stringify(versions))
  }

  private createWorkflowVersion(
    workflow: SavedWorkflow,
    source: WorkflowVersionSource,
  ): WorkflowVersionDetail {
    return {
      id: this.createWorkflowVersionId(),
      workflowId: workflow.id,
      workflowName: workflow.name,
      createdAt: Date.now(),
      workflowUpdatedAt: workflow.updatedAt,
      source,
      workflow: this.cloneJson(workflow),
    }
  }

  private recordWorkflowVersion(
    workflow: SavedWorkflow,
    source: WorkflowVersionSource,
  ): WorkflowVersionMetadata {
    const versions = this.getLocalWorkflowVersions()
    const version = this.createWorkflowVersion(workflow, source)
    this.saveLocalWorkflowVersions([version, ...versions])
    const { workflow: _workflow, ...metadata } = version
    return metadata
  }

  private removeWorkflowVersions(workflowId: string) {
    const versions = this.getLocalWorkflowVersions().filter((item) => item.workflowId !== workflowId)
    this.saveLocalWorkflowVersions(versions)
  }

  private canUseIndexedDB() {
    return typeof indexedDB !== 'undefined'
  }

  private async getWorkflowStore(mode: IDBTransactionMode) {
    const db = await this.getDB()
    return db.transaction([this.workflowStoreName], mode).objectStore(this.workflowStoreName)
  }

  private async migrateLegacyWorkflowsToIndexedDB(): Promise<void> {
    if (!this.canUseIndexedDB()) return
    if (this.workflowMigrationPromise) return this.workflowMigrationPromise

    const legacyWorkflows = this.getLocalWorkflows()
    if (legacyWorkflows.length === 0) return

    this.workflowMigrationPromise = new Promise<void>((resolve, reject) => {
      this.getDB()
        .then((db) => {
        const transaction = db.transaction([this.workflowStoreName], 'readwrite')
        const store = transaction.objectStore(this.workflowStoreName)

        legacyWorkflows.forEach((workflow) => store.put(workflow))

        transaction.oncomplete = () => {
          localStorage.removeItem(this.workflowKey)
          resolve()
        }
        transaction.onerror = () => reject(transaction.error)
        })
        .catch(reject)
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

  private async persistWorkflowSnapshot(workflow: SavedWorkflow): Promise<void> {
    if (!this.canUseIndexedDB()) {
      const workflows = this.getLocalWorkflows()
      const updated = workflows.filter((item) => item.id !== workflow.id).concat(this.cloneJson(workflow))
      this.saveLocalWorkflows(updated)
      return
    }

    await this.migrateLegacyWorkflowsToIndexedDB()

    try {
      const store = await this.getWorkflowStore('readwrite')
      await new Promise<void>((resolve, reject) => {
        const request = store.put(this.cloneJson(workflow))
        request.onsuccess = () => resolve()
        request.onerror = () => reject(request.error)
      })
    } catch (_error) {
      const workflows = this.getLocalWorkflows()
      const updated = workflows.filter((item) => item.id !== workflow.id).concat(this.cloneJson(workflow))
      this.saveLocalWorkflows(updated)
    }
  }

  async saveWorkflow(workflow: SavedWorkflow): Promise<void> {
    const normalizedWorkflow = this.cloneJson(workflow)
    await this.persistWorkflowSnapshot(normalizedWorkflow)
    this.recordWorkflowVersion(normalizedWorkflow, 'save')
  }

  async deleteWorkflow(id: string): Promise<void> {
    if (!this.canUseIndexedDB()) {
      const workflows = this.getLocalWorkflows()
      const filtered = workflows.filter((workflow) => workflow.id !== id)
      this.saveLocalWorkflows(filtered)
      this.removeWorkflowVersions(id)
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

    this.removeWorkflowVersions(id)
  }

  async getWorkflowVersions(workflowId: string): Promise<WorkflowVersionMetadata[]> {
    return this.getLocalWorkflowVersions()
      .filter((version) => version.workflowId === workflowId)
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((version) => {
        const { workflow, ...metadata } = this.cloneJson(version)
        return metadata
      })
  }

  async getWorkflowVersion(workflowId: string, versionId: string): Promise<WorkflowVersionDetail | null> {
    const version = this.getLocalWorkflowVersions().find(
        (version) => version.workflowId === workflowId && version.id === versionId,
      ) ?? null
    return version ? this.cloneJson(version) : null
  }

  async rollbackWorkflowVersion(workflowId: string, versionId: string): Promise<WorkflowRollbackResult | null> {
    const targetVersion = await this.getWorkflowVersion(workflowId, versionId)
    if (!targetVersion) return null

    const restoredWorkflow: SavedWorkflow = {
      ...this.cloneJson(targetVersion.workflow),
      updatedAt: Date.now(),
    }

    await this.persistWorkflowSnapshot(restoredWorkflow)
    const rollbackVersion = this.recordWorkflowVersion(restoredWorkflow, 'rollback')

    return {
      workflow: restoredWorkflow,
      version: rollbackVersion,
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
