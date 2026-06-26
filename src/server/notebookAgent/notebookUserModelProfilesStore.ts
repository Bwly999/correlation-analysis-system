/**
 * Notebook Agent 用户自定义模型配置存储。
 *
 * 仅支持 MySQL 后端（与本次设计决策一致）。低 backend 为 lowdb 时，
 * 所有读操作返回空数组、写操作抛"不支持"，保证 notebook 在 lowdb 环境
 * 仍可用（只是没有用户自定义模型能力，后台 env 模型不受影响）。
 *
 * 参考实现：src/server/apiCallTracking/mysqlApiCallTracker.ts（独立连接池 + drizzle）。
 * 独立连接池，避免与 workflow storage 池争用配额。
 */

import { and, eq } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { notebookUserModelProfilesTable } from '../storageDb/mysql/schema.js'
import {
  createMysqlStorageDb,
  createMysqlStoragePool,
  readMysqlStorageConfigFromEnv,
  type MysqlStorageConfig,
  type MysqlStorageDb,
  type MysqlStoragePool,
} from '../storageDb/mysql/client.js'
import type { WorkflowAiModelProfile, WorkflowAiThinkingLevel } from '../../ai/types.js'

const isMysqlBackend = () =>
  (process.env.WORKFLOW_STORAGE_BACKEND?.trim().toLowerCase() || 'lowdb') === 'mysql'

export interface NotebookUserModelProfileInput {
  name: string
  baseUrl: string
  model: string
  apiKey: string
  contextWindow?: number
  maxTokens?: number
  thinkingLevel?: WorkflowAiThinkingLevel
}

interface StoredRow {
  profileId: string
  userId: string
  name: string
  baseUrl: string
  model: string
  apiKey: string
  contextWindow: number | null
  maxTokens: number | null
  thinkingLevel: string | null
  createdAtMs: number
  updatedAtMs: number
}

const rowToProfile = (row: StoredRow): WorkflowAiModelProfile => ({
  id: row.profileId,
  name: row.name,
  baseUrl: row.baseUrl,
  model: row.model,
  apiKey: row.apiKey,
  enabled: true,
  isDefault: false,
  source: 'custom',
  capabilities: { create: true, edit: true },
  contextWindow: row.contextWindow ?? undefined,
  maxTokens: row.maxTokens ?? undefined,
  thinkingLevel: (row.thinkingLevel as WorkflowAiThinkingLevel | null) ?? undefined,
})

/**
 * 单例懒加载的 MySQL 连接池 + drizzle db。
 * 仅在 mysql backend 下首次访问时创建，lowdb 环境永不实例化。
 */
let pool: MysqlStoragePool | null = null
let db: MysqlStorageDb | null = null

const getDb = (): MysqlStorageDb | null => {
  if (!isMysqlBackend()) return null
  if (!db) {
    const config: MysqlStorageConfig = readMysqlStorageConfigFromEnv()
    pool = createMysqlStoragePool(config)
    db = createMysqlStorageDb(pool)
  }
  return db
}

/**
 * 列出某用户的所有自定义模型配置（含 apiKey，供后端构建 runtime 使用）。
 * lowdb 后端返回空数组（用户自定义能力不可用，但后台 env 模型仍可用）。
 */
export const listNotebookUserModelProfiles = async (
  userId: string,
): Promise<WorkflowAiModelProfile[]> => {
  const database = getDb()
  if (!database) return []

  const rows = await database
    .select()
    .from(notebookUserModelProfilesTable)
    .where(eq(notebookUserModelProfilesTable.userId, userId))

  return rows.map((row) => rowToProfile(row as unknown as StoredRow))
}

/**
 * 新增用户自定义模型配置。
 * @returns 完整 profile（含生成的 profileId）
 * @throws lowdb 后端抛"不支持"
 */
