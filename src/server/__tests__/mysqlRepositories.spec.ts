import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFile } from 'node:fs/promises'
import { createPool, type Pool, type PoolConnection } from 'mysql2/promise'
import { createMysqlStorageDb, createMysqlStoragePool } from '../storageDb/mysql/client.js'
import {
  listWorkflowCurrents,
  readHistoryDocument,
  readWorkflowDocument,
  writeHistoryDocument,
  writeWorkflowDocument,
} from '../storageDb/mysql/repositories.js'
import { buildHistoryRecordObjectKey } from '../historyObjectStorage.js'
import { resolveMysqlIntegrationTestConfig } from './mysqlStorageTestConfig.js'

const mysqlEnabled = process.env.RUN_MYSQL_STORAGE_TESTS === '1'
const mysqlConfig = resolveMysqlIntegrationTestConfig(process.env)

type QueryLog = {
  statements: string[]
  restore: () => void
}

const adminPool = createPool({
  host: mysqlConfig.host,
  port: mysqlConfig.port,
  user: mysqlConfig.user,
  password: mysqlConfig.password,
  waitForConnections: true,
  connectionLimit: 1,
})

const resetMysqlTables = async () => {
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

    // 测试库可能落后于当前 drizzle schema，这里补齐字段，避免把 schema 漂移误判成仓储逻辑失败。
    try {
      await cleanupPool.query('ALTER TABLE execution_history ADD COLUMN record_object_key varchar(512) NULL')
    } catch {
      // column already exists
    }

    try {
      await cleanupPool.query('ALTER TABLE execution_history MODIFY COLUMN record_json LONGTEXT NULL')
    } catch {
      // column shape already compatible
    }

    await cleanupPool.query('DELETE FROM execution_history')
    await cleanupPool.query('DELETE FROM workflow_versions')
    await cleanupPool.query('DELETE FROM workflow_current')
  } finally {
    await cleanupPool.end()
  }
}

const attachQueryLog = (pool: Pool): QueryLog => {
  const statements: string[] = []
  const wrappedConnections = new WeakSet<PoolConnection>()
  const originalGetConnection = pool.getConnection.bind(pool)
  const originalQuery = pool.query.bind(pool)
  const originalExecute = pool.execute.bind(pool)
  const resolveStatementText = (input: unknown) =>
    typeof input === 'object' && input !== null && 'sql' in input ? String(input.sql) : String(input)

  const wrapConnection = (connection: PoolConnection) => {
    if (wrappedConnections.has(connection)) {
      return connection
    }

    wrappedConnections.add(connection)

    const originalConnectionQuery = connection.query.bind(connection)
    const originalConnectionExecute = connection.execute.bind(connection)

    connection.query = (async (...args: Parameters<PoolConnection['query']>) => {
      statements.push(resolveStatementText(args[0]))
      return originalConnectionQuery(...args)
    }) as PoolConnection['query']

    connection.execute = (async (...args: Parameters<PoolConnection['execute']>) => {
      statements.push(resolveStatementText(args[0]))
      return originalConnectionExecute(...args)
    }) as PoolConnection['execute']

    return connection
  }

  pool.getConnection = (async (...args: Parameters<Pool['getConnection']>) =>
    wrapConnection(await originalGetConnection(...args))) as Pool['getConnection']

  pool.query = (async (...args: Parameters<Pool['query']>) => {
    statements.push(resolveStatementText(args[0]))
    return originalQuery(...args)
  }) as Pool['query']

  pool.execute = (async (...args: Parameters<Pool['execute']>) => {
    statements.push(resolveStatementText(args[0]))
    return originalExecute(...args)
  }) as Pool['execute']

  return {
    statements,
    restore() {
      pool.getConnection = originalGetConnection
      pool.query = originalQuery
      pool.execute = originalExecute
    },
  }
}

