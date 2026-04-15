import { randomUUID } from 'node:crypto'
import type {
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
  userId?: string
  listeners: Set<(event: AgentSessionEvent) => void>
}

const records = new Map<string, AgentSessionRecord>()

export const createAgentSessionRecord = (input: {
  request: WorkflowAiPlanRequest
  projection: AgentProjectionSnapshot
  userId?: string
}) => {
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
    userId: input.userId,
    listeners: new Set(),
  }

  records.set(id, record)
  return record
}

export const getAgentSessionRecord = (sessionId: string) => records.get(sessionId) ?? null

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

