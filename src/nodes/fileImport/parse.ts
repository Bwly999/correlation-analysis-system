import Papa from 'papaparse'
import * as XLSX from 'xlsx'

import { createTableResult, type FieldSchema, type FieldType, type NodeResult } from '../result'
import type { FileImportParseOptions, FileImportProgress, FileImportResolvedFormat } from './types'

type ProgressReporter = (progress: FileImportProgress) => void
type CancellationGuard = () => void

type FieldStats = {
  sawNumber: boolean
  sawBoolean: boolean
  sawDateString: boolean
  sawPlainString: boolean
  sawJson: boolean
  sawOther: boolean
  nullable: boolean
}

const NULL_STRINGS = new Set(['n/a', 'null', 'nan', '-', '', 'undefined', 'none'])

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

const isDateLike = (value: string) =>
  value.trim() !== '' && Number.isFinite(Date.parse(value))

const isNumericString = (value: string) => /^-?\d+(\.\d+)?$/.test(value)

const createFieldStats = (): FieldStats => ({
  sawNumber: false,
  sawBoolean: false,
  sawDateString: false,
  sawPlainString: false,
  sawJson: false,
  sawOther: false,
  nullable: false,
})

const resolveFieldType = (stats: FieldStats): FieldType => {
  const flags = [
    stats.sawNumber,
    stats.sawBoolean,
    stats.sawJson,
    stats.sawOther,
    stats.sawPlainString,
  ].filter(Boolean).length

  if (flags > 1) return 'unknown'
  if (stats.sawOther) return 'unknown'
  if (stats.sawNumber) return 'number'
  if (stats.sawBoolean) return 'boolean'
  if (stats.sawJson) return 'json'
  if (stats.sawPlainString) return 'string'
  if (stats.sawDateString) return 'date'
  return 'unknown'
}

