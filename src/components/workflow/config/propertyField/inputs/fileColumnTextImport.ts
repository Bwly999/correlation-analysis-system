import Papa from 'papaparse'
import * as XLSX from 'xlsx'

export interface ParsedTabularTextFile {
  columns: string[]
  rows: Array<Record<string, string>>
}

export interface TextColumnExtractionStats {
  rawRowCount: number
  emptyCount: number
  duplicateCount: number
  finalCount: number
}

export interface TextColumnExtractionResult {
  values: string[]
  stats: TextColumnExtractionStats
}

export interface TextColumnExtractionOptions {
  deduplicate: boolean
}

const EXCEL_EXTENSIONS = new Set(['xls', 'xlsx'])

const getFileExtension = (fileName: string) => fileName.split('.').pop()?.toLowerCase() || ''

const stringifyCell = (value: unknown) => {
  if (value === null || value === undefined) return ''
  return String(value)
}

const normalizeRows = (rows: Array<Record<string, unknown>>) =>
  rows.map((row) =>
    Object.fromEntries(
      Object.entries(row).map(([key, value]) => [key, stringifyCell(value)]),
    ),
  )

const extractColumns = (rows: Array<Record<string, string>>) => {
  const columns: string[] = []
  const seen = new Set<string>()

  rows.forEach((row) => {
    Object.keys(row).forEach((key) => {
      if (seen.has(key)) return
      seen.add(key)
      columns.push(key)
    })
  })

  return columns
}

const parseCsvFile = async (file: File): Promise<ParsedTabularTextFile> => {
  const text = await file.text()
  const parsed = Papa.parse<Record<string, unknown>>(text, {
    header: true,
    dynamicTyping: false,
    skipEmptyLines: true,
  })

  if (parsed.errors.length > 0) {
    throw new Error(parsed.errors[0]?.message || 'CSV 解析失败')
  }

  const rows = normalizeRows(parsed.data)
  const columns = (parsed.meta.fields || extractColumns(rows)).filter(Boolean)
  return { columns, rows }
}

const parseExcelFile = async (file: File): Promise<ParsedTabularTextFile> => {
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

  const rows = normalizeRows(
    XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
      defval: '',
      raw: false,
      blankrows: false,
    }),
  )
  return { columns: extractColumns(rows), rows }
}

export const parseTabularTextFile = async (file: File): Promise<ParsedTabularTextFile> => {
  if (!file) throw new Error('未选择任何文件')

  const extension = getFileExtension(file.name)
  if (extension === 'csv') return parseCsvFile(file)
  if (EXCEL_EXTENSIONS.has(extension)) return parseExcelFile(file)

  throw new Error('仅支持 CSV / Excel 文件')
}

export const extractTextColumnValues = (
  rows: Array<Record<string, string>>,
  column: string,
  options: TextColumnExtractionOptions,
): TextColumnExtractionResult => {
  if (!rows.some((row) => Object.prototype.hasOwnProperty.call(row, column))) {
    throw new Error(`未找到列：${column}`)
  }

  const values: string[] = []
  const seen = new Set<string>()
  let emptyCount = 0
  let duplicateCount = 0

  rows.forEach((row) => {
    const value = stringifyCell(row[column]).trim()
    if (!value) {
      emptyCount += 1
      return
    }

    if (seen.has(value)) {
      duplicateCount += 1
      if (options.deduplicate) return
    }

    seen.add(value)
    values.push(value)
  })

  return {
    values,
    stats: {
      rawRowCount: rows.length,
      emptyCount,
      duplicateCount,
      finalCount: values.length,
    },
  }
}
