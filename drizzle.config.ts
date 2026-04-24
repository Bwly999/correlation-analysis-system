import { defineConfig } from 'drizzle-kit'
import { loadEnv } from 'vite'

const env = loadEnv(process.env.NODE_ENV || 'development', process.cwd(), '')

const host = env.WORKFLOW_STORAGE_MYSQL_HOST || '127.0.0.1'
const port = env.WORKFLOW_STORAGE_MYSQL_PORT || '3306'
const user = env.WORKFLOW_STORAGE_MYSQL_USER || 'root'
const password = env.WORKFLOW_STORAGE_MYSQL_PASSWORD || ''
const database = env.WORKFLOW_STORAGE_MYSQL_DATABASE || 'correlation_analysis_system'

export default defineConfig({
  out: './drizzle/mysql-storage',
  schema: './src/server/storageDb/mysql/schema.ts',
  dialect: 'mysql',
  dbCredentials: {
    url: `mysql://${user}:${encodeURIComponent(password)}@${host}:${port}/${database}`,
  },
})
