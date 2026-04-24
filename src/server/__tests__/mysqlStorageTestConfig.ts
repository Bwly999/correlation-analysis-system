type MysqlStorageTestEnv = Partial<Record<string, string | undefined>>

const resolveMysqlIntegrationTestDatabase = (env: MysqlStorageTestEnv) => {
  const explicitTestDatabase = env.WORKFLOW_STORAGE_MYSQL_TEST_DATABASE?.trim()
  if (explicitTestDatabase) return explicitTestDatabase

  const database = env.WORKFLOW_STORAGE_MYSQL_DATABASE || 'correlation_analysis_system'
  return database.endsWith('_test') ? database : `${database}_test`
}

export const resolveMysqlIntegrationTestConfig = (env: MysqlStorageTestEnv) => ({
  host: env.WORKFLOW_STORAGE_MYSQL_HOST || '127.0.0.1',
  port: Number(env.WORKFLOW_STORAGE_MYSQL_PORT || '3306'),
  user: env.WORKFLOW_STORAGE_MYSQL_USER || 'root',
  password: env.WORKFLOW_STORAGE_MYSQL_PASSWORD || '123456',
  database: resolveMysqlIntegrationTestDatabase(env),
})
