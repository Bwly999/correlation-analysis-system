import { and, asc, desc, eq, inArray } from 'drizzle-orm'
import type { MySql2Database } from 'drizzle-orm/mysql2'
import type { Pool, RowDataPacket } from 'mysql2/promise'
import type {
  UserHistoryDocument,
  UserWorkflowDocument,
} from '../../storageRepository.js'
import { buildHistoryRecordObjectKey, type HistoryRecordObjectStorage } from '../../historyObjectStorage.js'
import { executionHistoryTable, workflowCurrentTable, workflowVersionsTable } from './schema.js'
import {
  deserializeHistoryDocument,
  deserializeWorkflowDocument,
  type SerializedHistoryRecordRow,
  type SerializedWorkflowVersionRow,
  serializeHistoryRecordRow,
  serializeWorkflowCurrentRow,
  serializeWorkflowVersionRow,
} from './serialization.js'

const cloneJson = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

type WorkflowLike = {
  id: string
  name: string
  updatedAt: number
}

type WorkflowVersionLike<TWorkflow> = {
  id: string
  workflowId: string
  workflowName: string
  createdAt: number
  workflowUpdatedAt: number
  source: string
  workflow: TWorkflow
}

type ExecutionRecordLike = {
  id: string
  workflowId: string
  workflowName: string
  startTime: number
  duration: number
  status: string
}

type MysqlStorageDatabase = MySql2Database<any>

const areWorkflowVersionRowsEqual = (
  left: SerializedWorkflowVersionRow,
  right: SerializedWorkflowVersionRow,
) =>
  left.versionId === right.versionId
  && left.userId === right.userId
  && left.workflowId === right.workflowId
  && left.workflowName === right.workflowName
  && left.createdAtMs === right.createdAtMs
  && left.workflowUpdatedAtMs === right.workflowUpdatedAtMs
  && left.source === right.source
  && left.workflowJson === right.workflowJson

const areHistoryRowsEqual = (
  left: SerializedHistoryRecordRow,
  right: SerializedHistoryRecordRow,
) =>
  left.executionId === right.executionId
  && left.userId === right.userId
  && left.workflowId === right.workflowId
  && left.workflowName === right.workflowName
  && left.startTimeMs === right.startTimeMs
  && left.durationMs === right.durationMs
  && left.status === right.status
  && left.recordObjectKey === right.recordObjectKey
  && left.recordJson === right.recordJson

export const listWorkflowDocuments = async <TWorkflow, TVersion>(
  db: MysqlStorageDatabase,
  userId: string,
): Promise<Array<UserWorkflowDocument<TWorkflow, TVersion>>> => {
  const currentRows = await db
    .select({
      workflowId: workflowCurrentTable.workflowId,
      currentWorkflowJson: workflowCurrentTable.currentWorkflowJson,
    })
    .from(workflowCurrentTable)
    .where(eq(workflowCurrentTable.userId, userId))
    .orderBy(desc(workflowCurrentTable.updatedAtMs), asc(workflowCurrentTable.workflowId))

  const versionRows = await db
    .select({
      workflowId: workflowVersionsTable.workflowId,
      workflowJson: workflowVersionsTable.workflowJson,
    })
    .from(workflowVersionsTable)
    .where(eq(workflowVersionsTable.userId, userId))
    .orderBy(desc(workflowVersionsTable.createdAtMs), desc(workflowVersionsTable.versionId))

  const versionsByWorkflowId = new Map<string, Array<{ workflowJson: unknown }>>()
  versionRows.forEach((row) => {
    const items = versionsByWorkflowId.get(row.workflowId) ?? []
    items.push({ workflowJson: row.workflowJson })
    versionsByWorkflowId.set(row.workflowId, items)
  })

  return currentRows.map((row) =>
    deserializeWorkflowDocument<TWorkflow, TVersion>(
      { currentWorkflowJson: row.currentWorkflowJson },
      versionsByWorkflowId.get(row.workflowId) ?? [],
    ))
}

