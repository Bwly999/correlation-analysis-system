import type { WorkflowAiDataSourceDescriptor, WorkflowAiPlanRequest } from '../../ai/types.js'

const MAX_SUSPICIOUS_ARRAY_LENGTH = 50
const MAX_SUSPICIOUS_NESTED_SCAN = 5
const RAW_ROWS_ERROR = 'Pi Agent 会话不允许包含完整行数据，请仅传递摘要上下文'

type UnknownRecord = Record<string, unknown>

const isPlainObject = (value: unknown): value is UnknownRecord =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

const hasSuspiciousLargeArray = (value: unknown, depth = 0): boolean => {
  if (depth > MAX_SUSPICIOUS_NESTED_SCAN || value === null || value === undefined) return false

  if (Array.isArray(value)) {
    if (value.length > MAX_SUSPICIOUS_ARRAY_LENGTH) return true
    return value.some((item) => hasSuspiciousLargeArray(item, depth + 1))
  }

  if (!isPlainObject(value)) return false

  return Object.values(value).some((nestedValue) => hasSuspiciousLargeArray(nestedValue, depth + 1))
}

const assertSafeDataSource = (dataSource: WorkflowAiDataSourceDescriptor) => {
  const bindingPayload = dataSource.bindingPayload
  if (!isPlainObject(bindingPayload)) return

  if (Array.isArray(bindingPayload.rows)) {
    throw new Error(RAW_ROWS_ERROR)
  }

  if (hasSuspiciousLargeArray(bindingPayload)) {
    throw new Error(RAW_ROWS_ERROR)
  }
}

const sanitizeSchemaSummary = (schemaSummary: WorkflowAiDataSourceDescriptor['schemaSummary']) => ({
  ...schemaSummary,
  numericColumns: Array.isArray(schemaSummary.numericColumns) ? [...schemaSummary.numericColumns] : [],
  categoricalColumns: Array.isArray(schemaSummary.categoricalColumns) ? [...schemaSummary.categoricalColumns] : undefined,
  datetimeColumns: Array.isArray(schemaSummary.datetimeColumns) ? [...schemaSummary.datetimeColumns] : undefined,
  candidateTargetColumns: Array.isArray(schemaSummary.candidateTargetColumns)
    ? [...schemaSummary.candidateTargetColumns]
    : [],
  candidateFeatureColumns: Array.isArray(schemaSummary.candidateFeatureColumns)
    ? [...schemaSummary.candidateFeatureColumns]
    : [],
  blockedReasons: Array.isArray(schemaSummary.blockedReasons) ? [...schemaSummary.blockedReasons] : [],
})

export const sanitizePiAgentDataSources = (
  dataSources: WorkflowAiPlanRequest['dataSources'],
) => (dataSources ?? []).map((dataSource) => ({
  id: dataSource.id,
  kind: dataSource.kind,
  entryNodeType: dataSource.entryNodeType,
  label: dataSource.label,
  ...(dataSource.sourceMeta ? { sourceMeta: dataSource.sourceMeta } : {}),
  schemaSummary: sanitizeSchemaSummary(dataSource.schemaSummary),
}))

export function assertPiAgentSafeRequest(request: WorkflowAiPlanRequest): void {
  for (const dataSource of request.dataSources ?? []) {
    assertSafeDataSource(dataSource)
  }
}

export { RAW_ROWS_ERROR as PI_AGENT_RAW_ROWS_ERROR_MESSAGE }