const normalizeExcludeFields = (excludeFields?: string[] | string) => {
  if (Array.isArray(excludeFields)) return excludeFields
  if (typeof excludeFields !== 'string') return []
  return excludeFields
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

export const resolveFileImportFormat = (
  fileName: string,
  requestedFormat?: string,
): FileImportResolvedFormat => {
  const format = requestedFormat || 'auto'
  if (format === 'csv' || format === 'xlsx' || format === 'json') return format

  const extension = fileName.split('.').pop()?.toLowerCase()
  if (extension === 'csv') return 'csv'
  if (extension === 'xlsx' || extension === 'xls') return 'xlsx'
  if (extension === 'json') return 'json'
  throw new Error(`无法识别的文件格式: ${extension}`)
}

const updateFieldStats = (statsMap: Map<string, FieldStats>, row: Record<string, unknown>) => {
  Object.entries(row).forEach(([key, value]) => {
    const stats = statsMap.get(key) ?? createFieldStats()

    if (value === null || value === undefined) {
      stats.nullable = true
      statsMap.set(key, stats)
      return
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
      stats.sawNumber = true
      statsMap.set(key, stats)
      return
    }

    if (typeof value === 'boolean') {
      stats.sawBoolean = true
      statsMap.set(key, stats)
      return
    }

    if (typeof value === 'string') {
      if (isDateLike(value)) {
        stats.sawDateString = true
      } else {
        stats.sawPlainString = true
      }
      statsMap.set(key, stats)
      return
    }

    if (Array.isArray(value) || isPlainObject(value)) {
      stats.sawJson = true
      statsMap.set(key, stats)
      return
    }

    stats.sawOther = true
    statsMap.set(key, stats)
  })
}

const normalizeCellValue = (
  key: string,
  value: unknown,
  excludeFields: Set<string>,
  autoClean: boolean,
) => {
  if (!autoClean || excludeFields.has(key) || typeof value !== 'string') {
    return value
  }

  const trimmed = value.trim()
  if (NULL_STRINGS.has(trimmed.toLowerCase())) return null
  if (isNumericString(trimmed)) {
    const numericValue = Number(trimmed)
    if (!Number.isNaN(numericValue)) return numericValue
  }
  return value
}

const buildTableResult = (
  rows: Array<Record<string, unknown>>,
  fileName: string,
  sourceType: FileImportResolvedFormat,
) => {
  const fieldStats = new Map<string, FieldStats>()
  rows.forEach((row) => updateFieldStats(fieldStats, row))

  const fields: FieldSchema[] = [...fieldStats.entries()].map(([name, stats]) => ({
    name,
    type: resolveFieldType(stats),
    nullable: stats.nullable,
  }))

  return createTableResult(rows, {
    schema: { fields },
    meta: {
      filename: fileName,
      sourceType: sourceType === 'xlsx' ? 'excel' : sourceType,
      rowCount: rows.length,
    },
    preview: {
      summary: `共 ${rows.length} 行，${fields.length} 个字段`,
      viewer: 'table-chart-combo-viewer',
    },
  })
}

const cleanRows = (
  rows: unknown[],
  options: FileImportParseOptions,
  reportProgress: ProgressReporter,
  throwIfCancelled: CancellationGuard,
) => {
  reportProgress({ phase: 'cleaning', progress: 70 })
  const excludeFields = new Set(normalizeExcludeFields(options.excludeFields))
  const autoClean = options.autoClean !== false

  const normalizedRows = rows.reduce<Array<Record<string, unknown>>>((acc, row) => {
    throwIfCancelled()
    if (!isPlainObject(row)) return acc

    const nextRow = Object.fromEntries(
      Object.entries(row).map(([key, value]) => [
        key,
        normalizeCellValue(key, value, excludeFields, autoClean),
      ]),
    )
    acc.push(nextRow)
    return acc
  }, [])

  return normalizedRows
}

const parseCsvRows = async (file: File) => {
  const text = await file.text()
  const parsed = Papa.parse<Record<string, unknown>>(text, {
    header: true,
    dynamicTyping: false,
    skipEmptyLines: true,
  })

  if (parsed.errors.length > 0) {
    throw new Error(parsed.errors[0]?.message || 'CSV 解析失败')
  }

  return parsed.data
}

const parseJsonRows = async (file: File) => {
  const text = await file.text()
  const parsed = JSON.parse(text)
  return Array.isArray(parsed) ? parsed : [parsed]
}

const parseXlsxRows = async (file: File) => {
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(new Uint8Array(buffer), { type: 'array' })
  const firstSheetName = workbook.SheetNames[0]
  if (!firstSheetName) {
    throw new Error('Excel 文件中未找到可读取的工作表')
  }

  const worksheet = workbook.Sheets[firstSheetName]
  if (!worksheet) {
    throw new Error(`Excel 工作表 ${firstSheetName} 读取失败`)
  }

  return XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet)
}

export const parseFileImportResult = async (
  file: File,
  options: FileImportParseOptions = {},
  reportProgress: ProgressReporter = () => undefined,
  throwIfCancelled: CancellationGuard = () => undefined,
): Promise<NodeResult<Array<Record<string, unknown>>>> => {
  if (!file) throw new Error('未选择任何文件')
  if (!file.name || typeof file.name !== 'string') {
    throw new Error('选择的文件已失效（可能是刷新页面导致），请重新选择文件')
  }

  const format = resolveFileImportFormat(file.name, options.format)

  reportProgress({ phase: 'reading', progress: 10 })
  throwIfCancelled()
  reportProgress({ phase: 'parsing', progress: 35 })

  let rawRows: unknown[]
  if (format === 'csv') {
    rawRows = await parseCsvRows(file)
  } else if (format === 'xlsx') {
    rawRows = await parseXlsxRows(file)
  } else {
    rawRows = await parseJsonRows(file)
  }

  throwIfCancelled()
  const rows = cleanRows(rawRows, options, reportProgress, throwIfCancelled)
  throwIfCancelled()

  reportProgress({ phase: 'finalizing', progress: 95 })
  const result = buildTableResult(rows, file.name, format)
  reportProgress({ phase: 'finalizing', progress: 100 })
  return result
}