export const createNotebookUserModelProfile = async (
  userId: string,
  input: NotebookUserModelProfileInput,
): Promise<WorkflowAiModelProfile> => {
  const database = getDb()
  if (!database) {
    throw new Error('当前存储后端不支持用户自定义模型配置（需 MySQL）')
  }

  const now = Date.now()
  const profileId = randomUUID()
  await database.insert(notebookUserModelProfilesTable).values({
    profileId,
    userId,
    name: input.name,
    baseUrl: input.baseUrl,
    model: input.model,
    apiKey: input.apiKey,
    contextWindow: input.contextWindow ?? null,
    maxTokens: input.maxTokens ?? null,
    thinkingLevel: input.thinkingLevel ?? null,
    createdAtMs: now,
    updatedAtMs: now,
  })

  return rowToProfile({
    profileId,
    userId,
    name: input.name,
    baseUrl: input.baseUrl,
    model: input.model,
    apiKey: input.apiKey,
    contextWindow: input.contextWindow ?? null,
    maxTokens: input.maxTokens ?? null,
    thinkingLevel: input.thinkingLevel ?? null,
    createdAtMs: now,
    updatedAtMs: now,
  })
}

/**
 * 更新用户自定义模型配置（校验归属）。
 * @returns 更新后的 profile；不存在或不归属该用户返回 null
 */
export const updateNotebookUserModelProfile = async (
  userId: string,
  profileId: string,
  input: NotebookUserModelProfileInput,
): Promise<WorkflowAiModelProfile | null> => {
  const database = getDb()
  if (!database) {
    throw new Error('当前存储后端不支持用户自定义模型配置（需 MySQL）')
  }

  const now = Date.now()
  const result = await database
    .update(notebookUserModelProfilesTable)
    .set({
      name: input.name,
      baseUrl: input.baseUrl,
      model: input.model,
      apiKey: input.apiKey,
      contextWindow: input.contextWindow ?? null,
      maxTokens: input.maxTokens ?? null,
      thinkingLevel: input.thinkingLevel ?? null,
      updatedAtMs: now,
    })
    .where(
      and(
        eq(notebookUserModelProfilesTable.profileId, profileId),
        eq(notebookUserModelProfilesTable.userId, userId),
      ),
    )

  // mysql2 update 返回 affectedRows 在 result[0].affectedRows
  const affected = (result as unknown as Array<{ affectedRows?: number }>)[0]?.affectedRows ?? 0
  if (affected === 0) return null

  return rowToProfile({
    profileId,
    userId,
    name: input.name,
    baseUrl: input.baseUrl,
    model: input.model,
    apiKey: input.apiKey,
    contextWindow: input.contextWindow ?? null,
    maxTokens: input.maxTokens ?? null,
    thinkingLevel: input.thinkingLevel ?? null,
    createdAtMs: now,
    updatedAtMs: now,
  })
}

/**
 * 删除用户自定义模型配置（校验归属）。
 * @returns true=已删除；false=不存在或不归属该用户
 */
export const deleteNotebookUserModelProfile = async (
  userId: string,
  profileId: string,
): Promise<boolean> => {
  const database = getDb()
  if (!database) return false

  const result = await database
    .delete(notebookUserModelProfilesTable)
    .where(
      and(
        eq(notebookUserModelProfilesTable.profileId, profileId),
        eq(notebookUserModelProfilesTable.userId, userId),
      ),
    )

  const affected = (result as unknown as Array<{ affectedRows?: number }>)[0]?.affectedRows ?? 0
  return affected > 0
}

/**
 * 按 profileId + userId 读取单条配置（含 apiKey）。
 * 供 gateway 预注册时取完整 profile 用。
 */
export const getNotebookUserModelProfile = async (
  userId: string,
  profileId: string,
): Promise<WorkflowAiModelProfile | null> => {
  const database = getDb()
  if (!database) return null

  const rows = await database
    .select()
    .from(notebookUserModelProfilesTable)
    .where(
      and(
        eq(notebookUserModelProfilesTable.profileId, profileId),
        eq(notebookUserModelProfilesTable.userId, userId),
      ),
    )

  if (rows.length === 0) return null
  return rowToProfile(rows[0] as unknown as StoredRow)
}
