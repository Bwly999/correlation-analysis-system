import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { Readable } from 'node:stream'
import { readFile } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { createPool } from 'mysql2/promise'
import { resolveMysqlIntegrationTestConfig } from './mysqlStorageTestConfig.js'

const mysqlEnabled = process.env.RUN_MYSQL_STORAGE_TESTS === '1'

vi.setConfig({
  testTimeout: 15000,
})

type MockResponse = ServerResponse & {
  body: string
  headersMap: Record<string, string>
}

const mysqlConfig = resolveMysqlIntegrationTestConfig(process.env)

const createRequest = (method: string, url: string, body?: unknown, headers?: Record<string, string>) => {
  const payload = body === undefined ? '' : JSON.stringify(body)
  const stream = Readable.from(payload ? [payload] : []) as IncomingMessage
  stream.method = method
  stream.url = url
  stream.headers = headers ?? {}
  return stream
}

const createResponse = () => {
  const headersMap: Record<string, string> = {}
  const response = {
    statusCode: 200,
    body: '',
    headersMap,
    setHeader(name: string, value: string) {
      headersMap[name] = value
      return this
    },
    end(chunk?: string) {
      this.body = chunk ?? ''
      return this
    },
  } as MockResponse

  return response
}

const loadHandlerFresh = async () => {
  vi.resetModules()
  const module = await import('../app.js')
  return module.createServerHandler()
}

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
    await adminPool.end()
  })

  it('persists workflow versions after reloading the server module', async () => {
    const initialHandler = await loadHandlerFresh()
    await initialHandler(
      createRequest(
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
      ),
      createResponse(),
    )

    const reloadedHandler = await loadHandlerFresh()
    const workflowResponse = createResponse()
    await reloadedHandler(
      createRequest(
        'GET',
        '/api/storage/workflows/wf_mysql_persisted',
        undefined,
        { 'x-workflow-user-id': 'mysql-user' },
      ),
      workflowResponse,
    )

    expect(workflowResponse.statusCode).toBe(200)
    expect(JSON.parse(workflowResponse.body)).toEqual(
      expect.objectContaining({
        id: 'wf_mysql_persisted',
        name: 'MySQL 持久化工作流',
      }),
    )

    const versionsResponse = createResponse()
    await reloadedHandler(
      createRequest(
        'GET',
        '/api/storage/workflows/wf_mysql_persisted/versions',
        undefined,
        { 'x-workflow-user-id': 'mysql-user' },
      ),
      versionsResponse,
    )

    expect(JSON.parse(versionsResponse.body)).toEqual([
      expect.objectContaining({
        workflowId: 'wf_mysql_persisted',
        source: 'save',
      }),
    ])
  })

  it('persists history after reloading the server module', async () => {
    const initialHandler = await loadHandlerFresh()
    await initialHandler(
      createRequest(
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
      ),
      createResponse(),
    )

    const reloadedHandler = await loadHandlerFresh()
    const response = createResponse()
    await reloadedHandler(
      createRequest(
        'GET',
        '/api/storage/history',
        undefined,
        { 'x-workflow-user-id': 'mysql-history-user' },
      ),
      response,
    )

    expect(response.statusCode).toBe(200)
    expect(JSON.parse(response.body)).toEqual([
      expect.objectContaining({
        id: 'exec_mysql_1',
        workflowName: 'MySQL 历史工作流',
      }),
    ])
  })
})