export const listWorkflowCurrents = async <TWorkflow>(
  db: MysqlStorageDatabase,
  userId: string,
): Promise<TWorkflow[]> => {
  const rows = await db
    .select({
      currentWorkflowJson: workflowCurrentTable.currentWorkflowJson,
    })
    .from(workflowCurrentTable)
    .where(eq(workflowCurrentTable.userId, userId))
    .orderBy(desc(workflowCurrentTable.updatedAtMs), asc(workflowCurrentTable.workflowId))

  return rows.map((row) => deserializeWorkflowDocument<TWorkflow, never>(
    { currentWorkflowJson: row.currentWorkflowJson },
    [],
  ).current).filter((workflow): workflow is TWorkflow => Boolean(workflow))
}

export const readWorkflowDocument = async <TWorkflow, TVersion>(
  db: MysqlStorageDatabase,
  userId: string,
  workflowId: string,
): Promise<UserWorkflowDocument<TWorkflow, TVersion>> => {
  const currentRows = await db
    .select({
      currentWorkflowJson: workflowCurrentTable.currentWorkflowJson,
    })
    .from(workflowCurrentTable)
    .where(and(
      eq(workflowCurrentTable.userId, userId),
      eq(workflowCurrentTable.workflowId, workflowId),
    ))
    .limit(1)

  const versionRows = await db
    .select({
      workflowJson: workflowVersionsTable.workflowJson,
    })
    .from(workflowVersionsTable)
    .where(and(
      eq(workflowVersionsTable.userId, userId),
      eq(workflowVersionsTable.workflowId, workflowId),
    ))
    .orderBy(desc(workflowVersionsTable.createdAtMs), desc(workflowVersionsTable.versionId))

  return deserializeWorkflowDocument<TWorkflow, TVersion>(currentRows[0] ?? null, versionRows)
}

export const writeWorkflowDocument = async <
  TWorkflow extends WorkflowLike,
  TVersion extends WorkflowVersionLike<TWorkflow>,
>(
  db: MysqlStorageDatabase,
  userId: string,
  workflowId: string,
  updater: (
    document: UserWorkflowDocument<TWorkflow, TVersion>,
  ) => Promise<UserWorkflowDocument<TWorkflow, TVersion>> | UserWorkflowDocument<TWorkflow, TVersion>,
): Promise<UserWorkflowDocument<TWorkflow, TVersion>> =>
  db.transaction(async (tx) => {
    const currentDocument = await readWorkflowDocument<TWorkflow, TVersion>(tx, userId, workflowId)
    const nextDocument = cloneJson(await updater(currentDocument))
    const currentVersionsById = new Map(
      currentDocument.versions.map((version) => [
        version.id,
        serializeWorkflowVersionRow(userId, version),
      ]),
    )

    if (nextDocument.current) {
      const currentRow = serializeWorkflowCurrentRow(userId, nextDocument.current)
      await tx
        .insert(workflowCurrentTable)
        .values({
          userId: currentRow.userId,
          workflowId: currentRow.workflowId,
          workflowName: currentRow.workflowName,
          updatedAtMs: currentRow.updatedAtMs,
          currentWorkflowJson: JSON.parse(currentRow.currentWorkflowJson),
        })
        .onDuplicateKeyUpdate({
          set: {
            workflowName: currentRow.workflowName,
            updatedAtMs: currentRow.updatedAtMs,
            currentWorkflowJson: JSON.parse(currentRow.currentWorkflowJson),
          },
        })
    } else {
      await tx
        .delete(workflowCurrentTable)
        .where(and(
          eq(workflowCurrentTable.userId, userId),
          eq(workflowCurrentTable.workflowId, workflowId),
        ))
    }

    const nextVersions = nextDocument.versions.map((version) => ({
      version,
      row: serializeWorkflowVersionRow(userId, version),
    }))
    const nextVersionIds = new Set(nextVersions.map(({ row }) => row.versionId))
    const versionIdsToDelete = [...currentVersionsById.keys()].filter((versionId) => !nextVersionIds.has(versionId))
    if (versionIdsToDelete.length > 0) {
      await tx
        .delete(workflowVersionsTable)
        .where(and(
          eq(workflowVersionsTable.userId, userId),
          eq(workflowVersionsTable.workflowId, workflowId),
          inArray(workflowVersionsTable.versionId, versionIdsToDelete),
        ))
    }

    const versionsToUpsert = nextVersions.filter(({ row }) => {
      const currentRow = currentVersionsById.get(row.versionId)
      return !currentRow || !areWorkflowVersionRowsEqual(currentRow, row)
    })

    for (const { row } of versionsToUpsert) {
      await tx
        .insert(workflowVersionsTable)
        .values({
          versionId: row.versionId,
          userId: row.userId,
          workflowId: row.workflowId,
          workflowName: row.workflowName,
          createdAtMs: row.createdAtMs,
          workflowUpdatedAtMs: row.workflowUpdatedAtMs,
          source: row.source,
          workflowJson: JSON.parse(row.workflowJson),
        })
        .onDuplicateKeyUpdate({
          set: {
            workflowName: row.workflowName,
            createdAtMs: row.createdAtMs,
            workflowUpdatedAtMs: row.workflowUpdatedAtMs,
            source: row.source,
            workflowJson: JSON.parse(row.workflowJson),
          },
        })
    }

    return nextDocument
  })