describe.runIf(mysqlEnabled)('mysql repositories incremental writes', () => {
  beforeAll(async () => {
    await adminPool.query(
      `CREATE DATABASE IF NOT EXISTS \`${mysqlConfig.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    )
  })

  beforeEach(async () => {
    await resetMysqlTables()
  })

  afterAll(async () => {
    vi.unstubAllEnvs()
    await adminPool.end()
  })

  it('appends workflow versions without deleting all historical rows first', async () => {
    const pool = createMysqlStoragePool(mysqlConfig)
    const db = createMysqlStorageDb(pool)

    try {
      await writeWorkflowDocument(db, 'user-a', 'wf-1', () => ({
        current: {
          id: 'wf-1',
          name: '工作流 1',
          updatedAt: 100,
          nodes: [{ id: 'node-1' }],
          edges: [],
        },
        versions: [{
          id: 'wfver-1',
          workflowId: 'wf-1',
          workflowName: '工作流 1',
          createdAt: 100,
          workflowUpdatedAt: 100,
          source: 'save',
          workflow: {
            id: 'wf-1',
            name: '工作流 1',
            updatedAt: 100,
            nodes: [{ id: 'node-1' }],
            edges: [],
          },
        }],
      }))

      const log = attachQueryLog(pool)

      await writeWorkflowDocument(db, 'user-a', 'wf-1', (document) => ({
        current: {
          id: 'wf-1',
          name: '工作流 1',
          updatedAt: 200,
          nodes: [{ id: 'node-1' }, { id: 'node-2' }],
          edges: [],
        },
        versions: [
          {
            id: 'wfver-2',
            workflowId: 'wf-1',
            workflowName: '工作流 1',
            createdAt: 200,
            workflowUpdatedAt: 200,
            source: 'save',
            workflow: {
              id: 'wf-1',
              name: '工作流 1',
              updatedAt: 200,
              nodes: [{ id: 'node-1' }, { id: 'node-2' }],
              edges: [],
            },
          },
          ...document.versions,
        ],
      }))

      log.restore()

      expect(log.statements.some((statement) =>
        /delete\s+from\s+`?workflow_versions`?/i.test(statement))).toBe(false)

      const document = await readWorkflowDocument<any, any>(db, 'user-a', 'wf-1')
      expect(document.versions.map((version) => version.id)).toEqual(['wfver-2', 'wfver-1'])
    } finally {
      await pool.end()
    }
  })

  it('lists workflow currents without querying workflow version rows', async () => {
    const pool = createMysqlStoragePool(mysqlConfig)
    const db = createMysqlStorageDb(pool)

    try {
      await writeWorkflowDocument(db, 'user-a', 'wf-1', () => ({
        current: {
          id: 'wf-1',
          name: '工作流 1',
          updatedAt: 100,
          nodes: [{ id: 'node-1' }],
          edges: [],
        },
        versions: [{
          id: 'wfver-1',
          workflowId: 'wf-1',
          workflowName: '工作流 1',
          createdAt: 100,
          workflowUpdatedAt: 100,
          source: 'save',
          workflow: {
            id: 'wf-1',
            name: '工作流 1',
            updatedAt: 100,
            nodes: [{ id: 'node-1' }],
            edges: [],
          },
        }],
      }))

      const log = attachQueryLog(pool)
      const workflows = await listWorkflowCurrents<any>(db, 'user-a')
      log.restore()

      expect(workflows).toEqual([
        expect.objectContaining({
          id: 'wf-1',
          name: '工作流 1',
        }),
      ])
      expect(log.statements.some((statement) =>
        /select\s+.*from\s+`?workflow_versions`?/i.test(statement))).toBe(false)
    } finally {
      await pool.end()
    }
  })

  it('updates history incrementally and deletes trimmed object snapshots', async () => {
    const pool = createMysqlStoragePool(mysqlConfig)
    const db = createMysqlStorageDb(pool)
    const storedObjects = new Map<string, string>()
    const deletedKeys: string[] = []
    const putKeys: string[] = []
    const objectStorage = {
      async putObject(key: string, body: string) {
        putKeys.push(key)
        storedObjects.set(key, body)
      },
      async getObject(key: string) {
        return storedObjects.get(key) ?? null
      },
      async deleteObject(key: string) {
        deletedKeys.push(key)
        storedObjects.delete(key)
      },
    }

    try {
      await writeHistoryDocument(db, 'user-a', () => ({
        records: [
          {
            id: 'exec-2',
            workflowId: 'wf-1',
            workflowName: '工作流 1',
            startTime: 200,
            duration: 20,
            status: 'success',
            nodes: [],
            edges: [],
          },
          {
            id: 'exec-1',
            workflowId: 'wf-1',
            workflowName: '工作流 1',
            startTime: 100,
            duration: 10,
            status: 'success',
            nodes: [],
            edges: [],
          },
        ],
      }), objectStorage)

      putKeys.length = 0
      const log = attachQueryLog(pool)

      await writeHistoryDocument(db, 'user-a', (document) => ({
        records: [
          {
            id: 'exec-3',
            workflowId: 'wf-1',
            workflowName: '工作流 1',
            startTime: 300,
            duration: 30,
            status: 'success',
            nodes: [],
            edges: [],
          },
          document.records[0]!,
        ],
      }), objectStorage)

      log.restore()

      expect(log.statements.some((statement) =>
        /delete\s+from\s+`?execution_history`?\s+where\s+`?execution_history`?\.`?user_id`?\s*=\s*\?/i.test(statement))).toBe(false)

      expect(putKeys).toEqual([
        buildHistoryRecordObjectKey({
          userId: 'user-a',
          workflowId: 'wf-1',
          executionId: 'exec-3',
        }),
      ])

      expect(deletedKeys).toEqual([
        buildHistoryRecordObjectKey({
          userId: 'user-a',
          workflowId: 'wf-1',
          executionId: 'exec-1',
        }),
      ])

      const document = await readHistoryDocument<any>(db, 'user-a', objectStorage)
      expect(document.records.map((record) => record.id)).toEqual(['exec-3', 'exec-2'])
      expect(storedObjects.has(buildHistoryRecordObjectKey({
        userId: 'user-a',
        workflowId: 'wf-1',
        executionId: 'exec-1',
      }))).toBe(false)
    } finally {
      await pool.end()
    }
  })
})
