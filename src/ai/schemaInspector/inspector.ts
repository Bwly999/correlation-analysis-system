import {
  extractTableRows,
  inferSchemaFromRows,
  isNodeResult,
  isPlainObject,
  type FieldType,
} from '../../nodes/result.js'
import type {
  AiColumnSummary,
  AiSchemaDetectedType,
  AiSchemaSummary,
  InspectAiSchemaSummaryInput,
} from './types.js'

const DEFAULT_MAX_SAMPLES = 5

const TARGET_NAME_PATTERN = /(target|label|score|yield|rate|result|output|y$|y_|良率|目标|结果|得分)/i
const ID_NAME_PATTERN = /(^(id|sn)$|id$|sn|code|编号|批次|序列)/i
const TIME_NAME_PATTERN = /(time|date|created|updated|timestamp|时间|日期)/i

const truncateString = (value: string, limit = 32) =>
  value.length > limit ? `${value.slice(0, limit)}...` : value

const maskIdentifier = (value: string) => {
  if (value.length <= 8) return value
  return `${value.slice(0, 3)}***${value.slice(-2)}`
}

const normalizeSampleValue = (value: unknown, maskAsId: boolean) => {
  if (typeof value === 'string') {
    const nextValue = maskAsId ? maskIdentifier(value) : truncateString(value)
    return nextValue
  }
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) {
    return value
  }
  if (value === undefined) return null
  return truncateString(JSON.stringify(value))
}

const resolveDetectedType = (
  fieldName: string,
  rows: Array<Record<string, unknown>>,
  schemaType?: FieldType,
): AiSchemaDetectedType => {
  if (schemaType && schemaType !== 'unknown') return schemaType
  if (TIME_NAME_PATTERN.test(fieldName)) return 'date'
  const inferred = inferSchemaFromRows(rows).fields?.find((field) => field.name === fieldName)?.type
  return inferred ?? 'unknown'
}

const collectUniqueCount = (values: unknown[]) => new Set(values.map((value) => JSON.stringify(value))).size

const isDateLikeName = (value: string) => TIME_NAME_PATTERN.test(value)
const isTargetLikeName = (value: string) => TARGET_NAME_PATTERN.test(value)
const isIdLikeName = (value: string) => ID_NAME_PATTERN.test(value)

const collectSampleValues = (
  values: unknown[],
  maxSamples: number,
  maskAsId: boolean,
) => {
  const seen = new Set<string>()
  const samples: unknown[] = []

  values.forEach((value) => {
    if (samples.length >= maxSamples) return
    if (value === undefined || value === null || value === '') return
    const normalized = normalizeSampleValue(value, maskAsId)
    const key = JSON.stringify(normalized)
    if (seen.has(key)) return
    seen.add(key)
    samples.push(normalized)
  })

  return samples
}

const buildColumnSummary = (
  fieldName: string,
  rows: Array<Record<string, unknown>>,
  maxSamples: number,
): AiColumnSummary => {
  const values = rows.map((row) => row[fieldName])
  const nonNullValues = values.filter((value) => value !== null && value !== undefined)
  const rowCount = rows.length
  const uniqueCount = collectUniqueCount(nonNullValues)
  const uniqueRate = rowCount > 0 ? uniqueCount / rowCount : 0
  const detectedType = resolveDetectedType(fieldName, rows)
  const nullable = values.some((value) => value === null || value === undefined)
  const nullRate = rowCount > 0 ? (values.length - nonNullValues.length) / rowCount : 0
  const isLikelyId = isIdLikeName(fieldName) || (uniqueRate > 0.95 && detectedType === 'string')
  const isLikelyTarget = detectedType === 'number' && isTargetLikeName(fieldName) && !isLikelyId
  const isLikelyCategory =
    detectedType === 'string' && !isLikelyId && uniqueCount > 0 && uniqueCount <= Math.min(20, Math.max(5, Math.floor(rowCount / 2)))
  const isLikelyFeature = detectedType === 'number' && !isLikelyId
  const isConstant = nonNullValues.length > 0 && uniqueCount <= 1

  const semanticTags = new Set<string>()
  if (isLikelyId) semanticTags.add('id')
  if (isLikelyTarget) semanticTags.add('target-candidate')
  if (isLikelyFeature) semanticTags.add('feature-candidate')
  if (isLikelyCategory) semanticTags.add('category')
  if (detectedType === 'date' || isDateLikeName(fieldName)) semanticTags.add('time')
  if (detectedType === 'number') semanticTags.add('measurement')
  if (nullRate >= 0.3) semanticTags.add('high-missing')
  if (uniqueRate >= 0.95) semanticTags.add('mostly-unique')
  if (isConstant) semanticTags.add('low-variance')

  return {
    name: fieldName,
    detectedType,
    semanticTags: [...semanticTags],
    nullable,
    nullRate,
    uniqueCount,
    uniqueRate,
    isConstant,
    isLikelyId,
    isLikelyCategory,
    isLikelyTarget,
    isLikelyFeature,
    sampleValues: collectSampleValues(nonNullValues, maxSamples, isLikelyId),
  }
}

