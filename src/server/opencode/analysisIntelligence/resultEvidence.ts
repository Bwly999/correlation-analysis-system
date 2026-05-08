import type { AgentExecutionRecord, AgentExecutionResult } from '../../../ai/types.js'

export type AgenticResultEvidence = {
  evidenceId: string
  executionId: string
  nodeId: string
  nodeLabel: string
  nodeType: string
  statement: string
  resultKind: string
  metrics: Record<string, unknown>
  previewRows?: Array<Record<string, unknown>>
}

const MAX_PREVIEW_ROWS = 5
const MAX_TABLE_COLUMNS = 20

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const cloneValue = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

const normalizeResultPayload = (result: unknown) => {
  if (!isPlainObject(result)) return null
  const kind = typeof result.kind === 'string' ? result.kind : ''
  if (!kind) return null
  return {
    kind,
    payload: result.payload,
  }
}

const compactReportMetrics = (payload: Record<string, unknown>) => {
  const metrics: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(payload)) {
    if (value === undefined || value === null) continue
    if (key === 'rawRows' || key === 'rows' || key === 'data') continue

    if (Array.isArray(value)) {
      metrics[key] = cloneValue(value.slice(0, MAX_PREVIEW_ROWS))
      continue
    }

    if (isPlainObject(value)) {
      metrics[key] = cloneValue(value)
      continue
    }

    if (['string', 'number', 'boolean'].includes(typeof value)) {
      metrics[key] = value
    }
  }

  return metrics
}

const buildTableEvidenceMetrics = (rows: Array<Record<string, unknown>>) => {
  const columns = rows[0] ? Object.keys(rows[0]).slice(0, MAX_TABLE_COLUMNS) : []
  return {
    rowCount: rows.length,
    columnCount: rows[0] ? Object.keys(rows[0]).length : 0,
    columns,
  }
}

const buildStatement = (
  nodeResult: AgentExecutionResult,
  payload: unknown,
) => {
  if (nodeResult.resultSummary) return nodeResult.resultSummary
  if (isPlainObject(payload) && typeof payload.summary === 'string') return payload.summary
  if (isPlainObject(payload) && typeof payload.title === 'string') return payload.title
  return `${nodeResult.nodeLabel} 已生成可引用执行证据`
}

const extractNodeEvidence = (
  execution: AgentExecutionRecord,
  nodeResult: AgentExecutionResult,
): AgenticResultEvidence | null => {
  if (!nodeResult.success || !nodeResult.result) return null

  const normalized = normalizeResultPayload(nodeResult.result)
  if (!normalized) return null

  const base = {
    evidenceId: `${execution.executionId}:${nodeResult.nodeId}`,
    executionId: execution.executionId,
    nodeId: nodeResult.nodeId,
    nodeLabel: nodeResult.nodeLabel,
    nodeType: nodeResult.nodeType,
    statement: buildStatement(nodeResult, normalized.payload),
    resultKind: nodeResult.resultKind ?? normalized.kind,
  }

  if (normalized.kind === 'report' && isPlainObject(normalized.payload)) {
    return {
      ...base,
      metrics: compactReportMetrics(normalized.payload),
    }
  }

  if (normalized.kind === 'table' && Array.isArray(normalized.payload)) {
    const rows = normalized.payload.filter(isPlainObject)
    return {
      ...base,
      metrics: buildTableEvidenceMetrics(rows),
      previewRows: cloneValue(rows.slice(0, MAX_PREVIEW_ROWS)),
    }
  }

  return null
}

export const extractResultEvidence = (execution: AgentExecutionRecord): AgenticResultEvidence[] =>
  execution.nodeResults
    .map((nodeResult) => extractNodeEvidence(execution, nodeResult))
    .filter((item): item is AgenticResultEvidence => item !== null)
