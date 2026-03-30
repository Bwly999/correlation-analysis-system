import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { createDraftGraphFromWorkflowSnapshot } from '../../ai/draft/graph.js'
import type { WorkflowAiPlanRequest, WorkflowAiSessionState } from '../../ai/types.js'

type StoredWorkflowAiSession = {
  request: WorkflowAiPlanRequest
  state: WorkflowAiSessionState
  createdAt: number
  updatedAt: number
}

const DEFAULT_SESSION_TTL_MS = 1000 * 60 * 60 * 24
const SESSION_STORE_FILE =
  process.env.WORKFLOW_AI_SESSION_STORE_FILE
  || join(tmpdir(), 'correlation-analysis-system', 'workflow-ai-sessions.json')

const parseTtlMs = () => {
  const raw = Number(process.env.WORKFLOW_AI_SESSION_TTL_MS)
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_SESSION_TTL_MS
}

const ensureStoreDir = () => {
  mkdirSync(dirname(SESSION_STORE_FILE), { recursive: true })
}

const createSessionId = () =>
  `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

const loadSessions = () => {
  if (!existsSync(SESSION_STORE_FILE)) return new Map<string, StoredWorkflowAiSession>()

  try {
    const raw = readFileSync(SESSION_STORE_FILE, 'utf-8').trim()
    if (!raw) return new Map<string, StoredWorkflowAiSession>()
    const parsed = JSON.parse(raw) as Record<string, StoredWorkflowAiSession>
    return new Map(Object.entries(parsed))
  } catch {
    return new Map<string, StoredWorkflowAiSession>()
  }
}

const saveSessions = (sessions: Map<string, StoredWorkflowAiSession>) => {
  ensureStoreDir()
  writeFileSync(
    SESSION_STORE_FILE,
    JSON.stringify(Object.fromEntries(sessions.entries())),
    'utf-8',
  )
}

const pruneExpiredSessions = (sessions: Map<string, StoredWorkflowAiSession>) => {
  const ttlMs = parseTtlMs()
  const now = Date.now()

  for (const [sessionId, record] of sessions.entries()) {
    if (now - record.updatedAt > ttlMs) {
      sessions.delete(sessionId)
    }
  }

  return sessions
}

const withSessions = <T>(handler: (sessions: Map<string, StoredWorkflowAiSession>) => T): T => {
  const sessions = pruneExpiredSessions(loadSessions())
  const result = handler(sessions)
  saveSessions(sessions)
  return result
}

export const createWorkflowAiSession = (request: WorkflowAiPlanRequest): WorkflowAiSessionState =>
  withSessions((sessions) => {
    const sessionId = createSessionId()
    const now = Date.now()
    const state: WorkflowAiSessionState = {
      sessionId,
      mode: request.mode,
      status: 'idle',
      prompt: request.prompt,
      draft: createDraftGraphFromWorkflowSnapshot(request.workflowSnapshot),
      trace: [],
      diagnostics: {
        issues: [],
      },
      missingInfo: [],
      contextHints: request.contextHints,
      updatedAt: now,
    }

    sessions.set(sessionId, {
      request,
      state,
      createdAt: now,
      updatedAt: now,
    })

    return state
  })

export const getWorkflowAiSessionRecord = (sessionId: string): StoredWorkflowAiSession | null =>
  withSessions((sessions) => sessions.get(sessionId) ?? null)

export const getWorkflowAiSession = (sessionId: string): WorkflowAiSessionState | null =>
  withSessions((sessions) => sessions.get(sessionId)?.state ?? null)

export const updateWorkflowAiSession = (
  sessionId: string,
  updater: (record: StoredWorkflowAiSession) => void,
): WorkflowAiSessionState =>
  withSessions((sessions) => {
    const record = sessions.get(sessionId)
    if (!record) {
      throw Object.assign(new Error('未找到 AI 编排会话'), {
        statusCode: 404,
      })
    }

    updater(record)
    record.updatedAt = Date.now()
    record.state.updatedAt = record.updatedAt
    sessions.set(sessionId, record)
    return record.state
  })
