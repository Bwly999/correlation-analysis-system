import { describe, expect, it } from 'vitest'
import { resolveMysqlIntegrationTestConfig } from './mysqlStorageTestConfig.js'

describe('resolveMysqlIntegrationTestConfig', () => {
  it('uses an isolated test database by default', () => {
    const config = resolveMysqlIntegrationTestConfig({
      WORKFLOW_STORAGE_MYSQL_HOST: '127.0.0.1',
      WORKFLOW_STORAGE_MYSQL_PORT: '3306',
      WORKFLOW_STORAGE_MYSQL_USER: 'root',
      WORKFLOW_STORAGE_MYSQL_PASSWORD: '123456',
      WORKFLOW_STORAGE_MYSQL_DATABASE: 'correlation_analysis_system',
    })

    expect(config.database).toBe('correlation_analysis_system_test')
  })
})