const summarizeRows = (
  rows: Array<Record<string, unknown>>,
  input: InspectAiSchemaSummaryInput,
): AiSchemaSummary => {
  if (rows.length === 0) {
    return {
      source: input.source,
      resultKind: 'table',
      rowCount: 0,
      columnCount: 0,
      columns: [],
      summary: {
        numericColumns: [],
        categoricalColumns: [],
        datetimeColumns: [],
        candidateTargetColumns: [],
        candidateFeatureColumns: [],
        blockedReasons: ['当前数据为空，无法推断字段摘要'],
      },
    }
  }

  const fieldNames = new Set<string>()
  rows.forEach((row) => {
    Object.keys(row).forEach((key) => fieldNames.add(key))
  })

  const columns = [...fieldNames].map((fieldName) => buildColumnSummary(fieldName, rows, input.maxSamples ?? DEFAULT_MAX_SAMPLES))

  const numericColumns = columns.filter((column) => column.detectedType === 'number').map((column) => column.name)
  const categoricalColumns = columns
    .filter((column) => column.detectedType === 'string' && column.isLikelyCategory)
    .map((column) => column.name)
  const datetimeColumns = columns.filter((column) => column.detectedType === 'date').map((column) => column.name)
  const candidateTargetColumns = columns.filter((column) => column.isLikelyTarget).map((column) => column.name)
  const candidateFeatureColumns = columns
    .filter((column) => column.isLikelyFeature && !column.isLikelyTarget && !column.isConstant)
    .map((column) => column.name)

  const blockedReasons: string[] = []
  if (numericColumns.length === 0) {
    blockedReasons.push('当前数据缺少可用于分析的数值字段')
  }

  return {
    source: input.source,
    resultKind: 'table',
    rowCount: rows.length,
    columnCount: columns.length,
    columns,
    summary: {
      numericColumns,
      categoricalColumns,
      datetimeColumns,
      candidateTargetColumns,
      candidateFeatureColumns,
      blockedReasons,
    },
  }
}

const tryExtractRowsFromJsonResult = (value: unknown) => {
  if (!isNodeResult(value) || value.kind !== 'json') return null
  if (!Array.isArray(value.payload)) return null
  if (!value.payload.every((row) => isPlainObject(row))) return null
  return value.payload as Array<Record<string, unknown>>
}

export const inspectAiSchemaSummary = (input: InspectAiSchemaSummaryInput): AiSchemaSummary => {
  const tableRows = extractTableRows(input.value)
  if (tableRows) {
    return summarizeRows(tableRows, input)
  }

  const jsonRows = tryExtractRowsFromJsonResult(input.value)
  if (jsonRows) {
    return summarizeRows(jsonRows, input)
  }

  const resultKind = isNodeResult(input.value)
    ? input.value.kind === 'tableCollection'
      ? 'tableCollection'
      : input.value.kind === 'json'
        ? 'json'
        : 'unknown'
    : 'unknown'

  const blockedReasons =
    resultKind === 'json'
      ? ['当前 JSON 结构不是对象数组，暂不支持自动字段推断']
      : resultKind === 'tableCollection'
        ? ['当前结果是多组表格集合，首期摘要能力暂不直接展开']
        : ['当前结果类型暂不支持自动字段推断']

  return {
    source: input.source,
    resultKind,
    columns: [],
    summary: {
      numericColumns: [],
      categoricalColumns: [],
      datetimeColumns: [],
      candidateTargetColumns: [],
      candidateFeatureColumns: [],
      blockedReasons,
    },
  }
}
