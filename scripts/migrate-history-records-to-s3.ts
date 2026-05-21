import mysql from 'mysql2/promise'
import { loadEnv } from 'vite'
import { PutObjectCommand, HeadBucketCommand, CreateBucketCommand } from '@aws-sdk/client-s3'
import {
  createHistoryObjectStorageClient,
  createHistoryRecordObjectKeyFactory,
  readHistoryObjectStorageConfigFromEnv,
} from '../src/server/historyObjectStorage.js'

const env = loadEnv(process.env.NODE_ENV || 'development', process.cwd(), '')
const mysqlConnection = await mysql.createConnection({
  host: env.WORKFLOW_STORAGE_MYSQL_HOST || '127.0.0.1',
  port: Number(env.WORKFLOW_STORAGE_MYSQL_PORT || '3306'),
  user: env.WORKFLOW_STORAGE_MYSQL_USER || 'root',
  password: env.WORKFLOW_STORAGE_MYSQL_PASSWORD ?? '',
  database: env.WORKFLOW_STORAGE_MYSQL_DATABASE || 'correlation_analysis_system',
  multipleStatements: false,
})

const objectConfig = readHistoryObjectStorageConfigFromEnv()
const s3 = createHistoryObjectStorageClient(objectConfig)

const ensureHistoryTableReady = async () => {
  const [rows] = await mysqlConnection.query<Array<{ column_name: string; data_type: string }>>(
    `
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = ?
        AND table_name = 'execution_history'
    `,
    [env.WORKFLOW_STORAGE_MYSQL_DATABASE || 'correlation_analysis_system'],
  )

  const columns = new Map(rows.map((row) => [row.column_name, row.data_type]))

  if (!columns.has('record_object_key')) {
    await mysqlConnection.query(
      'ALTER TABLE execution_history ADD COLUMN record_object_key varchar(512) NULL AFTER status',
    )
  }

  if (columns.get('record_json') !== 'longtext') {
    await mysqlConnection.query(
      'ALTER TABLE execution_history MODIFY COLUMN record_json longtext NULL',
    )
  }
}

try {
  await ensureHistoryTableReady()

  await s3.send(new HeadBucketCommand({ Bucket: objectConfig.bucket })).catch(async () => {
    await s3.send(new CreateBucketCommand({ Bucket: objectConfig.bucket }))
  })

  const [rows] = await mysqlConnection.query<any[]>(
    'SELECT execution_id, user_id, workflow_id, workflow_name, start_time_ms, duration_ms, status, record_json, record_object_key FROM execution_history',
  )

  const createObjectKey = createHistoryRecordObjectKeyFactory(() => 'record')
  let migrated = 0

  for (const row of rows) {
    const recordObjectKey = row.record_object_key || createObjectKey({
      userId: row.user_id,
      workflowId: row.workflow_id,
      executionId: row.execution_id,
    })
    const recordJson = row.record_json || JSON.stringify({
      id: row.execution_id,
      workflowId: row.workflow_id,
      workflowName: row.workflow_name,
      startTime: Number(row.start_time_ms),
      duration: Number(row.duration_ms),
      status: row.status,
      nodes: [],
      edges: [],
    })

    if (!recordJson) {
      continue
    }

    await s3.send(new PutObjectCommand({
      Bucket: objectConfig.bucket,
      Key: recordObjectKey,
      Body: recordJson,
      ContentType: 'application/json; charset=utf-8',
    }))

    await mysqlConnection.query(
      'UPDATE execution_history SET record_object_key = ?, record_json = NULL WHERE execution_id = ?',
      [recordObjectKey, row.execution_id],
    )

    migrated += 1
  }

  console.log(`[migrate-history-records-to-s3] migrated ${migrated} record(s) to ${objectConfig.bucket}`)
} finally {
  await mysqlConnection.end()
}
