import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type {
  AgentObservabilityEvent,
  AgentObservabilityLogFiles,
  AgentObservabilityProjectionSnapshotEntry,
  AgentObservabilitySummary,
  AgentObservabilityTraceManifest,
  AgentSessionDebugParseFailure,
  AgentSessionDebugRawMessage,
} from '../../../ai/types.js'
import { getAgentObservabilityRootDir } from './env.js'

const ensureDirectory = (directory: string) => {
  mkdirSync(directory, { recursive: true })
}

const appendJsonLine = (filePath: string, payload: unknown) => {
  appendFileSync(filePath, `${JSON.stringify(payload)}\n`, 'utf8')
}

const writePrettyJson = (filePath: string, payload: unknown) => {
  writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8')
}

export const createAgentObservabilityLogFiles = (sessionId: string): AgentObservabilityLogFiles => {
  const dateKey = new Date().toISOString().slice(0, 10)
  const rootDir = join(getAgentObservabilityRootDir(), dateKey, sessionId)
  ensureDirectory(rootDir)

  return {
    rootDir,
    manifestFile: join(rootDir, 'manifest.json'),
    eventsFile: join(rootDir, 'events.ndjson'),
    projectionSnapshotsFile: join(rootDir, 'projection-snapshots.ndjson'),
    rawMessagesFile: join(rootDir, 'raw-messages.ndjson'),
    sessionFile: join(rootDir, 'session.json'),
    summaryFile: join(rootDir, 'summary.json'),
    failureFile: null,
  }
}

export const writeAgentObservabilityManifest = (
  files: AgentObservabilityLogFiles,
  manifest: AgentObservabilityTraceManifest,
) => {
  writePrettyJson(files.manifestFile, manifest)
}

export const writeAgentObservabilitySessionFile = (
  files: AgentObservabilityLogFiles,
  payload: unknown,
) => {
  writePrettyJson(files.sessionFile, payload)
}

export const writeAgentObservabilitySummary = (
  files: AgentObservabilityLogFiles,
  summary: AgentObservabilitySummary,
) => {
  writePrettyJson(files.summaryFile, summary)
}

export const appendAgentObservabilityEventLog = (
  files: AgentObservabilityLogFiles,
  event: AgentObservabilityEvent,
) => {
  appendJsonLine(files.eventsFile, event)
}

export const appendAgentObservabilityProjectionSnapshotLog = (
  files: AgentObservabilityLogFiles,
  snapshot: AgentObservabilityProjectionSnapshotEntry,
) => {
  appendJsonLine(files.projectionSnapshotsFile, snapshot)
}

export const appendAgentObservabilityRawMessageLog = (
  files: AgentObservabilityLogFiles,
  rawMessage: AgentSessionDebugRawMessage,
) => {
  appendJsonLine(files.rawMessagesFile, rawMessage)
}

export const appendAgentObservabilityParseFailureLog = (
  files: AgentObservabilityLogFiles,
  parseFailure: AgentSessionDebugParseFailure,
) => {
  appendJsonLine(files.rawMessagesFile, {
    type: 'parse_failure',
    ...parseFailure,
  })
}

export const writeAgentObservabilityFailureFile = (
  files: AgentObservabilityLogFiles,
  payload: unknown,
) => {
  const failureFile = join(files.rootDir, 'failure.json')
  writePrettyJson(failureFile, payload)
  files.failureFile = failureFile
}
