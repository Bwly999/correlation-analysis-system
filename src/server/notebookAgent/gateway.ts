/**
 * Notebook Agent gateway（最小路径骨架）。
 *
 * M1 第一阶段：只承担 session 管理 + system prompt + tool-result 入库。
 *      LLM 推理（消息流 / SSE）的接入留给 piAgent SDK 复用迭代二阶段做。
 */

import { buildNotebookSystemPrompt } from './systemPrompt.js'
import {
  appendNotebookMessage,
  appendNotebookToolCall,
  createNotebookSession,
  endNotebookSession,
  getNotebookSession,
  updateNotebookToolCall,
  type NotebookSessionRecord,
} from './sessionStore.js'
import type { ImportCsvMeta } from '../../notebook/shared/parentBridge.js'

export interface CreateNotebookSessionInput {
  userId: string
  initialDataMeta: ImportCsvMeta
  origin: string
}

export interface CreateNotebookSessionResult {
  sessionId: string
  systemPrompt: string
}

export const createNotebookAgentSession = (
  input: CreateNotebookSessionInput,
): CreateNotebookSessionResult => {
  const record = createNotebookSession({
    userId: input.userId,
    initialDataMeta: input.initialDataMeta,
    origin: input.origin,
  })
  const systemPrompt = buildNotebookSystemPrompt({
    initialDataMeta: input.initialDataMeta,
  })
  return { sessionId: record.sessionId, systemPrompt }
}

export const getNotebookAgentSessionOwner = (sessionId: string): string | null =>
  getNotebookSession(sessionId)?.userId ?? null

export const getNotebookAgentSessionView = (sessionId: string) => {
  const r = getNotebookSession(sessionId)
  if (!r) return undefined
  return summarize(r)
}

export const closeNotebookAgentSession = (sessionId: string): boolean => {
  const r = getNotebookSession(sessionId)
  if (!r) return false
  endNotebookSession(sessionId, 'completed')
  return true
}

export const recordNotebookAgentMessage = (
  sessionId: string,
  payload: {
    id: string
    role: 'user' | 'assistant'
    content: string
  },
): boolean => {
  if (!getNotebookSession(sessionId)) return false
  appendNotebookMessage(sessionId, {
    id: payload.id,
    role: payload.role,
    content: payload.content,
    status: 'completed',
    createdAt: Date.now(),
  })
  return true
}

export const recordNotebookAgentToolCall = (
  sessionId: string,
  payload: {
    id: string
    toolName: string
    args: unknown
  },
): boolean => {
  if (!getNotebookSession(sessionId)) return false
  appendNotebookToolCall(sessionId, {
    id: payload.id,
    toolName: payload.toolName,
    args: payload.args,
    status: 'running',
    startedAt: Date.now(),
  })
  return true
}

export const finishNotebookAgentToolCall = (
  sessionId: string,
  toolCallId: string,
  payload: { result?: string; isError?: boolean },
): boolean => {
  if (!getNotebookSession(sessionId)) return false
  updateNotebookToolCall(sessionId, toolCallId, {
    status: payload.isError ? 'failed' : 'success',
    result: payload.result,
    isError: payload.isError,
    finishedAt: Date.now(),
  })
  return true
}

const summarize = (r: NotebookSessionRecord) => ({
  sessionId: r.sessionId,
  status: r.status,
  origin: r.origin,
  initialDataMeta: r.initialDataMeta,
  messages: r.messages,
  toolCalls: r.toolCalls,
  createdAt: r.createdAt,
  updatedAt: r.updatedAt,
})
