import { randomUUID } from 'node:crypto'
import type {
  AgentObservabilityDebugHealth,
  AgentObservabilityDebugReplayResponse,
  AgentObservabilityDebugTraceResponse,
  AgentObservabilityEvent,
  AgentObservabilityLogFiles,
  AgentObservabilityProjectionSnapshotEntry,
  AgentObservabilitySummary,
  AgentObservabilityTraceManifest,
  AgentProjectionSnapshot,
  AgentSessionDebugParseFailure,
  AgentSessionDebugRawMessage,
  AgentSessionState,
  WorkflowAiPlanRequest,
} from '../../../ai/types.js'
import {
  appendAgentObservabilityEventLog,
  appendAgentObservabilityParseFailureLog,
  appendAgentObservabilityProjectionSnapshotLog,
  appendAgentObservabilityRawMessageLog,
  createAgentObservabilityLogFiles,
  writeAgentObservabilityFailureFile,
  writeAgentObservabilityManifest,
  writeAgentObservabilitySessionFile,
  writeAgentObservabilitySummary,
} from './logger.js'
import { buildAgentObservabilityReplay } from './projector.js'
import { getAgentObservabilityRootDir, isAgentObservabilityEnabled } from './env.js'

type AgentObservabilityTraceRecord = {
  sessionId: string
  traceId: string
  request: WorkflowAiPlanRequest
  userId?: string
  files: AgentObservabilityLogFiles
  summary: AgentObservabilitySummary
  events: AgentObservabilityEvent[]
  projectionSnapshots: AgentObservabilityProjectionSnapshotEntry[]
  rawMessages: AgentSessionDebugRawMessage[]
  parseFailures: AgentSessionDebugParseFailure[]
  nextSeq: number
}

const traces = new Map<string, AgentObservabilityTraceRecord>()
let lastWriteAt: number | null = null
let writeFailures = 0

