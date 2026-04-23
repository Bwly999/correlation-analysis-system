import mysql, { type Pool, type PoolConnection, type RowDataPacket } from 'mysql2/promise'
import type {
  UserHistoryDocument,
  UserWorkflowDocument,
  WorkflowStorageRepository,
} from './storageRepository.js'

type WorkflowCurrentRow = RowDataPacket & {
  workflow_id: string
  current_workflow_json: string
}

type WorkflowVersionRow = RowDataPacket & {
  version_id: string
  workflow_id: string
  workflow_json: string
}

type ExecutionHistoryRow = RowDataPacket & {
  record_json: string
}

const cloneJson = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

const quoteIdentifier = (value: string) => `\`${value.replace(/`/g, '``')}\``

const parseJsonColumn = <T>(value: unknown): T => {
  if (typeof value === 'string') {
    return JSON.parse(value) as T
  }
  return cloneJson(value as T)
}

const isMissingDatabaseError = (error: unknown): error is NodeJS.ErrnoException =>
  typeof error === 'object'
  && error !== null
  && 'code' in error
  && error.code === 'ER_BAD_DB_ERROR'

export class MysqlWorkflowStorageRepository<TWorkflow, TVersion, THistoryRecord>
  implements WorkflowStorageRepository<TWorkflow, TVersion, THistoryRecord> {
  private readonly pool: Pool

  private schemaReadyPromise: Promise<void> | null = null

  constructor(private readonly config = MysqlWorkflowStorageRepository.readConfigFromEnv()) {
    this.pool = mysql.createPool({
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      database: config.database,
      waitForConnections: true,
      connectionLimit: 10,
      namedPlaceholders: false,
      charset: 'utf8mb4',
      timezone: 'Z',
    })
  }

  static readConfigFromEnv() {
    return {
      host: process.env.WORKFLOW_STORAGE_MYSQL_HOST?.trim() || '127.0.0.1',
      port: Number(process.env.WORKFLOW_STORAGE_MYSQL_PORT?.trim() || '3306'),
      user: process.env.WORKFLOW_STORAGE_MYSQL_USER?.trim() || 'root',
      password: process.env.WORKFLOW_STORAGE_MYSQL_PASSWORD ?? '',
      database: process.env.WORKFLOW_STORAGE_MYSQL_DATABASE?.trim() || 'correlation_analysis_system',
    }
  }

  async listWorkflowDocuments(userId: string): Promise<Array<UserWorkflowDocument<TWorkflow, TVersion>>> {
    await this.ensureSchema()
    const [currentRows] = await this.pool.query<WorkflowCurrentRow[]>(
      `SELECT workflow_id, current_workflow_json
       FROM workflow_current
       WHERE user_id = ?
       ORDER BY updated_at_ms DESC, workflow_id ASC`,
      [userId],
    )
    const [versionRows] = await this.pool.query<WorkflowVersionRow[]>(
      `SELECT workflow_id, version_id, workflow_json
       FROM workflow_versions
       WHERE user_id = ?
       ORDER BY created_at_ms DESC, version_id DESC`,
      [userId],
    )

    const versionsByWorkflowId = new Map<string, TVersion[]>()
    versionRows.forEach((row) => {
      const items = versionsByWorkflowId.get(row.workflow_id) ?? []
      items.push(parseJsonColumn<TVersion>(row.workflow_json))
      versionsByWorkflowId.set(row.workflow_id, items)
    })

    return currentRows.map((row) => ({
      current: parseJsonColumn<TWorkflow>(row.current_workflow_json),
      versions: versionsByWorkflowId.get(row.workflow_id) ?? [],
    }))
  }

  async readWorkflowDocument(userId: string, workflowId: string): Promise<UserWorkflowDocument<TWorkflow, TVersion>> {
    await this.ensureSchema()
    const [currentRows] = await this.pool.query<WorkflowCurrentRow[]>(
      `SELECT current_workflow_json
       FROM workflow_current
       WHERE user_id = ? AND workflow_id = ?
       LIMIT 1`,
      [userId, workflowId],
    )
    const [versionRows] = await this.pool.query<WorkflowVersionRow[]>(
      `SELECT version_id, workflow_json
       FROM workflow_versions
       WHERE user_id = ? AND workflow_id = ?
       ORDER BY created_at_ms DESC, version_id DESC`,
      [userId, workflowId],
    )

    return {
      current: currentRows[0] ? parseJsonColumn<TWorkflow>(currentRows[0].current_workflow_json) : null,
      versions: versionRows.map((row) => parseJsonColumn<TVersion>(row.workflow_json)),
    }
  }

  async writeWorkflowDocument(
    userId: string,
    workflowId: string,
    updater: (
      document: UserWorkflowDocument<TWorkflow, TVersion>,
    ) => Promise<UserWorkflowDocument<TWorkflow, TVersion>> | UserWorkflowDocument<TWorkflow, TVersion>,
  ): Promise<UserWorkflowDocument<TWorkflow, TVersion>> {
    await this.ensureSchema()
    return this.withTransaction(async (connection) => {
      const document = await this.readWorkflowDocumentForUpdate(connection, userId, workflowId)
      const nextDocument = cloneJson(await updater(document))

      if (nextDocument.current) {
        await connection.query(
          `INSERT INTO workflow_current (
            user_id,
            workflow_id,
            workflow_name,
            updated_at_ms,
            current_workflow_json
          ) VALUES (?, ?, ?, ?, CAST(? AS JSON))
          ON DUPLICATE KEY UPDATE
            workflow_name = VALUES(workflow_name),
            updated_at_ms = VALUES(updated_at_ms),
            current_workflow_json = VALUES(current_workflow_json)`,
          [
            userId,
            workflowId,
            this.getWorkflowName(nextDocument.current),
            this.getWorkflowUpdatedAt(nextDocument.current),
            JSON.stringify(nextDocument.current),
          ],
        )
      } else {
        await connection.query(
          'DELETE FROM workflow_current WHERE user_id = ? AND workflow_id = ?',
          [userId, workflowId],
        )
      }

      await connection.query(
        'DELETE FROM workflow_versions WHERE user_id = ? AND workflow_id = ?',
        [userId, workflowId],
      )

      for (const version of nextDocument.versions) {
        await connection.query(
          `INSERT INTO workflow_versions (
            version_id,
            user_id,
            workflow_id,
            workflow_name,
            created_at_ms,
            workflow_updated_at_ms,
            source,
            workflow_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?, CAST(? AS JSON))`,
          [
            this.getVersionId(version),
            userId,
            workflowId,
            this.getVersionWorkflowName(version),
            this.getVersionCreatedAt(version),
            this.getVersionWorkflowUpdatedAt(version),
            this.getVersionSource(version),
            JSON.stringify(version),
          ],
        )
      }

      return nextDocument
    })
  }

  async deleteWorkflowDocument(userId: string, workflowId: string): Promise<boolean> {
    await this.ensureSchema()
    return this.withTransaction(async (connection) => {
      const [result] = await connection.query<mysql.ResultSetHeader>(
        'DELETE FROM workflow_current WHERE user_id = ? AND workflow_id = ?',
        [userId, workflowId],
      )
      await connection.query(
        'DELETE FROM workflow_versions WHERE user_id = ? AND workflow_id = ?',
        [userId, workflowId],
      )
      return result.affectedRows > 0
    })
  }

  async readHistoryDocument(userId: string): Promise<UserHistoryDocument<THistoryRecord>> {
    await this.ensureSchema()
    const [rows] = await this.pool.query<ExecutionHistoryRow[]>(
      `SELECT record_json
       FROM execution_history
       WHERE user_id = ?
       ORDER BY start_time_ms DESC, execution_id DESC`,
      [userId],
    )

    return {
      records: rows.map((row) => parseJsonColumn<THistoryRecord>(row.record_json)),
    }
  }

  async writeHistoryDocument(
    userId: string,
    updater: (
      document: UserHistoryDocument<THistoryRecord>,
    ) => Promise<UserHistoryDocument<THistoryRecord>> | UserHistoryDocument<THistoryRecord>,
  ): Promise<UserHistoryDocument<THistoryRecord>> {
    await this.ensureSchema()
    return this.withTransaction(async (connection) => {
      const document = await this.readHistoryDocumentForUpdate(connection, userId)
      const nextDocument = cloneJson(await updater(document))

      await connection.query('DELETE FROM execution_history WHERE user_id = ?', [userId])

      for (const record of nextDocument.records) {
        await connection.query(
          `INSERT INTO execution_history (
            execution_id,
            user_id,
            workflow_id,
            workflow_name,
            start_time_ms,
            duration_ms,
            status,
            record_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?, CAST(? AS JSON))`,
          [
            this.getExecutionId(record),
            userId,
            this.getExecutionWorkflowId(record),
            this.getExecutionWorkflowName(record),
            this.getExecutionStartTime(record),
            this.getExecutionDuration(record),
            this.getExecutionStatus(record),
            JSON.stringify(record),
          ],
        )
      }

      return nextDocument
    })
  }

  private async ensureSchema() {
    if (!this.schemaReadyPromise) {
      this.schemaReadyPromise = this.ensureSchemaInternal().catch((error) => {
        this.schemaReadyPromise = null
        throw error
      })
    }
    await this.schemaReadyPromise
  }

  private async ensureSchemaInternal() {
    try {
      const statements = [
        `CREATE TABLE IF NOT EXISTS workflow_current (
          user_id VARCHAR(191) NOT NULL,
          workflow_id VARCHAR(191) NOT NULL,
          workflow_name VARCHAR(255) NOT NULL,
          updated_at_ms BIGINT NOT NULL,
          current_workflow_json JSON NOT NULL,
          PRIMARY KEY (user_id, workflow_id),
          KEY idx_workflow_current_user_updated (user_id, updated_at_ms)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
        `CREATE TABLE IF NOT EXISTS workflow_versions (
          version_id VARCHAR(191) NOT NULL,
          user_id VARCHAR(191) NOT NULL,
          workflow_id VARCHAR(191) NOT NULL,
          workflow_name VARCHAR(255) NOT NULL,
          created_at_ms BIGINT NOT NULL,
          workflow_updated_at_ms BIGINT NOT NULL,
          source VARCHAR(32) NOT NULL,
          workflow_json JSON NOT NULL,
          PRIMARY KEY (version_id),
          KEY idx_workflow_versions_user_workflow_created (user_id, workflow_id, created_at_ms),
          KEY idx_workflow_versions_user_created (user_id, created_at_ms)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
        `CREATE TABLE IF NOT EXISTS execution_history (
          execution_id VARCHAR(191) NOT NULL,
          user_id VARCHAR(191) NOT NULL,
          workflow_id VARCHAR(191) NOT NULL,
          workflow_name VARCHAR(255) NOT NULL,
          start_time_ms BIGINT NOT NULL,
          duration_ms BIGINT NOT NULL,
          status VARCHAR(32) NOT NULL,
          record_json JSON NOT NULL,
          PRIMARY KEY (execution_id),
          KEY idx_execution_history_user_start (user_id, start_time_ms),
          KEY idx_execution_history_user_workflow_start (user_id, workflow_id, start_time_ms)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      ]

      for (const statement of statements) {
        await this.pool.query(statement)
      }
    } catch (error) {
      if (isMissingDatabaseError(error)) {
        throw new Error(`MySQL storage 数据库不存在：${this.config.database}`)
      }
      throw error
    }
  }

  private async withTransaction<T>(handler: (connection: PoolConnection) => Promise<T>): Promise<T> {
    const connection = await this.pool.getConnection()
    try {
      await connection.beginTransaction()
      const result = await handler(connection)
      await connection.commit()
      return result
    } catch (error) {
      await connection.rollback()
      throw error
    } finally {
      connection.release()
    }
  }

  private async readWorkflowDocumentForUpdate(
    connection: PoolConnection,
    userId: string,
    workflowId: string,
  ): Promise<UserWorkflowDocument<TWorkflow, TVersion>> {
    const [currentRows] = await connection.query<WorkflowCurrentRow[]>(
      `SELECT current_workflow_json
       FROM workflow_current
       WHERE user_id = ? AND workflow_id = ?
       FOR UPDATE`,
      [userId, workflowId],
    )
    const [versionRows] = await connection.query<WorkflowVersionRow[]>(
      `SELECT version_id, workflow_json
       FROM workflow_versions
       WHERE user_id = ? AND workflow_id = ?
       ORDER BY created_at_ms DESC, version_id DESC
       FOR UPDATE`,
      [userId, workflowId],
    )

    return {
      current: currentRows[0] ? parseJsonColumn<TWorkflow>(currentRows[0].current_workflow_json) : null,
      versions: versionRows.map((row) => parseJsonColumn<TVersion>(row.workflow_json)),
    }
  }

  private async readHistoryDocumentForUpdate(
    connection: PoolConnection,
    userId: string,
  ): Promise<UserHistoryDocument<THistoryRecord>> {
    const [rows] = await connection.query<ExecutionHistoryRow[]>(
      `SELECT record_json
       FROM execution_history
       WHERE user_id = ?
       ORDER BY start_time_ms DESC, execution_id DESC
       FOR UPDATE`,
      [userId],
    )

    return {
      records: rows.map((row) => parseJsonColumn<THistoryRecord>(row.record_json)),
    }
  }

  private getWorkflowName(workflow: TWorkflow) {
    return String((workflow as Record<string, unknown>).name ?? '')
  }

  private getWorkflowUpdatedAt(workflow: TWorkflow) {
    return Number((workflow as Record<string, unknown>).updatedAt ?? 0)
  }

  private getVersionId(version: TVersion) {
    return String((version as Record<string, unknown>).id ?? '')
  }

  private getVersionWorkflowName(version: TVersion) {
    return String((version as Record<string, unknown>).workflowName ?? '')
  }

  private getVersionCreatedAt(version: TVersion) {
    return Number((version as Record<string, unknown>).createdAt ?? 0)
  }

  private getVersionWorkflowUpdatedAt(version: TVersion) {
    return Number((version as Record<string, unknown>).workflowUpdatedAt ?? 0)
  }

  private getVersionSource(version: TVersion) {
    return String((version as Record<string, unknown>).source ?? 'save')
  }

  private getExecutionId(record: THistoryRecord) {
    return String((record as Record<string, unknown>).id ?? '')
  }

  private getExecutionWorkflowId(record: THistoryRecord) {
    return String((record as Record<string, unknown>).workflowId ?? '')
  }

  private getExecutionWorkflowName(record: THistoryRecord) {
    return String((record as Record<string, unknown>).workflowName ?? '')
  }

  private getExecutionStartTime(record: THistoryRecord) {
    return Number((record as Record<string, unknown>).startTime ?? 0)
  }

  private getExecutionDuration(record: THistoryRecord) {
    return Number((record as Record<string, unknown>).duration ?? 0)
  }

  private getExecutionStatus(record: THistoryRecord) {
    return String((record as Record<string, unknown>).status ?? 'success')
  }
}

export const assertMysqlStorageDatabaseExists = async () => {
  const config = MysqlWorkflowStorageRepository.readConfigFromEnv()
  const pool = mysql.createPool({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    waitForConnections: true,
    connectionLimit: 1,
  })

  try {
    await pool.query(`SELECT 1 FROM ${quoteIdentifier('workflow_current')} LIMIT 1`)
  } catch (error) {
    if (isMissingDatabaseError(error)) {
      throw new Error(`MySQL storage 数据库不存在：${config.database}`)
    }
  } finally {
    await pool.end()
  }
}
