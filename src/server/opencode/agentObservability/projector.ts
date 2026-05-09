import type {
  AgentObservabilityDebugReplayResponse,
  AgentObservabilityEvent,
  AgentObservabilityReplayMarker,
  AgentObservabilityReplayState,
  AnalysisAgentToolCall,
} from '../../../ai/types.js'

const buildInitialReplayState = (): AgentObservabilityReplayState => ({
  cursorSeq: 0,
  sessionStatus: null,
  latestKernelStage: null,
  latestKernelMessage: null,
  latestToolCalls: [],
  latestProjection: null,
  latestRawMessage: null,
  latestError: null,
})

const upsertToolCall = (toolCalls: AnalysisAgentToolCall[], incoming: AnalysisAgentToolCall) => {
  const index = toolCalls.findIndex((item) => item.id === incoming.id)
  if (index >= 0) {
    toolCalls.splice(index, 1, {
      ...toolCalls[index],
      ...incoming,
    })
    return
  }
  toolCalls.push(incoming)
}

const shouldCreateReplayMarker = (event: AgentObservabilityEvent) =>
  event.kind === 'session.lifecycle'
  || event.kind === 'tool.call'
  || event.kind === 'error.raised'
  || event.kind === 'projection.snapshot'
  || event.kind === 'kernel.intent'

export const buildAgentObservabilityReplay = (
  sessionId: string,
  traceId: string,
  events: AgentObservabilityEvent[],
  cursorSeq?: number,
): AgentObservabilityDebugReplayResponse => {
  const state = buildInitialReplayState()
  const targetSeq = cursorSeq ?? events[events.length - 1]?.seq ?? 0
  const replayMarkers: AgentObservabilityReplayMarker[] = []

  for (const event of events) {
    if (event.seq > targetSeq) break
    state.cursorSeq = event.seq

    if (event.kind === 'session.lifecycle') {
      const status = (event.payload as { status?: AgentObservabilityReplayState['sessionStatus'] } | undefined)?.status
      state.sessionStatus = status ?? state.sessionStatus
    }

    if (event.kind === 'kernel.intent') {
      const payload = event.payload as { stage?: string, verificationMessage?: string } | undefined
      state.latestKernelStage = payload?.stage ?? state.latestKernelStage
      state.latestKernelMessage = payload?.verificationMessage ?? state.latestKernelMessage
    }

    if (event.kind === 'tool.call') {
      const toolCall = (event.payload as { toolCall?: AnalysisAgentToolCall } | undefined)?.toolCall
      if (toolCall) {
        upsertToolCall(state.latestToolCalls, toolCall)
      }
    }

    if (event.kind === 'projection.snapshot') {
      const projection = (event.payload as { snapshot?: AgentObservabilityReplayState['latestProjection'] } | undefined)?.snapshot
      if (projection) {
        state.latestProjection = projection
        if (projection.error) {
          state.latestError = {
            summary: projection.error.message,
            payload: {
              detail: projection.error.detail,
              occurredAt: projection.error.occurredAt,
            },
          }
        }
      }
    }

    if (event.kind === 'message.raw') {
      const rawMessage = (event.payload as { rawMessage?: AgentObservabilityReplayState['latestRawMessage'] } | undefined)?.rawMessage
      if (rawMessage) {
        state.latestRawMessage = rawMessage
      }
    }

    if (event.kind === 'error.raised') {
      state.latestError = {
        summary: event.summary,
        payload: event.payload,
      }
    }

    if (shouldCreateReplayMarker(event)) {
      replayMarkers.push({
        label: event.summary,
        seq: event.seq,
        timestamp: event.timestamp,
        kind: event.kind,
      })
    }
  }

  return {
    sessionId,
    traceId,
    totalEvents: events.length,
    replayMarkers,
    state,
  }
}
