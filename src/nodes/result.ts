export type DataKind =
  | 'table'
  | 'tableCollection'
  | 'report'
  | 'chart'
  | 'file'
  | 'json'
  | 'scalar'
  | 'matrix'
  | 'timeseries'
  | 'custom'

export type FieldType = 'number' | 'string' | 'boolean' | 'date' | 'json' | 'unknown'

export interface FieldSchema {
  name: string
  type: FieldType
  nullable?: boolean
  label?: string
}

export interface NodeSchema {
  fields?: FieldSchema[]
}

export interface NodePreviewSpec {
  viewer: string
  title?: string
  summary?: string
  props?: Record<string, unknown>
}

export interface NodeResult<T = unknown> {
  kind: DataKind
  payload: T
  schema?: NodeSchema
  meta?: Record<string, unknown>
  preview?: NodePreviewSpec
  lineage?: Record<string, unknown>
}

export const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

const isCollectionGroup = (
  value: unknown,
): value is { name: string; data: Array<Record<string, unknown>> } =>
  isPlainObject(value) && typeof value.name === 'string' && Array.isArray(value.data)

const isDateLike = (value: unknown) =>
  typeof value === 'string' && value.trim() !== '' && Number.isFinite(Date.parse(value))

const inferFieldType = (values: unknown[]): FieldType => {
  const present = values.filter((value) => value !== null && value !== undefined)
  if (present.length === 0) return 'unknown'

  if (present.every((value) => typeof value === 'number' && Number.isFinite(value))) return 'number'
  if (present.every((value) => typeof value === 'boolean')) return 'boolean'
  if (present.every((value) => isDateLike(value))) return 'date'
  if (present.every((value) => typeof value === 'string')) return 'string'
  if (present.every((value) => isPlainObject(value) || Array.isArray(value))) return 'json'
  return 'unknown'
}

export const inferSchemaFromRows = (rows: Array<Record<string, unknown>>): NodeSchema => {
  if (!Array.isArray(rows) || rows.length === 0) return { fields: [] }

  const fieldNames = new Set<string>()
  rows.forEach((row) => {
    Object.keys(row).forEach((key) => fieldNames.add(key))
  })

  return {
    fields: [...fieldNames].map((name) => {
      const values = rows.map((row) => row[name])
      return {
        name,
        type: inferFieldType(values),
        nullable: values.some((value) => value === null || value === undefined),
      }
    }),
  }
}

const defaultViewerByKind: Partial<Record<DataKind, string>> = {
  table: 'table-preview',
  tableCollection: 'table-collection-preview',
  report: 'report-viewer',
  chart: 'chart-viewer',
  file: 'file-viewer',
  json: 'json-viewer',
  scalar: 'json-viewer',
}

export const isNodeResult = (value: unknown): value is NodeResult =>
  isPlainObject(value) && typeof value.kind === 'string' && 'payload' in value

export const normalizeNodeResult = <T>(result: NodeResult<T>): NodeResult<T> => {
  const nextResult: NodeResult<T> = {
    ...result,
    meta: { ...(result.meta ?? {}) },
    preview: result.preview
      ? { ...result.preview, props: { ...(result.preview.props ?? {}) } }
      : undefined,
  }

  if (nextResult.kind === 'table' && Array.isArray(nextResult.payload)) {
    const rows = nextResult.payload.filter(
      (row): row is Record<string, unknown> => isPlainObject(row),
    )
    if (!nextResult.schema?.fields?.length) {
      nextResult.schema = inferSchemaFromRows(rows)
    }
    if (nextResult.meta?.rowCount === undefined) {
      nextResult.meta = {
        ...nextResult.meta,
        rowCount: rows.length,
      }
    }
  }

  if (!nextResult.preview?.viewer) {
    const viewer = defaultViewerByKind[nextResult.kind]
    if (viewer) {
      nextResult.preview = {
        ...(nextResult.preview ?? {}),
        viewer,
      }
    }
  }

  return nextResult
}

export const createTableResult = (
  rows: Array<Record<string, unknown>>,
  options: Omit<NodeResult<Array<Record<string, unknown>>>, 'kind' | 'payload'> = {},
): NodeResult<Array<Record<string, unknown>>> =>
  normalizeNodeResult({
    kind: 'table',
    payload: rows,
    ...options,
  })

export const createTableCollectionResult = (
  groups: Array<{ name: string; data: Array<Record<string, unknown>> }>,
  options: Omit<
    NodeResult<Array<{ name: string; data: Array<Record<string, unknown>> }>>,
    'kind' | 'payload'
  > = {},
): NodeResult<Array<{ name: string; data: Array<Record<string, unknown>> }>> =>
  normalizeNodeResult({
    kind: 'tableCollection',
    payload: groups,
    ...options,
  })

export const createReportResult = (
  report: Record<string, unknown>,
  options: Omit<NodeResult<Record<string, unknown>>, 'kind' | 'payload'> = {},
): NodeResult<Record<string, unknown>> =>
  normalizeNodeResult({
    kind: 'report',
    payload: report,
    ...options,
  })

export const createChartResult = (
  chartOption: Record<string, unknown>,
  options: Omit<NodeResult<Record<string, unknown>>, 'kind' | 'payload'> = {},
): NodeResult<Record<string, unknown>> =>
  normalizeNodeResult({
    kind: 'chart',
    payload: chartOption,
    ...options,
  })

export const createFileResult = (
  fileInfo: Record<string, unknown>,
  options: Omit<NodeResult<Record<string, unknown>>, 'kind' | 'payload'> = {},
): NodeResult<Record<string, unknown>> =>
  normalizeNodeResult({
    kind: 'file',
    payload: fileInfo,
    ...options,
  })

export const createJsonResult = (
  payload: unknown,
  options: Omit<NodeResult<unknown>, 'kind' | 'payload'> = {},
): NodeResult<unknown> =>
  normalizeNodeResult({
    kind: 'json',
    payload,
    ...options,
  })

export const extractTableRows = (input: unknown): Array<Record<string, unknown>> | null => {
  if (isNodeResult(input) && input.kind === 'table' && Array.isArray(input.payload)) {
    return input.payload.filter((row): row is Record<string, unknown> => isPlainObject(row))
  }

  if (
    Array.isArray(input) &&
    input.every((row) => isPlainObject(row)) &&
    !input.every((row) => isCollectionGroup(row))
  ) {
    return input.filter((row): row is Record<string, unknown> => isPlainObject(row))
  }

  return null
}

export const extractTableCollectionGroups = (
  input: unknown,
): Array<{ name: string; data: Array<Record<string, unknown>> }> | null => {
  if (isNodeResult(input) && input.kind === 'tableCollection' && Array.isArray(input.payload)) {
    return input.payload
      .filter((group) => isCollectionGroup(group))
      .map((group) => ({
        name: group.name as string,
        data: Array.isArray(group.data)
          ? group.data.filter(
              (row: unknown): row is Record<string, unknown> => isPlainObject(row),
            )
          : [],
      }))
  }

  if (Array.isArray(input) && input.every((group) => isCollectionGroup(group))) {
    return input.map((group) => ({
      name: group.name,
      data: group.data.filter(
        (row: unknown): row is Record<string, unknown> => isPlainObject(row),
      ),
    }))
  }

  return null
}
