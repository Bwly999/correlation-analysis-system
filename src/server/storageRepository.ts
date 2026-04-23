import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { Low } from 'lowdb'
import { JSONFile } from 'lowdb/node'

export type UserHistoryDocument<TRecord> = {
  records: TRecord[]
}

export type UserWorkflowDocument<TWorkflow, TVersion> = {
  current: TWorkflow | null
  versions: TVersion[]
}

export interface WorkflowStorageRepository<TWorkflow, TVersion, THistoryRecord> {
  listWorkflowDocuments(userId: string): Promise<Array<UserWorkflowDocument<TWorkflow, TVersion>>>
  readWorkflowDocument(userId: string, workflowId: string): Promise<UserWorkflowDocument<TWorkflow, TVersion>>
  writeWorkflowDocument(
    userId: string,
    workflowId: string,
    updater: (
      document: UserWorkflowDocument<TWorkflow, TVersion>,
    ) => Promise<UserWorkflowDocument<TWorkflow, TVersion>> | UserWorkflowDocument<TWorkflow, TVersion>,
  ): Promise<UserWorkflowDocument<TWorkflow, TVersion>>
  deleteWorkflowDocument(userId: string, workflowId: string): Promise<boolean>
  readHistoryDocument(userId: string): Promise<UserHistoryDocument<THistoryRecord>>
  writeHistoryDocument(
    userId: string,
    updater: (
      document: UserHistoryDocument<THistoryRecord>,
    ) => Promise<UserHistoryDocument<THistoryRecord>> | UserHistoryDocument<THistoryRecord>,
  ): Promise<UserHistoryDocument<THistoryRecord>>
}

const DEFAULT_STORAGE_DIR = join(process.cwd(), '.workflow-storage')

const cloneJson = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

const ensureParentDir = (filePath: string) => {
  mkdirSync(dirname(filePath), { recursive: true })
}

const encodePathSegment = (value: string) => encodeURIComponent(value)

const resolveStorageDir = () => process.env.WORKFLOW_STORAGE_DATA_DIR?.trim() || DEFAULT_STORAGE_DIR

const createLowDb = async <T>(filePath: string, defaultData: T) => {
  ensureParentDir(filePath)
  const adapter = new JSONFile<T>(filePath)
  const db = new Low<T>(adapter, cloneJson(defaultData))
  await db.read()
  db.data ||= cloneJson(defaultData)
  return db
}

export class LowDbWorkflowStorageRepository<TWorkflow, TVersion, THistoryRecord>
  implements WorkflowStorageRepository<TWorkflow, TVersion, THistoryRecord> {
  private userWriteQueues = new Map<string, Promise<unknown>>()

  private getUserDir(userId: string) {
    return join(resolveStorageDir(), encodePathSegment(userId))
  }

  private getWorkflowFilePath(userId: string, workflowId: string) {
    return join(
      this.getUserDir(userId),
      'workflows',
      `${encodePathSegment(workflowId)}.json`,
    )
  }

  private getHistoryFilePath(userId: string) {
    return join(this.getUserDir(userId), 'history.json')
  }

  async listWorkflowDocuments(userId: string): Promise<Array<UserWorkflowDocument<TWorkflow, TVersion>>> {
    const { existsSync, readdirSync } = await import('node:fs')
    const workflowDir = join(this.getUserDir(userId), 'workflows')

    if (!existsSync(workflowDir)) return []

    const fileNames = readdirSync(workflowDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
      .map((entry) => entry.name)

    const documents = await Promise.all(
      fileNames.map((fileName) =>
        this.readWorkflowDocumentByPath(join(workflowDir, fileName))),
    )

    return documents
  }

  async readWorkflowDocument(userId: string, workflowId: string): Promise<UserWorkflowDocument<TWorkflow, TVersion>> {
    return this.readWorkflowDocumentByPath(this.getWorkflowFilePath(userId, workflowId))
  }

  async writeWorkflowDocument(
    userId: string,
    workflowId: string,
    updater: (document: UserWorkflowDocument<TWorkflow, TVersion>) => Promise<UserWorkflowDocument<TWorkflow, TVersion>> | UserWorkflowDocument<TWorkflow, TVersion>,
  ): Promise<UserWorkflowDocument<TWorkflow, TVersion>> {
    return this.withUserWriteLock(userId, async () => {
      const filePath = this.getWorkflowFilePath(userId, workflowId)
      const db = await createLowDb<UserWorkflowDocument<TWorkflow, TVersion>>(filePath, {
        current: null,
        versions: [],
      })
      db.data = cloneJson(await updater(cloneJson(db.data)))
      await db.write()
      return cloneJson(db.data)
    })
  }

  async deleteWorkflowDocument(userId: string, workflowId: string): Promise<boolean> {
    return this.withUserWriteLock(userId, async () => {
      const { existsSync, rmSync } = await import('node:fs')
      const filePath = this.getWorkflowFilePath(userId, workflowId)
      if (!existsSync(filePath)) return false
      rmSync(filePath)
      return true
    })
  }

  async readHistoryDocument(userId: string): Promise<UserHistoryDocument<THistoryRecord>> {
    const db = await createLowDb<UserHistoryDocument<THistoryRecord>>(this.getHistoryFilePath(userId), {
      records: [],
    })
    return cloneJson(db.data)
  }

  async writeHistoryDocument(
    userId: string,
    updater: (document: UserHistoryDocument<THistoryRecord>) => Promise<UserHistoryDocument<THistoryRecord>> | UserHistoryDocument<THistoryRecord>,
  ): Promise<UserHistoryDocument<THistoryRecord>> {
    return this.withUserWriteLock(userId, async () => {
      const filePath = this.getHistoryFilePath(userId)
      const db = await createLowDb<UserHistoryDocument<THistoryRecord>>(filePath, {
        records: [],
      })
      db.data = cloneJson(await updater(cloneJson(db.data)))
      await db.write()
      return cloneJson(db.data)
    })
  }

  private async readWorkflowDocumentByPath(filePath: string): Promise<UserWorkflowDocument<TWorkflow, TVersion>> {
    const db = await createLowDb<UserWorkflowDocument<TWorkflow, TVersion>>(filePath, {
      current: null,
      versions: [],
    })
    return cloneJson(db.data)
  }

  private async withUserWriteLock<T>(userId: string, handler: () => Promise<T>): Promise<T> {
    const previous = this.userWriteQueues.get(userId) ?? Promise.resolve()
    let nextOperation: Promise<T> | null = null

    nextOperation = previous
      .catch(() => undefined)
      .then(handler)
      .finally(() => {
        if (this.userWriteQueues.get(userId) === nextOperation) {
          this.userWriteQueues.delete(userId)
        }
      })

    this.userWriteQueues.set(userId, nextOperation)
    return nextOperation
  }
}
