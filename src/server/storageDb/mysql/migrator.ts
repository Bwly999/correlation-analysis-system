import type { RowDataPacket } from 'mysql2/promise'
import type { Pool } from 'mysql2/promise'

const REQUIRED_TABLES = ['workflow_current', 'workflow_versions', 'execution_history'] as const

const isMissingDatabaseError = (error: unknown): error is NodeJS.ErrnoException =>
  typeof error === 'object'
  && error !== null
  && 'code' in error
  && error.code === 'ER_BAD_DB_ERROR'

export const ensureMysqlStorageSchemaReady = async (pool: Pool, database: string) => {
  try {
    const [rows] = await pool.query<Array<RowDataPacket & { table_name: string }>>(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema = ?
         AND table_name IN (?, ?, ?)`,
      [database, ...REQUIRED_TABLES],
    )

    const existing = new Set(rows.map((row) => row.table_name))
    const missing = REQUIRED_TABLES.filter((tableName) => !existing.has(tableName))

    if (missing.length > 0) {
      throw new Error(`MySQL storage 缺少数据表：${missing.join(', ')}。请先执行 drizzle 迁移。`)
    }
  } catch (error) {
    if (isMissingDatabaseError(error)) {
      throw new Error(`MySQL storage 数据库不存在：${database}`)
    }

    throw error
  }
}
