/**
 * 基于 IndexedDB 的异步存储工具类，用于存储大型数据对象 (如包含 Base64 图片的工作流历史记录)
 */
export class HistoryDB {
  private dbName = 'WorkflowSystemDB'
  private storeName = 'execution_history'
  private version = 1
  private db: IDBDatabase | null = null

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

  async saveHistory(record: any, limit = 20): Promise<any[]> {
    const db = await this.getDB()
    const history = await this.getAllHistory()

    // 添加新记录到开头
    history.unshift(record)
    const limitedHistory = history.slice(0, limit)
    const idsToKeep = new Set(limitedHistory.map((r) => r.id))

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], 'readwrite')
      const store = transaction.objectStore(this.storeName)

      // 写入新记录
      store.put(record)

      // 清理超过限制的老记录
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

  async getAllHistory(): Promise<any[]> {
    const db = await this.getDB()
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], 'readonly')
      const store = transaction.objectStore(this.storeName)
      const request = store.getAll()

      request.onsuccess = () => {
        // 按 startTime 倒序排序
        const result = request.result.sort((a, b) => (b.startTime || 0) - (a.startTime || 0))
        resolve(result)
      }
      request.onerror = () => reject(request.error)
    })
  }

  async clearAll(): Promise<void> {
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

export const historyDB = new HistoryDB()
