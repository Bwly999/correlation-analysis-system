/**
 * 表格预览解析层（纯函数，便于单测）。
 *
 * - parseDelimited：用 papaparse 正确解析 CSV/TSV（处理引号、转义、自定义分隔符）。
 * - parseWorkbook：用 SheetJS 解析 Excel 二进制（首张 sheet）。
 *
 * 两路统一输出 { headers, rows } 的 TableModel，供虚拟网格渲染。
 */

import Papa from 'papaparse'
import * as XLSX from 'xlsx'

export interface TableModel {
  /** 列名（首行），缺失补 'Column N' */
  headers: string[]
  /** 数据行（每行为字符串数组，与 headers 对齐） */
  rows: string[][]
  /** 源类型，用于状态条显示 */
  source: 'csv' | 'tsv' | 'xlsx'
}

/** 把任意单元格值归一化为字符串（null/undefined → 空串）。 */
const cellToString = (value: unknown): string => {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  // 数字保留原始字面量，避免精度/科学计数法损失
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : ''
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE'
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? '' : value.toISOString()
  }
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

/** 把行对齐到列数（缺列补空串）。 */
const alignRow = (row: unknown[], colCount: number): string[] => {
  const cells = row.map(cellToString)
  while (cells.length < colCount) cells.push('')
  return cells
}

/**
 * 把二维矩阵归一化为 { headers, rows }：
 *   - 列数取所有行的最大宽度（避免数据丢失）。
 *   - 首行作表头，空表头补 'Column N'；首行不足时自动补名。
 *   - 所有数据行对齐到该列数。
 */
const normalizeMatrix = (matrix: unknown[][], source: TableModel['source']): TableModel => {
  if (matrix.length === 0) return { headers: [], rows: [], source }

  const colCount = matrix.reduce((max, r) => Math.max(max, r.length), 0)
  if (colCount === 0) return { headers: [], rows: [], source }

  const headerRaw = (matrix[0] ?? []).map(cellToString)
  while (headerRaw.length < colCount) headerRaw.push('')
  const headers = headerRaw.map((h, i) => (h.trim() === '' ? `Column ${i + 1}` : h))

  const rows = matrix.slice(1).map((r) => alignRow(Array.isArray(r) ? r : [r], colCount))
  return { headers, rows, source }
}

/**
 * 解析 CSV/TSV 文本。
 *
 * @param text 文件文本
 * @param source 'csv' → 逗号；'tsv' → 制表符
 */
export const parseDelimited = (text: string, source: 'csv' | 'tsv'): TableModel => {
  const delimiter = source === 'tsv' ? '\t' : ','
  const parsed = Papa.parse<string[]>(text, {
    delimiter,
    skipEmptyLines: 'greedy',
  })
  return normalizeMatrix(parsed.data as unknown[][], source)
}

/**
 * 解析 Excel 二进制字节（取首张 sheet）。
 *
 * @param bytes OPFS 读取的原始字节
 */
export const parseWorkbook = (bytes: Uint8Array): TableModel => {
  const workbook = XLSX.read(bytes, { type: 'array' })
  const firstSheetName = workbook.SheetNames[0]
  if (!firstSheetName) return { headers: [], rows: [], source: 'xlsx' }

  const worksheet = workbook.Sheets[firstSheetName]
  if (!worksheet) return { headers: [], rows: [], source: 'xlsx' }

  // header:1 → 返回二维数组（首行作表头），跳过类型推断开销
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
    header: 1,
    blankrows: false,
    defval: '',
    raw: true,
  })

  return normalizeMatrix(matrix, 'xlsx')
}
