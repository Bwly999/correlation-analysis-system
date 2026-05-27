import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFile } from 'node:fs/promises'
import { createPool } from 'mysql2/promise'
import { resolveMysqlIntegrationTestConfig } from './mysqlStorageTestConfig.js'

const mysqlEnabled = process.env.RUN_MYSQL_STORAGE_TESTS === '1'

vi.setConfig({
  testTimeout: 15000,
})

const apps: FastifyInstance[] = []
const mysqlConfig = resolveMysqlIntegrationTestConfig(process.env)

const loadAppFresh = async () => {
  vi.resetModules()
  const module = await import('../app.js')
  const app = module.createServerApp()
  apps.push(app)
  return app
}

const request = (
  app: FastifyInstance,
  method: string,
  url: string,
  payload?: unknown,
  headers?: Record<string, string>,
) => app.inject({ method, url, payload, headers: headers ?? {} })

const adminPool = createPool({
  host: mysqlConfig.host,
  port: mysqlConfig.port,
  user: mysqlConfig.user,
  password: mysqlConfig.password,
  waitForConnections: true,
  connectionLimit: 1,
})

describe.runIf(mysqlEnabled)('mysql storage routes', () => {
  beforeAll(async () => {
    await adminPool.query(
      `CREATE DATABASE IF NOT EXISTS \`${mysqlConfig.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    )
  })

  beforeEach(async () => {
    vi.stubEnv('WORKFLOW_STORAGE_BACKEND', 'mysql')
    vi.stubEnv('WORKFLOW_STORAGE_MYSQL_HOST', mysqlConfig.host)
    vi.stubEnv('WORKFLOW_STORAGE_MYSQL_PORT', String(mysqlConfig.port))
    vi.stubEnv('WORKFLOW_STORAGE_MYSQL_USER', mysqlConfig.user)
    vi.stubEnv('WORKFLOW_STORAGE_MYSQL_PASSWORD', mysqlConfig.password)
    vi.stubEnv('WORKFLOW_STORAGE_MYSQL_DATABASE', mysqlConfig.database)

    const cleanupPool = createPool({
      ...mysqlConfig,
      waitForConnections: true,
      connectionLimit: 1,
    })

    try {
      const migrationSql = await readFile('drizzle/mysql-storage/0000_init.sql', 'utf-8')
      const statements = migrationSql
        .split(/;\s*\r?\n/)
        .map((statement) => statement.trim())
        .filter(Boolean)

      for (const statement of statements) {
        await cleanupPool.query(statement)
      }

      await cleanupPool.query('DELETE FROM execution_history')
      await cleanupPool.query('DELETE FROM workflow_versions')
      await cleanupPool.query('DELETE FROM workflow_current')
    } finally {
      await cleanupPool.end()
    }
  })

  afterAll(async () => {
    vi.unstubAllEnvs()
    while (apps.length > 0) {
      await apps.pop()!.close()
    }
    await adminPool.end()
  })

  it('persists workflow versions after reloading the server module', async () => {
    const initialApp = await loadAppFresh()
    await request(
      initialApp,
      'POST',
      '/api/storage/workflows',
      {
        id: 'wf_mysql_persisted',
        name: 'MySQL 持久化工作流',
        updatedAt: 50,
        nodes: [{ id: 'node_mysql_v1' }],
        edges: [],
      },
      { 'x-workflow-user-id': 'mysql-user' },
    )

    const reloadedApp = await loadAppFresh()
    const workflowResponse = await request(
      reloadedApp,
      'GET',
      '/api/storage/workflows/wf_mysql_persisted',
      undefined,
      { 'x-workflow-user-id': 'mysql-user' },
    )

    expect(workflowResponse.statusCode).toBe(200)
    expect(workflowResponse.json()).toEqual(
      expect.objectContaining({
        id: 'wf_mysql_persisted',
        name: 'MySQL 持久化工作流',
      }),
    )

    const versionsResponse = await request(
      reloadedApp,
      'GET',
      '/api/storage/workflows/wf_mysql_persisted/versions',
      undefined,
      { 'x-workflow-user-id': 'mysql-user' },
    )

    expect(versionsResponse.json()).toEqual([
      expect.objectContaining({
        workflowId: 'wf_mysql_persisted',
        source: 'save',
      }),
    ])
  })

  it('persists history after reloading the server module', async () => {
    const initialApp = await loadAppFresh()
    await request(
      initialApp,
      'POST',
      '/api/storage/history',
      {
        record: {
          id: 'exec_mysql_1',
          workflowId: 'wf_mysql_1',
          workflowName: 'MySQL 历史工作流',
          startTime: 100,
          duration: 20,
          status: 'success',
          nodes: [],
          edges: [],
        },
        limit: 20,
      },
      { 'x-workflow-user-id': 'mysql-history-user' },
    )

    const reloadedApp = await loadAppFresh()
    const response = await request(
      reloadedApp,
      'GET',
      '/api/storage/history',
      undefined,
      { 'x-workflow-user-id': 'mysql-history-user' },
    )

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual([
      expect.objectContaining({
        id: 'exec_mysql_1',
        workflowName: 'MySQL 历史工作流',
      }),
    ])
  })
})
