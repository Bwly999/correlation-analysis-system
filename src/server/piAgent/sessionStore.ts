/**
 * Pi Agent 会话存储（简化版）
 */
import { randomUUID } from 'node:crypto'
import type { WorkflowAiModelProfile, WorkflowAiPlanRequest } from '../../ai/types.js'
import { sanitizePiAgentDataSources } from './safePayload.js'

export interface PiAgentSessionRecord {
  sessionId: string
  userId: string
  status: 'idle' | 'running' | 'completed' | 'failed'
  mode: 'create' | 'edit'
  prompt: string
  profile: Pick<WorkflowAiModelProfile, 'id' | 'name' | 'model'>
  request: WorkflowAiPlanRequest
  messages: PiAgentMessage[]
  toolCalls: PiAgentToolCall[]
  createdAt: number
  updatedAt: number
}

export interface PiAgentMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  thinking?: string
  status: 'streaming' | 'completed'
  createdAt: number
}

export interface PiAgentToolCall {
  id: string
  toolName: string
  displayName: string
  args: unknown
  status: 'running' | 'success' | 'failed'
  result?: string
  isError?: boolean
  startedAt: number
  finishedAt?: number
}

const sessions = new Map<string, PiAgentSessionRecord>()

export function createSessionRecord(
  request: WorkflowAiPlanRequest,
  userId: string,
): PiAgentSessionRecord {
  const now = Date.now()
  const sanitizedRequest: WorkflowAiPlanRequest = {
    ...request,
    dataSources: sanitizePiAgentDataSources(request.dataSources).map((dataSource) => ({
      ...dataSource,
      bindingPayload: {},
    })) as WorkflowAiPlanRequest['dataSources'],
  }
  const record: PiAgentSessionRecord = {
    sessionId: randomUUID(),
    userId,
    status: 'idle',
    mode: sanitizedRequest.mode,
    prompt: sanitizedRequest.prompt,
    profile: {
      id: sanitizedRequest.profile.id,
      name: sanitizedRequest.profile.name,
      model: sanitizedRequest.profile.model,
    },
    request: sanitizedRequest,
    messages: [],
    toolCalls: [],
    createdAt: now,
    updatedAt: now,
  }
  sessions.set(record.sessionId, record)
  return record
}

export function getSessionRecord(sessionId: string): PiAgentSessionRecord | undefined {
  return sessions.get(sessionId)
}

export function updateSessionRecord(
  sessionId: string,
  update: Partial<Pick<PiAgentSessionRecord, 'status' | 'updatedAt' | 'request'>>,
): void {
  const record = sessions.get(sessionId)
  if (!record) return
  Object.assign(record, update, { updatedAt: Date.now() })
}

export function appendMessage(sessionId: string, message: PiAgentMessage): void {
  const record = sessions.get(sessionId)
  if (!record) return
  record.messages.push(message)
  record.updatedAt = Date.now()
}

export function appendToolCall(sessionId: string, toolCall: PiAgentToolCall): void {
  const record = sessions.get(sessionId)
  if (!record) return
  record.toolCalls.push(toolCall)
  record.updatedAt = Date.now()
}

export function updateToolCall(
  sessionId: string,
  toolCallId: string,
  update: Partial<Pick<PiAgentToolCall, 'status' | 'result' | 'isError' | 'finishedAt'>>,
): void {
  const record = sessions.get(sessionId)
  if (!record) return
  const tc = record.toolCalls.find((t) => t.id === toolCallId)
  if (tc) Object.assign(tc, update)
  record.updatedAt = Date.now()
}