export const deleteWorkflowDocument = async (
  db: MysqlStorageDatabase,
  userId: string,
  workflowId: string,
): Promise<boolean> =>
  db.transaction(async (tx) => {
    const existingWorkflow = await tx
      .select({ workflowId: workflowCurrentTable.workflowId })
      .from(workflowCurrentTable)
      .where(and(
        eq(workflowCurrentTable.userId, userId),
        eq(workflowCurrentTable.workflowId, workflowId),
      ))
      .limit(1)

    await tx
      .delete(workflowCurrentTable)
      .where(and(
        eq(workflowCurrentTable.userId, userId),
        eq(workflowCurrentTable.workflowId, workflowId),
      ))

    await tx
      .delete(workflowVersionsTable)
      .where(and(
        eq(workflowVersionsTable.userId, userId),
        eq(workflowVersionsTable.workflowId, workflowId),
      ))

    return existingWorkflow.length > 0
  })

export const readHistoryDocument = async <TRecord>(
  db: MysqlStorageDatabase,
  userId: string,
  objectStorage?: HistoryRecordObjectStorage,
): Promise<UserHistoryDocument<TRecord>> => {
  const rows = await db
    .select({
      recordJson: executionHistoryTable.recordJson,
      recordObjectKey: executionHistoryTable.recordObjectKey,
    })
    .from(executionHistoryTable)
    .where(eq(executionHistoryTable.userId, userId))
    .orderBy(desc(executionHistoryTable.startTimeMs), desc(executionHistoryTable.executionId))

  return deserializeHistoryDocument<TRecord>(
    rows,
    objectStorage ? (recordObjectKey) => objectStorage.getObject(recordObjectKey) : undefined,
  )
}

export const listHistoryRecordSummaries = async (
  db: MysqlStorageDatabase,
  userId: string,
) => db
  .select({
    id: executionHistoryTable.executionId,
    workflowId: executionHistoryTable.workflowId,
    workflowName: executionHistoryTable.workflowName,
    startTime: executionHistoryTable.startTimeMs,
    duration: executionHistoryTable.durationMs,
    status: executionHistoryTable.status,
  })
  .from(executionHistoryTable)
  .where(eq(executionHistoryTable.userId, userId))
  .orderBy(desc(executionHistoryTable.startTimeMs), desc(executionHistoryTable.executionId))

export const readHistoryRecord = async <TRecord>(
  db: MysqlStorageDatabase,
  userId: string,
  recordId: string,
  objectStorage?: HistoryRecordObjectStorage,
): Promise<TRecord | null> => {
  const rows = await db
    .select({
      recordJson: executionHistoryTable.recordJson,
      recordObjectKey: executionHistoryTable.recordObjectKey,
    })
    .from(executionHistoryTable)
    .where(and(
      eq(executionHistoryTable.userId, userId),
      eq(executionHistoryTable.executionId, recordId),
    ))
    .limit(1)

  const row = rows[0]
  if (!row) {
    return null
  }

  const document = await deserializeHistoryDocument<TRecord>(
    [row],
    objectStorage ? (recordObjectKey) => objectStorage.getObject(recordObjectKey) : undefined,
  )

  return document.records[0] ?? null
}

