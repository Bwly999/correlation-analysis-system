export type AgenticFieldType = 'numeric' | 'datetime' | 'categorical' | 'text' | 'unknown'

export type AgenticDataProfileField = {
  name: string
  type: AgenticFieldType
  missingRate: number
  uniqueCount: number
  sampleValues: unknown[]
}

export type AgenticDataProfile = {
  rowCount: number
  scannedRowCount: number
  fields: AgenticDataProfileField[]
  candidateTargetColumns: string[]
  candidateFeatureColumns: string[]
}

const MAX_SCAN_ROWS = 5000
const TARGET_NAME_HINTS = ['target', 'label', 'y', 'sales', '销量', '结果', '目标']

const isMissing = (value: unknown) => value === null || value === undefined || value === ''

const isNumericLike = (value: unknown) => {
  if (typeof value === 'number') return Number.isFinite(value)
  if (typeof value !== 'string') return false
  if (!value.trim()) return false
  return Number.isFinite(Number(value))
}

const isDatetimeLike = (value: unknown) => {
  if (value instanceof Date) return !Number.isNaN(value.getTime())
  if (typeof value !== 'string') return false
  const normalized = value.trim()
  if (!/^\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(normalized)) return false
  return !Number.isNaN(Date.parse(normalized))
}

const inferFieldType = (values: unknown[], uniqueCount: number, scannedRowCount: number): AgenticFieldType => {
  const presentValues = values.filter((value) => !isMissing(value))
  if (!presentValues.length) return 'unknown'

  if (presentValues.every(isNumericLike)) return 'numeric'
  if (presentValues.every(isDatetimeLike)) return 'datetime'

  const uniqueRatio = scannedRowCount > 0 ? uniqueCount / scannedRowCount : 0
  if (uniqueCount <= 20 || uniqueRatio <= 0.5) return 'categorical'
  return 'text'
}

const sortCandidateTargets = (fields: AgenticDataProfileField[]) =>
  fields
    .filter((field) => field.type === 'numeric')
    .sort((left, right) => {
      const leftHint = TARGET_NAME_HINTS.some((hint) => left.name.toLowerCase().includes(hint.toLowerCase())) ? 0 : 1
      const rightHint = TARGET_NAME_HINTS.some((hint) => right.name.toLowerCase().includes(hint.toLowerCase())) ? 0 : 1
      return leftHint - rightHint
    })
    .map((field) => field.name)

export const buildDataProfile = (rows: Array<Record<string, unknown>>): AgenticDataProfile => {
  const scannedRows = rows.slice(0, MAX_SCAN_ROWS)
  const fieldNames = [...new Set(scannedRows.flatMap((row) => Object.keys(row)))]

  const fields = fieldNames.map((name) => {
    const values = scannedRows.map((row) => row[name])
    const presentValues = values.filter((value) => !isMissing(value))
    const uniqueValues = [...new Set(presentValues.map((value) => String(value)))]
    const uniqueCount = uniqueValues.length

    return {
      name,
      type: inferFieldType(values, uniqueCount, scannedRows.length),
      missingRate: scannedRows.length > 0 ? (values.length - presentValues.length) / scannedRows.length : 0,
      uniqueCount,
      sampleValues: presentValues.slice(0, 5),
    }
  })

  const candidateTargetColumns = sortCandidateTargets(fields)
  const targetSet = new Set(candidateTargetColumns.slice(0, 1))
  const candidateFeatureColumns = fields
    .filter((field) => !targetSet.has(field.name) && ['numeric', 'categorical', 'datetime'].includes(field.type))
    .map((field) => field.name)

  return {
    rowCount: rows.length,
    scannedRowCount: scannedRows.length,
    fields,
    candidateTargetColumns,
    candidateFeatureColumns,
  }
}
