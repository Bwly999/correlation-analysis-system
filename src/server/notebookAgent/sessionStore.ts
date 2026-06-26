/**
 * Notebook Agent 会话存储（独立于 piAgent）。
 *
 * 协议见 docs/design-doc/notebook-agent/index.md §5.2：
 *   - 路由：/api/notebook-agent/* 与 /api/pi-agent/* 平级，零耦合
 *   - sessionStore 独立维护
 */

import { randomUUID } from 'node:crypto'
import type { ImportCsvMeta } from '../../notebook/shared/parentBridge.js'

export interface NotebookSessionInit {
  userId: string
  initialDataMeta?: ImportCsvMeta
  origin: string
}

export interface NotebookMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  rawContent?: string
  thinking?: string
  status: 'streaming' | 'completed'
  createdAt: number
}

export interface NotebookToolCall {
  id: string
  toolName: string
  args: unknown
  status: 'running' | 'success' | 'failed'
  result?: string
  isError?: boolean
  startedAt: number
  finishedAt?: number
}

export type NotebookSessionStatus =
  | 'idle'
  | 'running'
  | 'completed'
  | 'failed'
  | 'interrupted'

export interface NotebookSessionRecord {
  sessionId: string
  userId: string
  origin: string
  title: string
  sessionFile?: string
  bootstrapPromptedAt?: number
  initialDataMeta?: ImportCsvMeta
  status: NotebookSessionStatus
  dataReady: boolean
  messages: NotebookMessage[]
  toolCalls: NotebookToolCall[]
  createdAt: number
  updatedAt: number
  /**
   * 当前会话使用的模型 profileId（用于 resume 时恢复 + 前端展示当前模型）。
   * undefined = 使用默认模型（会话创建时取的第一个可用 profile）。
   */
  currentModelId?: string
  /**
   * 软关闭时间戳：关闭笔记本时只释放 runtime（Pi SDK AgentSession），
   * 但 record 保留以便 resume 回放历史；真正删除走显式 DELETE。
   * undefined = 仍存活（runtime 可能在线）。
   */
  archivedAt?: number
}

const sessions = new Map<string, NotebookSessionRecord>()
const formatTimestamp = (ts: number): string => {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}
const buildDefaultTitle = (ts: number = Date.now()): string => `数据分析_${formatTimestamp(ts)}`

/** 单用户保留的会话上限（LRU：超过则删掉最旧的已归档会话） */
const MAX_SESSIONS_PER_USER = 20

export const createNotebookSession = (
  init: NotebookSessionInit,
): NotebookSessionRecord => {
  const now = Date.now()
  const sessionId = randomUUID()
  const record: NotebookSessionRecord = {
    sessionId,
    userId: init.userId,
    origin: init.origin,
    title: buildDefaultTitle(now),
    bootstrapPromptedAt: undefined,
    initialDataMeta: init.initialDataMeta,
    status: 'idle',
    dataReady: false,
    messages: [],
    toolCalls: [],
    createdAt: now,
    updatedAt: now,
  }
  sessions.set(record.sessionId, record)
  // LRU：新建时清理该用户超限的已归档会话（最旧的优先）
  pruneArchivedSessionsForUser(init.userId)
  return record
}

export const buildDefaultNotebookTitle = (ts: number = Date.now()): string => buildDefaultTitle(ts)

/**
 * 清理某用户超限的已归档会话：只删 archivedAt 非空的，按 archivedAt 升序删除最旧的，
 * 直到该用户的会话总数 <= MAX_SESSIONS_PER_USER。存活的会话不受影响。
 */
const pruneArchivedSessionsForUser = (userId: string): void => {
  const userSessions = listNotebookSessionsByUser(userId)
  if (userSessions.length <= MAX_SESSIONS_PER_USER) return
  // 只在已归档的里面挑最旧的删
  const archived = userSessions
    .filter((r) => r.archivedAt !== undefined)
    .sort((a, b) => (a.archivedAt ?? 0) - (b.archivedAt ?? 0))
  let toRemove = userSessions.length - MAX_SESSIONS_PER_USER
  for (const r of archived) {
    if (toRemove <= 0) break
    sessions.delete(r.sessionId)
    toRemove -= 1
  }
}

