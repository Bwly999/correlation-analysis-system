import { randomUUID } from 'node:crypto'
import type {
  AgentExecutionRecord,
  AgentSessionDebugEvent,
  AgentSessionDebugParseFailure,
  AgentSessionDebugRawMessage,
  AgentSessionDebugToolCall,
  AgentSessionDebugTrace,
  AgentProjectionSnapshot,
  AgentSessionEvent,
  AgentSessionMessage,
  AgentSessionState,
  WorkflowAiPlanRequest,
} from '../../ai/types.js'

export type AgentSessionRecord = {
  session: AgentSessionState
  request: WorkflowAiPlanRequest
  projection: AgentProjectionSnapshot
  messages: AgentSessionMessage[]
  executions: Map<string, AgentExecutionRecord>
  debugTrace: AgentSessionDebugTrace
  userId?: string
  listeners: Set<(event: AgentSessionEvent) => void>
}

const records = new Map<string, AgentSessionRecord>()
let expiredSessionsCleaned = 0
let maxSessionsEvicted = 0

const DEFAULT_AGENT_SESSION_TTL_MS = 30 * 60 * 1000
const DEFAULT_AGENT_SESSION_MAX = 200
const MAX_AGENT_DEBUG_ITEMS = 200

const pushCapped = <T>(items: T[], nextItem: T, limit = MAX_AGENT_DEBUG_ITEMS) => {
  items.push(nextItem)
  if (items.length > limit) {
    items.splice(0, items.length - limit)
  }
}

const resolvePositiveInteger = (raw: string | undefined, fallback: number) => {
  const value = Number(raw)
  return Number.isFinite(value) && value > 0 ? value : fallback
}

const resolveAgentSessionTtlMs = () =>
  resolvePositiveInteger(process.env.AGENT_SESSION_TTL_MS, DEFAULT_AGENT_SESSION_TTL_MS)

const resolveAgentSessionMax = () =>
  resolvePositiveInteger(process.env.AGENT_SESSION_MAX, DEFAULT_AGENT_SESSION_MAX)

export const cleanupExpiredAgentSessions = () => {
  const ttlMs = resolveAgentSessionTtlMs()
  const now = Date.now()

  for (const [sessionId, record] of records.entries()) {
    if (now - record.session.updatedAt <= ttlMs) continue
    records.delete(sessionId)
    expiredSessionsCleaned += 1
  }
}

const evictOverflowSessions = () => {
  const maxSessions = resolveAgentSessionMax()
  if (records.size < maxSessions) return

  const oldestSession = [...records.values()]
    .sort((left, right) => left.session.updatedAt - right.session.updatedAt)[0]

  if (!oldestSession) return
  records.delete(oldestSession.session.id)
  maxSessionsEvicted += 1
}

export const getAgentSessionStoreSnapshot = () => {
  cleanupExpiredAgentSessions()
  return {
    activeSessions: records.size,
    expiredSessionsCleaned,
    maxSessionsEvicted,
    ttlMs: resolveAgentSessionTtlMs(),
    maxSessions: resolveAgentSessionMax(),
  }
}

export const createAgentSessionRecord = (input: {
  request: WorkflowAiPlanRequest
  projection: AgentProjectionSnapshot
  userId?: string
}) => {
  cleanupExpiredAgentSessions()
  evictOverflowSessions()
  const now = Date.now()
  const id = randomUUID()
  const record: AgentSessionRecord = {
    session: {
      id,
      mode: input.request.mode,
      prompt: input.request.prompt,
      status: 'idle',
      profile: {
        id: input.request.profile.id,
        name: input.request.profile.name,
        model: input.request.profile.model,
      },
      workflowId: null,
      createdAt: now,
      updatedAt: now,
    },
    request: input.request,
    projection: input.projection,
    messages: [],
    executions: new Map(),
    debugTrace: {
      events: [],
      toolCalls: [],
      rawMessages: [],
      parseFailures: [],
    },
    userId: input.userId,
    listeners: new Set(),
  }

  records.set(id, record)
  return record
}

export const getAgentSessionRecord = (sessionId: string) => {
  cleanupExpiredAgentSessions()
  return records.get(sessionId) ?? null
}

export const listAgentSessionMessages = (sessionId: string) => getAgentSessionRecord(sessionId)?.messages ?? []

export const updateAgentSessionRecord = (
  sessionId: string,
  updater: (record: AgentSessionRecord) => void,
) => {
  const record = getAgentSessionRecord(sessionId)
  if (!record) return null
  updater(record)
  record.session.updatedAt = Date.now()
  return record
}

export const appendAgentSessionMessage = (sessionId: string, message: AgentSessionMessage) =>
  updateAgentSessionRecord(sessionId, (record) => {
    record.messages.push(message)
  })

export const createAgentExecutionRecord = (
  sessionId: string,
  input: Omit<AgentExecutionRecord, 'executionId' | 'createdAt'>,
) => {
  const executionId = randomUUID()
  const createdAt = Date.now()
  const execution: AgentExecutionRecord = {
    executionId,
    createdAt,
    ...input,
  }

  const record = updateAgentSessionRecord(sessionId, (draft) => {
    draft.executions.set(executionId, execution)
  })

  return record ? execution : null
}

export const getAgentExecutionRecord = (sessionId: string, executionId: string) =>
  getAgentSessionRecord(sessionId)?.executions.get(executionId) ?? null

export const getAgentSessionDebugTrace = (sessionId: string) =>
  getAgentSessionRecord(sessionId)?.debugTrace ?? null

export const appendAgentSessionDebugEvent = (
  sessionId: string,
  event: AgentSessionDebugEvent,
) =>
  updateAgentSessionRecord(sessionId, (record) => {
    pushCapped(record.debugTrace.events, event)
  })

export const appendAgentSessionDebugToolCall = (
  sessionId: string,
  toolCall: AgentSessionDebugToolCall,
) =>
  updateAgentSessionRecord(sessionId, (record) => {
    const existing = toolCall.toolCallId
      ? record.debugTrace.toolCalls.find((item) => item.toolCallId === toolCall.toolCallId)
      : null

    if (existing) {
      existing.status = toolCall.status
      existing.timestamp = toolCall.timestamp
      existing.payload = toolCall.payload
      existing.title = toolCall.title ?? existing.title
      existing.toolName = toolCall.toolName || existing.toolName
      return
    }

    pushCapped(record.debugTrace.toolCalls, toolCall)
  })

export const appendAgentSessionDebugRawMessage = (
  sessionId: string,
  rawMessage: AgentSessionDebugRawMessage,
) =>
  updateAgentSessionRecord(sessionId, (record) => {
    pushCapped(record.debugTrace.rawMessages, rawMessage)
  })

export const appendAgentSessionDebugParseFailure = (
  sessionId: string,
  parseFailure: AgentSessionDebugParseFailure,
) =>
  updateAgentSessionRecord(sessionId, (record) => {
    pushCapped(record.debugTrace.parseFailures, parseFailure)
  })

export const subscribeAgentSessionEvents = (
  sessionId: string,
  listener: (event: AgentSessionEvent) => void,
) => {
  const record = getAgentSessionRecord(sessionId)
  if (!record) return null
  record.listeners.add(listener)
  return () => {
    record.listeners.delete(listener)
  }
}

export const publishAgentSessionEvent = (sessionId: string, event: AgentSessionEvent) => {
  const record = getAgentSessionRecord(sessionId)
  if (!record) return
  for (const listener of record.listeners) {
    listener(event)
  }
}
