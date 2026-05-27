import type { PiAgentSseEvent } from './eventBridge.js'
import type { PiAgentRuntimeStateCarrier } from './gatewayState.js'
import { syncRuntimeStatus } from './gatewayState.js'

const READ_ONLY_TOOL_NAMES = new Set([
  'workflow_get_session_context',
  'workflow_get_node_catalog',
  'workflow_get_node',
])

const TRANSITIONAL_ASSISTANT_TEXT_PATTERN = /(我来看看|我先看看|我来查看|我先查看|我先读|我来读|我先读取|我来读取|好的，我来看看|好的，我先看看)/
const RESUMABLE_CONTINUE_MESSAGES = new Set([
  '继续',
  '继续哦',
  '继续o',
  '继续噢',
  '还在不',
  '还在吗',
  '?',
  '？',
])

export const normalizeContinueMessage = (message: string) =>
  message.replace(/[\s，。！？!?,、~～…]/g, '').trim().toLowerCase()

export const isResumableContinueMessage = (message: string) =>
  RESUMABLE_CONTINUE_MESSAGES.has(normalizeContinueMessage(message))

export const isEmptyToolResultStop = (runtime: PiAgentRuntimeStateCarrier) =>
  runtime.record.endedWithToolResult
  && !runtime.lastAssistantMessageText.trim()
  && runtime.currentTurnToolNames.length > 0

export const isEarlyEndedTurn = (runtime: PiAgentRuntimeStateCarrier) => {
  if (!runtime.lastAssistantMessageText.trim()) return false
  if (!TRANSITIONAL_ASSISTANT_TEXT_PATTERN.test(runtime.lastAssistantMessageText)) return false
  if (runtime.currentTurnToolNames.length === 0) return false
  return runtime.currentTurnToolNames.every((toolName) => READ_ONLY_TOOL_NAMES.has(toolName))
}

export const buildStopDiagnosisEvents = (
  runtime: PiAgentRuntimeStateCarrier,
  emitRuntimeEvent: (event: PiAgentSseEvent) => void,
) => {
  const endedEarly = isEarlyEndedTurn(runtime)
  const endedWithToolResult = runtime.record.lastMessageRole === 'toolResult'
  const emptyToolResultStop = isEmptyToolResultStop(runtime)

  runtime.record.lastTurnEndedEarly = endedEarly
  runtime.record.endedWithToolResult = endedWithToolResult
  runtime.record.lastStopReason = emptyToolResultStop
    ? 'failed'
    : endedEarly
      ? 'read_only_observation_end'
      : 'normal'
  runtime.record.lastObservedToolName = runtime.lastObservedToolName
  runtime.record.lastAssistantMessageText = runtime.lastAssistantMessageText
  runtime.activeTurnState = emptyToolResultStop ? 'failed' : 'idle'

  syncRuntimeStatus(
    runtime,
    emptyToolResultStop ? 'failed' : 'completed',
    emptyToolResultStop ? 'failed' : 'completed',
  )

  emitRuntimeEvent({
    type: 'session.stop_diagnosis',
    sessionId: runtime.sessionId,
    stopReason: runtime.record.lastStopReason,
    message: emptyToolResultStop
      ? '本轮未产生回复，可重试继续分析'
      : endedEarly
        ? '本轮在读取信息后已停止，可继续追问或继续分析'
        : '本轮已正常结束',
    endedWithToolResult,
    ...(runtime.lastObservedToolName ? { lastObservedToolName: runtime.lastObservedToolName } : {}),
    ...(runtime.lastAssistantMessageText ? { lastAssistantMessageText: runtime.lastAssistantMessageText } : {}),
  })

  if (endedEarly) {
    emitRuntimeEvent({
      type: 'session.ended_early',
      sessionId: runtime.sessionId,
      message: '本轮在读取信息后已停止，可继续追问或继续分析',
    })
  } else if (emptyToolResultStop) {
    emitRuntimeEvent({
      type: 'error',
      sessionId: runtime.sessionId,
      message: '本轮未产生回复，可重试继续分析',
    })
  }
}

export const interruptRuntime = (
  runtime: PiAgentRuntimeStateCarrier,
  message: string,
  emitRuntimeEvent: (event: PiAgentSseEvent) => void,
  options?: { status?: 'interrupted' | 'failed' },
) => {
  const status = options?.status ?? 'interrupted'
  runtime.record.lastTurnEndedEarly = false
  runtime.record.lastStopReason = status
  runtime.record.endedWithToolResult = false
  runtime.record.lastObservedToolName = runtime.lastObservedToolName
  runtime.record.lastAssistantMessageText = runtime.lastAssistantMessageText
  runtime.pendingFollowUps = []
  runtime.activeTurnState = status
  syncRuntimeStatus(runtime, status, status)
  emitRuntimeEvent({
    type: 'session.stop_diagnosis',
    sessionId: runtime.sessionId,
    stopReason: status,
    message,
    endedWithToolResult: runtime.record.endedWithToolResult,
    ...(runtime.lastObservedToolName ? { lastObservedToolName: runtime.lastObservedToolName } : {}),
    ...(runtime.lastAssistantMessageText ? { lastAssistantMessageText: runtime.lastAssistantMessageText } : {}),
  })
  emitRuntimeEvent({
    type: 'session.interrupted',
    sessionId: runtime.sessionId,
    message,
  })
  if (status === 'failed') {
    emitRuntimeEvent({
      type: 'error',
      sessionId: runtime.sessionId,
      message,
    })
  }
}
