/**
 * 主站侧：数据源 → CSV ArrayBuffer 转换。
 *
 * 由 NotebookFrame 在 iframe.ready 后调用，把所选数据通过 parent.import_csv 灌入笔记本。
 *
 * 详见 docs/design-doc/notebook-agent/数据接入.md §4。
 */

import Papa from 'papaparse'
import type { NodeResult } from '../../nodes/result'
import type { ImportCsvMeta, ImportCsvSourceKind } from '../../notebook/shared/parentBridge'

export interface ImportSourceContext {
  sourceKind: ImportCsvSourceKind
  sourceLabel: string
}

export const IMPORT_LIMITS = {
  maxRows: 1_000_000,
  maxColumns: 1_000,
  maxBytes: 200 * 1024 * 1024, // 200MB
} as const

export interface CsvImport {
  buffer: ArrayBuffer
  meta: ImportCsvMeta
}

const isCollectionGroup = (
  v: unknown,
): v is { name: string; data: Array<Record<string, unknown>> } => {
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof (v as { name?: unknown }).name === 'string' &&
    Array.isArray((v as { data?: unknown }).data)
  )
}

const extractRows = (result: NodeResult): Array<Record<string, unknown>> => {
  if (result.kind === 'table') {
    const rows = result.payload as unknown
    if (!Array.isArray(rows)) {
      throw new Error('数据源 payload 不是数组')
    }
    return rows as Array<Record<string, unknown>>
  }
  if (result.kind === 'tableCollection') {
    const groups = result.payload as unknown
    if (!Array.isArray(groups) || groups.length === 0) {
      throw new Error('数据源为空（tableCollection）')
    }
    const first = groups[0]
    if (!isCollectionGroup(first)) {
      throw new Error('tableCollection 首组结构非法')
    }
    return first.data
  }
  throw new Error(`不支持的 NodeResult kind: ${result.kind}`)
}

export const nodeResultToCsv = (
  result: NodeResult,
  ctx: ImportSourceContext,
): CsvImport => {
  const rows = extractRows(result)
  if (rows.length === 0) {
    throw new Error('数据源为空，无法导入笔记本')
  }
  if (rows.length > IMPORT_LIMITS.maxRows) {
    throw new Error(
      `数据行数 ${rows.length} 超过上限 ${IMPORT_LIMITS.maxRows}（row_too_many），请先采样`,
    )
  }
  const columnCount = Object.keys(rows[0] ?? {}).length
  if (columnCount > IMPORT_LIMITS.maxColumns) {
    throw new Error(
      `数据列数 ${columnCount} 超过上限 ${IMPORT_LIMITS.maxColumns}（col_too_many）`,
    )
  }

  const csv = Papa.unparse(rows, {
    header: true,
    skipEmptyLines: false,
  })
  const buffer = new TextEncoder().encode(csv).buffer as ArrayBuffer
  if (buffer.byteLength > IMPORT_LIMITS.maxBytes) {
    throw new Error(
      `CSV 字节 ${buffer.byteLength} 超过 postMessage 单次传输上限 ${IMPORT_LIMITS.maxBytes}（size_too_large）`,
    )
  }

  return {
    buffer,
    meta: {
      sourceKind: ctx.sourceKind,
      sourceLabel: ctx.sourceLabel,
      rowCount: rows.length,
      columnCount,
    },
  }
}
