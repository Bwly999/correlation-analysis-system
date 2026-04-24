import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { loadEnv } from 'vite'
import mysql from 'mysql2/promise'

const env = loadEnv(process.env.NODE_ENV || 'development', process.cwd(), '')
const migrationsDir = join(process.cwd(), 'drizzle', 'mysql-storage')

const connection = await mysql.createConnection({
  host: env.WORKFLOW_STORAGE_MYSQL_HOST || '127.0.0.1',
  port: Number(env.WORKFLOW_STORAGE_MYSQL_PORT || '3306'),
  user: env.WORKFLOW_STORAGE_MYSQL_USER || 'root',
  password: env.WORKFLOW_STORAGE_MYSQL_PASSWORD ?? '',
  database: env.WORKFLOW_STORAGE_MYSQL_DATABASE || 'correlation_analysis_system',
  multipleStatements: false,
})

try {
  const fileNames = (await readdir(migrationsDir))
    .filter((fileName) => fileName.endsWith('.sql'))
    .sort()

  for (const fileName of fileNames) {
    const sql = await readFile(join(migrationsDir, fileName), 'utf-8')
    const statements = sql
      .split(/;\s*\r?\n/)
      .map((statement) => statement.trim())
      .filter(Boolean)

    for (const statement of statements) {
      await connection.query(statement)
    }
  }

  console.log(`[mysql-storage-migrate] applied ${fileNames.length} migration file(s)`)
} finally {
  await connection.end()
}
