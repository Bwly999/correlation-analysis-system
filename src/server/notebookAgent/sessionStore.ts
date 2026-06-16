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
  initialDataMeta: ImportCsvMeta
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
  initialDataMeta: ImportCsvMeta
  status: NotebookSessionStatus
  messages: NotebookMessage[]
  toolCalls: NotebookToolCall[]
  createdAt: number
  updatedAt: number
}

const sessions = new Map<string, NotebookSessionRecord>()

export const createNotebookSession = (
  init: NotebookSessionInit,
): NotebookSessionRecord => {
  const now = Date.now()
  const record: NotebookSessionRecord = {
    sessionId: randomUUID(),
    userId: init.userId,
    origin: init.origin,
    initialDataMeta: init.initialDataMeta,
    status: 'idle',
    messages: [],
    toolCalls: [],
    createdAt: now,
    updatedAt: now,
  }
  sessions.set(record.sessionId, record)
  return record
}

export const getNotebookSession = (
  sessionId: string,
): NotebookSessionRecord | undefined => sessions.get(sessionId)

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
  update: Partial<Pick<NotebookSessionRecord, 'status'>>,
): void => {
  const record = sessions.get(sessionId)
  if (!record) return
  Object.assign(record, update)
  record.updatedAt = Date.now()
}

/** 单测专用：清空所有会话 */
export const __resetNotebookSessionsForTest = (): void => {
  sessions.clear()
}