export const getNotebookSession = (
  sessionId: string,
): NotebookSessionRecord | undefined => sessions.get(sessionId)

export const upsertNotebookSession = (
  record: NotebookSessionRecord,
): NotebookSessionRecord => {
  const existing = sessions.get(record.sessionId)
  if (existing) {
    Object.assign(existing, record)
    return existing
  }
  sessions.set(record.sessionId, record)
  return record
}

export const appendNotebookMessage = (
  sessionId: string,
  message: NotebookMessage,
): void => {
  const record = sessions.get(sessionId)
  if (!record) return
  record.messages.push(message)
  record.updatedAt = Date.now()
}

export const appendNotebookToolCall = (
  sessionId: string,
  toolCall: NotebookToolCall,
): void => {
  const record = sessions.get(sessionId)
  if (!record) return
  record.toolCalls.push(toolCall)
  record.updatedAt = Date.now()
}

export const updateNotebookToolCall = (
  sessionId: string,
  toolCallId: string,
  update: Partial<Pick<NotebookToolCall, 'status' | 'result' | 'isError' | 'finishedAt'>>,
): void => {
  const record = sessions.get(sessionId)
  if (!record) return
  const tc = record.toolCalls.find((t) => t.id === toolCallId)
  if (tc) Object.assign(tc, update)
  record.updatedAt = Date.now()
}

export const endNotebookSession = (
  sessionId: string,
  status: Exclude<NotebookSessionStatus, 'idle' | 'running'>,
): void => {
  const record = sessions.get(sessionId)
  if (!record) return
  record.status = status
  record.updatedAt = Date.now()
}

export const updateNotebookSessionRecord = (
  sessionId: string,
  update: Partial<Pick<
    NotebookSessionRecord,
    'status' | 'dataReady' | 'bootstrapPromptedAt' | 'archivedAt' | 'sessionFile' | 'currentModelId'
  >>,
): void => {
  const record = sessions.get(sessionId)
  if (!record) return
  Object.assign(record, update)
  record.updatedAt = Date.now()
}

export const updateNotebookSessionTitle = (
  sessionId: string,
  title: string,
): boolean => {
  const record = sessions.get(sessionId)
  if (!record) return false
  record.title = title
  record.updatedAt = Date.now()
  return true
}

export const markNotebookSessionBootstrapPrompted = (sessionId: string): boolean => {
  const record = sessions.get(sessionId)
  if (!record) return false
  record.bootstrapPromptedAt = Date.now()
  record.updatedAt = Date.now()
  return true
}

/**
 * 列出某用户最近的 notebook 会话（按 updatedAt 倒序）。
 * 用于前端「继续上次分析」入口探测 + 历史列表。
 */
export const listNotebookSessionsByUser = (
  userId: string,
): NotebookSessionRecord[] => {
  const list: NotebookSessionRecord[] = []
  for (const record of sessions.values()) {
    if (record.userId === userId) list.push(record)
  }
  list.sort((a, b) => b.updatedAt - a.updatedAt || b.createdAt - a.createdAt)
  return list
}

/**
 * 软关闭会话：只标记 archivedAt，record 保留在内存中，
 * 以便 resume 时能回放历史消息。真正清理走 deleteNotebookSession。
 */
export const archiveNotebookSession = (sessionId: string): void => {
  const record = sessions.get(sessionId)
  if (!record) return
  record.archivedAt = Date.now()
  record.updatedAt = Date.now()
}

/**
 * 彻底删除会话 record（显式 DELETE 端点调用）。
 */
export const deleteNotebookSession = (sessionId: string): boolean => {
  return sessions.delete(sessionId)
}

/** 单测专用：清空所有会话 */
export const __resetNotebookSessionsForTest = (): void => {
  sessions.clear()
}
