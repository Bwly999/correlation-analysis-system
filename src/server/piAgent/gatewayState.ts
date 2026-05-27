import type { PiAgentSessionRecord } from './sessionStore.js'
import { updateSessionRecord } from './sessionStore.js'

export interface PiAgentRuntimeStateCarrier {
  sessionId: string
  record: PiAgentSessionRecord
  runState: 'idle' | 'running' | 'completed' | 'interrupted' | 'failed'
  activeTurnState: 'responding' | 'tooling' | 'idle' | 'interrupted' | 'failed'
  currentTurnToolNames: string[]
  lastAssistantMessageText: string
  lastObservedToolName?: string
  pendingFollowUps: string[]
}

export const syncRuntimeStatus = (
  runtime: PiAgentRuntimeStateCarrier,
  status: PiAgentSessionRecord['status'],
  nextRunState: PiAgentRuntimeStateCarrier['runState'],
) => {
  runtime.runState = nextRunState
  updateSessionRecord(runtime.sessionId, {
    status,
    activeTurnState: runtime.activeTurnState,
    lastTurnEndedEarly: runtime.record.lastTurnEndedEarly,
    lastStopReason: runtime.record.lastStopReason,
    lastMessageRole: runtime.record.lastMessageRole,
    endedWithToolResult: runtime.record.endedWithToolResult,
    lastResumeTrigger: runtime.record.lastResumeTrigger,
    lastObservedToolName: runtime.record.lastObservedToolName,
    lastAssistantMessageText: runtime.record.lastAssistantMessageText,
    pendingFollowUps: [...runtime.pendingFollowUps],
  })
}

export const syncTurnState = (
  runtime: PiAgentRuntimeStateCarrier,
  nextTurnState: PiAgentRuntimeStateCarrier['activeTurnState'],
) => {
  runtime.activeTurnState = nextTurnState
  updateSessionRecord(runtime.sessionId, {
    activeTurnState: nextTurnState,
    pendingFollowUps: [...runtime.pendingFollowUps],
    lastTurnEndedEarly: runtime.record.lastTurnEndedEarly,
    lastStopReason: runtime.record.lastStopReason,
    lastMessageRole: runtime.record.lastMessageRole,
    endedWithToolResult: runtime.record.endedWithToolResult,
    lastResumeTrigger: runtime.record.lastResumeTrigger,
    lastObservedToolName: runtime.record.lastObservedToolName,
    lastAssistantMessageText: runtime.record.lastAssistantMessageText,
  })
}

export const syncPendingFollowUps = (runtime: PiAgentRuntimeStateCarrier) => {
  updateSessionRecord(runtime.sessionId, {
    pendingFollowUps: [...runtime.pendingFollowUps],
    activeTurnState: runtime.activeTurnState,
    lastTurnEndedEarly: runtime.record.lastTurnEndedEarly,
    lastStopReason: runtime.record.lastStopReason,
    lastMessageRole: runtime.record.lastMessageRole,
    endedWithToolResult: runtime.record.endedWithToolResult,
    lastResumeTrigger: runtime.record.lastResumeTrigger,
    lastObservedToolName: runtime.record.lastObservedToolName,
    lastAssistantMessageText: runtime.record.lastAssistantMessageText,
  })
}

export const resetTurnTracking = (runtime: PiAgentRuntimeStateCarrier) => {
  runtime.currentTurnToolNames = []
  runtime.lastAssistantMessageText = ''
  runtime.lastObservedToolName = undefined
  runtime.record.lastTurnEndedEarly = false
  runtime.record.lastStopReason = 'normal'
  runtime.record.endedWithToolResult = false
  runtime.record.lastObservedToolName = undefined
  runtime.record.lastAssistantMessageText = ''
  updateSessionRecord(runtime.sessionId, {
    lastTurnEndedEarly: false,
    lastStopReason: 'normal',
    endedWithToolResult: false,
    lastObservedToolName: undefined,
    lastAssistantMessageText: '',
  })
}
