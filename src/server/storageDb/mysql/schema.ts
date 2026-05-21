import {
  bigint,
  index,
  json,
  mysqlTable,
  primaryKey,
  varchar,
} from 'drizzle-orm/mysql-core'

export const workflowCurrentTable = mysqlTable('workflow_current', {
  userId: varchar('user_id', { length: 191 }).notNull(),
  workflowId: varchar('workflow_id', { length: 191 }).notNull(),
  workflowName: varchar('workflow_name', { length: 255 }).notNull(),
  updatedAtMs: bigint('updated_at_ms', { mode: 'number' }).notNull(),
  currentWorkflowJson: json('current_workflow_json').notNull(),
}, (table) => [
  primaryKey({ columns: [table.userId, table.workflowId] }),
  index('idx_workflow_current_user_updated').on(table.userId, table.updatedAtMs),
])

export const workflowVersionsTable = mysqlTable('workflow_versions', {
  versionId: varchar('version_id', { length: 191 }).primaryKey(),
  userId: varchar('user_id', { length: 191 }).notNull(),
  workflowId: varchar('workflow_id', { length: 191 }).notNull(),
  workflowName: varchar('workflow_name', { length: 255 }).notNull(),
  createdAtMs: bigint('created_at_ms', { mode: 'number' }).notNull(),
  workflowUpdatedAtMs: bigint('workflow_updated_at_ms', { mode: 'number' }).notNull(),
  source: varchar('source', { length: 32 }).notNull(),
  workflowJson: json('workflow_json').notNull(),
}, (table) => [
  index('idx_workflow_versions_user_workflow_created').on(table.userId, table.workflowId, table.createdAtMs),
  index('idx_workflow_versions_user_created').on(table.userId, table.createdAtMs),
])

export const executionHistoryTable = mysqlTable('execution_history', {
  executionId: varchar('execution_id', { length: 191 }).primaryKey(),
  userId: varchar('user_id', { length: 191 }).notNull(),
  workflowId: varchar('workflow_id', { length: 191 }).notNull(),
  workflowName: varchar('workflow_name', { length: 255 }).notNull(),
  startTimeMs: bigint('start_time_ms', { mode: 'number' }).notNull(),
  durationMs: bigint('duration_ms', { mode: 'number' }).notNull(),
  status: varchar('status', { length: 32 }).notNull(),
  recordObjectKey: varchar('record_object_key', { length: 512 }),
  recordJson: varchar('record_json', { length: 65535 }),
}, (table) => [
  index('idx_execution_history_user_start').on(table.userId, table.startTimeMs),
  index('idx_execution_history_user_workflow_start').on(table.userId, table.workflowId, table.startTimeMs),
])

export const mysqlStorageSchema = {
  workflowCurrentTable,
  workflowVersionsTable,
  executionHistoryTable,
}
