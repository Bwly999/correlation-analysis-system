import * as XLSX from 'xlsx'
import { resolveExportFilename } from './exportNaming'

export type TableExportFormat = 'csv' | 'xlsx' | 'json'
export type TableExportRow = Record<string, unknown>

export interface BuildTableExportOptions {
  rows: TableExportRow[]
  format: TableExportFormat
  filename?: string
  fallbackBaseName?: string
}

export interface BuiltTableExportFile {
  filename: string
  blob: Blob
}

const buildCsvContent = (rows: TableExportRow[]) => {
  const headers = Object.keys(rows[0] ?? {})
  return [
    headers.join(','),
    ...rows.map((row) => headers.map((key) => JSON.stringify(row[key] ?? '')).join(',')),
  ].join('\n')
}

export const buildTableExportFile = ({
  rows,
  format,
  filename,
  fallbackBaseName = 'export_data',
}: BuildTableExportOptions): BuiltTableExportFile => {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error('无可导出的表格数据')
  }

  const resolvedFilename = resolveExportFilename(filename, fallbackBaseName, format)
  let blob: Blob

  if (format === 'json') {
    blob = new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' })
  } else if (format === 'xlsx') {
    const worksheet = XLSX.utils.json_to_sheet(rows)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, '数据导出')
    const workbookBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' })
    blob = new Blob([workbookBuffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
  } else {
    blob = new Blob([buildCsvContent(rows)], { type: 'text/csv' })
  }

  return {
    filename: resolvedFilename,
    blob,
  }
}

export const exportTableResult = (options: BuildTableExportOptions) => {
  const file = buildTableExportFile(options)
  const url = URL.createObjectURL(file.blob)

  try {
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = file.filename
    anchor.click()
  } finally {
    URL.revokeObjectURL(url)
  }

  return file
}
