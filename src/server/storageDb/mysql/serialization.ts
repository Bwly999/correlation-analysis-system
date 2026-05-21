import type {
  UserHistoryDocument,
  UserWorkflowDocument,
} from '../../storageRepository.js'

const cloneJson = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

const parseJsonColumn = <T>(value: unknown): T => {
  if (typeof value === 'string') {
    return JSON.parse(value) as T
  }

  return cloneJson(value as T)
}

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

export type SerializedWorkflowCurrentRow = {
  userId: string
  workflowId: string
  workflowName: string
  updatedAtMs: number
  currentWorkflowJson: string
}

export type SerializedWorkflowVersionRow = {
  versionId: string
  userId: string
  workflowId: string
  workflowName: string
  createdAtMs: number
  workflowUpdatedAtMs: number
  source: string
  workflowJson: string
}

export type SerializedHistoryRecordRow = {
  executionId: string
  userId: string
  workflowId: string
  workflowName: string
  startTimeMs: number
  durationMs: number
  status: string
  recordObjectKey: string | null
  recordJson: string | null
}

export const serializeWorkflowCurrentRow = <TWorkflow extends WorkflowLike>(
  userId: string,
  workflow: TWorkflow,
): SerializedWorkflowCurrentRow => ({
  userId,
  workflowId: workflow.id,
  workflowName: workflow.name,
  updatedAtMs: workflow.updatedAt,
  currentWorkflowJson: JSON.stringify(workflow),
})

export const serializeWorkflowVersionRow = <TWorkflow, TVersion extends WorkflowVersionLike<TWorkflow>>(
  userId: string,
  version: TVersion,
): SerializedWorkflowVersionRow => ({
  versionId: version.id,
  userId,
  workflowId: version.workflowId,
  workflowName: version.workflowName,
  createdAtMs: version.createdAt,
  workflowUpdatedAtMs: version.workflowUpdatedAt,
  source: version.source,
  workflowJson: JSON.stringify(version),
})

export const serializeHistoryRecordRow = <TRecord extends ExecutionRecordLike>(
  userId: string,
  record: TRecord,
  recordObjectKey: string | null,
): SerializedHistoryRecordRow => ({
  executionId: record.id,
  userId,
  workflowId: record.workflowId,
  workflowName: record.workflowName,
  startTimeMs: record.startTime,
  durationMs: record.duration,
  status: record.status,
  recordObjectKey,
  recordJson: recordObjectKey ? null : JSON.stringify(record),
})

export const deserializeWorkflowDocument = <TWorkflow, TVersion>(
  currentRow: { currentWorkflowJson: unknown } | null,
  versionRows: Array<{ workflowJson: unknown }>,
): UserWorkflowDocument<TWorkflow, TVersion> => ({
  current: currentRow ? parseJsonColumn<TWorkflow>(currentRow.currentWorkflowJson) : null,
  versions: versionRows.map((row) => parseJsonColumn<TVersion>(row.workflowJson)),
})

export const deserializeHistoryDocument = <TRecord>(
  rows: Array<{
    recordJson: unknown
    recordObjectKey: unknown
  }>,
  resolveObjectRecord?: (recordObjectKey: string) => Promise<string | null> | string | null,
): Promise<UserHistoryDocument<TRecord>> => Promise.all(
  rows.map(async (row) => {
    if (typeof row.recordObjectKey === 'string' && resolveObjectRecord) {
      const resolved = await resolveObjectRecord(row.recordObjectKey)
      if (resolved) {
        return JSON.parse(resolved) as TRecord
      }
    }

    return parseJsonColumn<TRecord>(row.recordJson)
  }),
).then((records) => ({ records }))
