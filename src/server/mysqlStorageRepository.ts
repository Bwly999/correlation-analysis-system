import type {
  UserHistoryDocument,
  UserWorkflowDocument,
  WorkflowStorageRepository,
} from './storageRepository.js'
import {
  createMysqlStorageDb,
  createMysqlStoragePool,
  readMysqlStorageConfigFromEnv,
  type MysqlStorageConfig,
} from './storageDb/mysql/client.js'
import { ensureMysqlStorageSchemaReady } from './storageDb/mysql/migrator.js'
import {
  assertMysqlStorageDatabaseExists as assertMysqlStorageDatabaseExistsByPool,
  deleteWorkflowDocument,
  listWorkflowDocuments,
  readHistoryDocument,
  readWorkflowDocument,
  writeHistoryDocument,
  writeWorkflowDocument,
} from './storageDb/mysql/repositories.js'

export class MysqlWorkflowStorageRepository<
  TWorkflow,
  TVersion,
  THistoryRecord,
> implements WorkflowStorageRepository<TWorkflow, TVersion, THistoryRecord> {
  private readonly config: MysqlStorageConfig

  private readonly pool

  private readonly db

  private schemaReadyPromise: Promise<void> | null = null

  constructor(config = readMysqlStorageConfigFromEnv()) {
    this.config = config
    this.pool = createMysqlStoragePool(config)
    this.db = createMysqlStorageDb(this.pool)
  }

  async listWorkflowDocuments(userId: string): Promise<Array<UserWorkflowDocument<TWorkflow, TVersion>>> {
    await this.ensureSchema()
    return listWorkflowDocuments<TWorkflow, TVersion>(this.db, userId)
  }

  async readWorkflowDocument(userId: string, workflowId: string): Promise<UserWorkflowDocument<TWorkflow, TVersion>> {
    await this.ensureSchema()
    return readWorkflowDocument<TWorkflow, TVersion>(this.db, userId, workflowId)
  }

  async writeWorkflowDocument(
    userId: string,
    workflowId: string,
    updater: (
      document: UserWorkflowDocument<TWorkflow, TVersion>,
    ) => Promise<UserWorkflowDocument<TWorkflow, TVersion>> | UserWorkflowDocument<TWorkflow, TVersion>,
  ): Promise<UserWorkflowDocument<TWorkflow, TVersion>> {
    await this.ensureSchema()
    return writeWorkflowDocument<any, any>(this.db, userId, workflowId, updater as any) as Promise<UserWorkflowDocument<TWorkflow, TVersion>>
  }

  async deleteWorkflowDocument(userId: string, workflowId: string): Promise<boolean> {
    await this.ensureSchema()
    return deleteWorkflowDocument(this.db, userId, workflowId)
  }

  async readHistoryDocument(userId: string): Promise<UserHistoryDocument<THistoryRecord>> {
    await this.ensureSchema()
    return readHistoryDocument<THistoryRecord>(this.db, userId)
  }

  async writeHistoryDocument(
    userId: string,
    updater: (
      document: UserHistoryDocument<THistoryRecord>,
    ) => Promise<UserHistoryDocument<THistoryRecord>> | UserHistoryDocument<THistoryRecord>,
  ): Promise<UserHistoryDocument<THistoryRecord>> {
    await this.ensureSchema()
    return writeHistoryDocument<any>(this.db, userId, updater as any) as Promise<UserHistoryDocument<THistoryRecord>>
  }

  private async ensureSchema() {
    if (!this.schemaReadyPromise) {
      this.schemaReadyPromise = ensureMysqlStorageSchemaReady(this.pool, this.config.database)
        .catch((error) => {
          this.schemaReadyPromise = null
          throw error
        })
    }

    await this.schemaReadyPromise
  }
}

export const assertMysqlStorageDatabaseExists = async () => {
  const config = readMysqlStorageConfigFromEnv()
  const pool = createMysqlStoragePool(config)

  try {
    await assertMysqlStorageDatabaseExistsByPool(pool, config.database)
  } finally {
    await pool.end()
  }
}