export const writeHistoryDocument = async <TRecord extends ExecutionRecordLike>(
  db: MysqlStorageDatabase,
  userId: string,
  updater: (
    document: UserHistoryDocument<TRecord>,
  ) => Promise<UserHistoryDocument<TRecord>> | UserHistoryDocument<TRecord>,
  objectStorage?: HistoryRecordObjectStorage,
): Promise<UserHistoryDocument<TRecord>> =>
  db.transaction(async (tx) => {
    const currentDocument = await readHistoryDocument<TRecord>(tx, userId, objectStorage)
    const nextDocument = cloneJson(await updater(currentDocument))
    const buildSerializedRecord = (record: TRecord) => {
      const recordObjectKey = objectStorage
        ? buildHistoryRecordObjectKey({
          userId,
          workflowId: record.workflowId,
          executionId: record.id,
        })
        : null

      return {
        record,
        row: serializeHistoryRecordRow(userId, record, recordObjectKey),
      }
    }
    const currentRecordsById = new Map(
      currentDocument.records.map((record) => {
        const serialized = buildSerializedRecord(record)
        return [record.id, serialized] as const
      }),
    )
    const nextRecords = nextDocument.records.map(buildSerializedRecord)
    const nextRecordIds = new Set(nextRecords.map(({ row }) => row.executionId))
    const executionIdsToDelete = [...currentRecordsById.keys()].filter((executionId) => !nextRecordIds.has(executionId))

    if (executionIdsToDelete.length > 0) {
      await tx
        .delete(executionHistoryTable)
        .where(and(
          eq(executionHistoryTable.userId, userId),
          inArray(executionHistoryTable.executionId, executionIdsToDelete),
        ))
    }

    const recordsToUpsert = nextRecords.filter(({ record, row }) => {
      const current = currentRecordsById.get(row.executionId)
      return !current
        || !areHistoryRowsEqual(current.row, row)
        || JSON.stringify(current.record) !== JSON.stringify(record)
    })

    if (objectStorage) {
      await Promise.all(recordsToUpsert.map(async ({ record, row }) => {
        if (!row.recordObjectKey) return
        await objectStorage.putObject(row.recordObjectKey, JSON.stringify(record))
      }))
    }

    for (const { row } of recordsToUpsert) {
      await tx
        .insert(executionHistoryTable)
        .values({
          executionId: row.executionId,
          userId: row.userId,
          workflowId: row.workflowId,
          workflowName: row.workflowName,
          startTimeMs: row.startTimeMs,
          durationMs: row.durationMs,
          status: row.status,
          recordObjectKey: row.recordObjectKey,
          recordJson: row.recordJson,
        })
        .onDuplicateKeyUpdate({
          set: {
            workflowId: row.workflowId,
            workflowName: row.workflowName,
            startTimeMs: row.startTimeMs,
            durationMs: row.durationMs,
            status: row.status,
            recordObjectKey: row.recordObjectKey,
            recordJson: row.recordJson,
          },
        })
    }

    if (objectStorage && executionIdsToDelete.length > 0) {
      await Promise.all(executionIdsToDelete.map(async (executionId) => {
        const row = currentRecordsById.get(executionId)?.row
        if (!row?.recordObjectKey) return
        await objectStorage.deleteObject(row.recordObjectKey)
      }))
    }

    return nextDocument
  })

export const assertMysqlStorageDatabaseExists = async (pool: Pool, database: string) => {
  await pool.query('SELECT 1')

  const [rows] = await pool.query<Array<RowDataPacket & { schema_name: string }>>(
    'SELECT schema_name FROM information_schema.schemata WHERE schema_name = ? LIMIT 1',
    [database],
  )

  if (rows.length === 0) {
    throw new Error(`MySQL storage 数据库不存在：${database}`)
  }
}