const safeWrite = (writer: () => void) => {
  try {
    writer()
    lastWriteAt = Date.now()
  } catch {
    writeFailures += 1
  }
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

const getChangedProjectionDomains = (
  previous: AgentProjectionSnapshot,
  next: AgentProjectionSnapshot,
) => {
  const changedDomains: Array<'workflow' | 'analysis' | 'execution' | 'canvasSync' | 'error'> = []

  if (JSON.stringify(previous.workflow) !== JSON.stringify(next.workflow)) changedDomains.push('workflow')
  if (JSON.stringify(previous.analysis) !== JSON.stringify(next.analysis)) changedDomains.push('analysis')
  if (JSON.stringify(previous.execution) !== JSON.stringify(next.execution)) changedDomains.push('execution')
  if (JSON.stringify(previous.canvasSync) !== JSON.stringify(next.canvasSync)) changedDomains.push('canvasSync')
  if (JSON.stringify(previous.error) !== JSON.stringify(next.error)) changedDomains.push('error')

  return changedDomains
}

const updateManifest = (record: AgentObservabilityTraceRecord) => {
  const manifest: AgentObservabilityTraceManifest = {
    sessionId: record.sessionId,
    traceId: record.traceId,
    model: record.request.profile.model,
    profileId: record.request.profile.id,
    profileName: record.request.profile.name,
    prompt: record.request.prompt,
    mode: record.request.mode,
    userId: record.userId,
    createdAt: record.summary.startedAt,
    updatedAt: record.summary.lastUpdatedAt,
    files: record.files,
    summary: record.summary,
  }

  safeWrite(() => writeAgentObservabilityManifest(record.files, manifest))
}

const persistSummary = (record: AgentObservabilityTraceRecord) => {
  safeWrite(() => writeAgentObservabilitySummary(record.files, record.summary))
  updateManifest(record)
}

export const initializeAgentObservabilityTrace = (input: {
  sessionId: string
  request: WorkflowAiPlanRequest
  userId?: string
  session: AgentSessionState
  projection: AgentProjectionSnapshot
}) => {
  if (!isAgentObservabilityEnabled()) return null

  const files = createAgentObservabilityLogFiles(input.sessionId)
  const traceId = `trace_${randomUUID().replace(/-/g, '')}`
  const summary: AgentObservabilitySummary = {
    sessionId: input.sessionId,
    traceId,
    startedAt: Date.now(),
    lastUpdatedAt: Date.now(),
    eventCount: 0,
    projectionSnapshotCount: 0,
    rawMessageCount: 0,
    parseFailureCount: 0,
    failed: false,
    latestStatus: input.session.status,
    latestError: null,
  }

  const record: AgentObservabilityTraceRecord = {
    sessionId: input.sessionId,
    traceId,
    request: input.request,
    userId: input.userId,
    files,
    summary,
    events: [],
    projectionSnapshots: [],
    rawMessages: [],
    parseFailures: [],
    nextSeq: 1,
  }

  traces.set(input.sessionId, record)

  safeWrite(() => writeAgentObservabilitySessionFile(files, {
    request: input.request,
    session: input.session,
    initialProjection: input.projection,
  }))
  persistSummary(record)

  return record
}

export const appendAgentObservabilityEvent = (
  sessionId: string,
  input: Omit<AgentObservabilityEvent, 'sessionId' | 'traceId' | 'seq' | 'timestamp'> & {
    timestamp?: number
  },
) => {
  const record = traces.get(sessionId)
  if (!record || !isAgentObservabilityEnabled()) return null

  const event: AgentObservabilityEvent = {
    sessionId,
    traceId: record.traceId,
    seq: record.nextSeq++,
    timestamp: input.timestamp ?? Date.now(),
    source: input.source,
    kind: input.kind,
    summary: input.summary,
    ...(input.payload !== undefined ? { payload: clone(input.payload) } : {}),
  }

  record.events.push(event)
  record.summary.eventCount = record.events.length
  record.summary.lastUpdatedAt = event.timestamp

  if (event.kind === 'session.lifecycle') {
    const status = (event.payload as { status?: AgentSessionState['status'] } | undefined)?.status
    if (status) {
      record.summary.latestStatus = status
      record.summary.failed = status === 'failed'
    }
  }

  if (event.kind === 'message.raw') {
    const rawMessage = (event.payload as { rawMessage?: AgentSessionDebugRawMessage } | undefined)?.rawMessage
    if (rawMessage) {
      record.rawMessages.push(rawMessage)
      record.summary.rawMessageCount = record.rawMessages.length
      safeWrite(() => appendAgentObservabilityRawMessageLog(record.files, rawMessage))
    }
  }

  if (event.kind === 'message.parse') {
    const parseFailure = (event.payload as { parseFailure?: AgentSessionDebugParseFailure } | undefined)?.parseFailure
    if (parseFailure) {
      record.parseFailures.push(parseFailure)
      record.summary.parseFailureCount = record.parseFailures.length
      safeWrite(() => appendAgentObservabilityParseFailureLog(record.files, parseFailure))
    }
  }

  if (event.kind === 'error.raised') {
    record.summary.latestError = event.summary
    safeWrite(() => writeAgentObservabilityFailureFile(record.files, {
      sessionId,
      traceId: record.traceId,
      failedAt: event.timestamp,
      summary: event.summary,
      payload: event.payload ?? null,
    }))
  }

  safeWrite(() => appendAgentObservabilityEventLog(record.files, event))
  persistSummary(record)

  return event
}

export const recordAgentObservabilityProjection = (
  sessionId: string,
  previous: AgentProjectionSnapshot,
  next: AgentProjectionSnapshot,
  source: AgentObservabilityEvent['source'] = 'projection',
) => {
  const record = traces.get(sessionId)
  if (!record || !isAgentObservabilityEnabled()) return null

  const changedDomains = getChangedProjectionDomains(previous, next)
  if (!changedDomains.length) return null

  appendAgentObservabilityEvent(sessionId, {
    source,
    kind: 'projection.diff',
    summary: `Projection 已更新：${changedDomains.join('、')}`,
    payload: {
      changedDomains,
      projection: clone(next),
    },
  })

  const snapshotEvent = appendAgentObservabilityEvent(sessionId, {
    source,
    kind: 'projection.snapshot',
    summary: '记录 Projection 快照',
    payload: {
      changedDomains,
      snapshot: clone(next),
    },
  })

  if (!snapshotEvent) return null

  const snapshotEntry: AgentObservabilityProjectionSnapshotEntry = {
    sessionId,
    traceId: record.traceId,
    seq: snapshotEvent.seq,
    timestamp: snapshotEvent.timestamp,
    changedDomains,
    snapshot: clone(next),
  }

  record.projectionSnapshots.push(snapshotEntry)
  record.summary.projectionSnapshotCount = record.projectionSnapshots.length
  safeWrite(() => appendAgentObservabilityProjectionSnapshotLog(record.files, snapshotEntry))
  persistSummary(record)

  if (changedDomains.includes('error') && next.error) {
    appendAgentObservabilityEvent(sessionId, {
      source,
      kind: 'error.raised',
      summary: next.error.message,
      payload: {
        detail: next.error.detail,
        occurredAt: next.error.occurredAt,
      },
    })
  }

  if (changedDomains.includes('execution') && next.execution.pendingApprovals.length) {
    appendAgentObservabilityEvent(sessionId, {
      source,
      kind: 'approval.state',
      summary: `存在 ${next.execution.pendingApprovals.length} 项待确认事项`,
      payload: {
        approvals: clone(next.execution.pendingApprovals),
      },
    })
  }

  if (changedDomains.includes('workflow') && next.workflow.proposedPlan) {
    appendAgentObservabilityEvent(sessionId, {
      source,
      kind: 'artifact.generated',
      summary: '已生成工作流草案',
      payload: {
        artifactType: 'workflowPlan',
        workflowPlan: clone(next.workflow.proposedPlan),
      },
    })
  }

  if (changedDomains.includes('analysis')) {
    if (next.analysis.evidence?.length) {
      appendAgentObservabilityEvent(sessionId, {
        source,
        kind: 'artifact.generated',
        summary: `已生成 ${next.analysis.evidence.length} 条证据`,
        payload: {
          artifactType: 'evidence',
          evidence: clone(next.analysis.evidence),
        },
      })
    }

    if (next.analysis.report) {
      appendAgentObservabilityEvent(sessionId, {
        source,
        kind: 'artifact.generated',
        summary: `已生成报告：${next.analysis.report.title}`,
        payload: {
          artifactType: 'report',
          report: clone(next.analysis.report),
        },
      })
    }
  }

  return snapshotEntry
}

export const getAgentObservabilityDebugTrace = (
  sessionId: string,
  options: { limit?: number, offset?: number } = {},
): AgentObservabilityDebugTraceResponse | null => {
  const record = traces.get(sessionId)
  if (!record || !isAgentObservabilityEnabled()) return null

  const offset = Math.max(0, Math.floor(options.offset ?? 0))
  const limit = Math.min(500, Math.max(1, Math.floor(options.limit ?? 200)))

  return {
    enabled: true,
    sessionId,
    traceId: record.traceId,
    eventCount: record.events.length,
    projectionSnapshotCount: record.projectionSnapshots.length,
    latestStatus: record.summary.latestStatus,
    files: record.files,
    summary: record.summary,
    events: record.events.slice(offset, offset + limit),
    projectionSnapshots: record.projectionSnapshots,
    rawMessages: record.rawMessages,
    parseFailures: record.parseFailures,
  }
}

export const getAgentObservabilityDebugReplay = (
  sessionId: string,
  seq?: number,
): AgentObservabilityDebugReplayResponse | null => {
  const record = traces.get(sessionId)
  if (!record || !isAgentObservabilityEnabled()) return null
  return buildAgentObservabilityReplay(sessionId, record.traceId, record.events, seq)
}

export const getAgentObservabilityDebugFiles = (sessionId: string) => {
  const record = traces.get(sessionId)
  if (!record || !isAgentObservabilityEnabled()) return null
  return record.files
}

export const getAgentObservabilityDebugHealth = (): AgentObservabilityDebugHealth => ({
  enabled: isAgentObservabilityEnabled(),
  logRootDir: getAgentObservabilityRootDir(),
  activeTraceCount: traces.size,
  lastWriteAt,
  writeFailures,
})
