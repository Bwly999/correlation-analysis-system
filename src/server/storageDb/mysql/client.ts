import mysql from 'mysql2/promise'
import { drizzle } from 'drizzle-orm/mysql2'
import { mysqlStorageSchema } from './schema.js'

export type MysqlStorageConfig = {
  host: string
  port: number
  user: string
  password: string
  database: string
}

export const readMysqlStorageConfigFromEnv = (): MysqlStorageConfig => ({
  host: process.env.WORKFLOW_STORAGE_MYSQL_HOST?.trim() || '127.0.0.1',
  port: Number(process.env.WORKFLOW_STORAGE_MYSQL_PORT?.trim() || '3306'),
  user: process.env.WORKFLOW_STORAGE_MYSQL_USER?.trim() || 'root',
  password: process.env.WORKFLOW_STORAGE_MYSQL_PASSWORD ?? '',
  database: process.env.WORKFLOW_STORAGE_MYSQL_DATABASE?.trim() || 'correlation_analysis_system',
})

export const createMysqlStoragePool = (config: MysqlStorageConfig) =>
  mysql.createPool({
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

export const createMysqlStorageDb = (pool: ReturnType<typeof createMysqlStoragePool>) =>
  drizzle({
    client: pool,
    schema: mysqlStorageSchema,
    mode: 'default',
  })

export type MysqlStorageDb = ReturnType<typeof createMysqlStorageDb>
export type MysqlStoragePool = ReturnType<typeof createMysqlStoragePool>
