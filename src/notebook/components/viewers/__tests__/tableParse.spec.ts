/**
 * tableParse 单测：验证 CSV/TSV/Excel 解析正确性。
 *
 * 重点覆盖原 M1 实现 split(',') 的缺陷：
 *   - 含逗号的引号字段不被误切
 *   - TSV 按 tab 切分
 *   - 空表头补名 'Column N'
 *   - Excel 二进制经 SheetJS 正确还原（非乱码）
 */

import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'

import { parseDelimited, parseWorkbook } from '../tableParse'

describe('parseDelimited', () => {
  it('CSV：首行作表头，后续行作数据', () => {
    const text = 'date,factor_a,factor_b\n2024-01-02,1.0,2.3\n2024-01-03,1.1,2.4'
    const { headers, rows, source } = parseDelimited(text, 'csv')

    expect(headers).toEqual(['date', 'factor_a', 'factor_b'])
    expect(rows).toEqual([
      ['2024-01-02', '1.0', '2.3'],
      ['2024-01-03', '1.1', '2.4'],
    ])
    expect(source).toBe('csv')
  })

  it('CSV：引号包裹的含逗号字段不误切（原 split(",") 会切错）', () => {
    const text = 'name,note\n"Smith, John","hello, world"\n"Doe, Jane",ok'
    const { headers, rows } = parseDelimited(text, 'csv')

    expect(headers).toEqual(['name', 'note'])
    expect(rows).toEqual([
      ['Smith, John', 'hello, world'],
      ['Doe, Jane', 'ok'],
    ])
  })

  it('CSV：引号内转义引号（""）正确还原', () => {
    const text = 'label,value\n"say ""hi""",1'
    const { rows } = parseDelimited(text, 'csv')
    expect(rows[0]).toEqual(['say "hi"', '1'])
  })

  it('TSV：按制表符切分（而非逗号）', () => {
    const text = 'a\tb\tc\n1\t2\t3\n4,5\t6\t7'
    const { headers, rows, source } = parseDelimited(text, 'tsv')

    expect(headers).toEqual(['a', 'b', 'c'])
    expect(rows).toEqual([
      ['1', '2', '3'],
      ['4,5', '6', '7'],
    ])
    expect(source).toBe('tsv')
  })

  it('空表头补名 Column N；列数取最大宽度（不丢数据），短行补空串', () => {
    const text = 'col1,,col3\n1,2,3,4'
    const { headers, rows } = parseDelimited(text, 'csv')

    // 首行 3 列、数据行 4 列 → 列数按最大宽度 4，第 4 列表头补名
    expect(headers).toEqual(['col1', 'Column 2', 'col3', 'Column 4'])
    expect(rows[0]).toEqual(['1', '2', '3', '4'])
  })

  it('空文本返回空表', () => {
    const { headers, rows } = parseDelimited('', 'csv')
    expect(headers).toEqual([])
    expect(rows).toEqual([])
  })

  it('跳过空行（skipEmptyLines）', () => {
    const text = 'a,b\n1,2\n\n3,4\n'
    const { rows } = parseDelimited(text, 'csv')
    expect(rows).toEqual([
      ['1', '2'],
      ['3', '4'],
    ])
  })
})

describe('parseWorkbook', () => {
  /** 用 SheetJS 在内存中构造一个 xlsx 字节数组（不落盘）。 */
  const buildXlsxBytes = (aoa: unknown[][]): Uint8Array => {
    const ws = XLSX.utils.aoa_to_sheet(aoa)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
    const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
    return new Uint8Array(out as ArrayBuffer)
  }

  it('Excel 二进制：首张 sheet 还原为表头+行', () => {
    const bytes = buildXlsxBytes([
      ['date', 'factor_a', 'factor_b'],
      ['2024-01-02', 1.0, 2.3],
      ['2024-01-03', 1.1, 2.4],
    ])
    const { headers, rows, source } = parseWorkbook(bytes)

    expect(headers).toEqual(['date', 'factor_a', 'factor_b'])
    expect(rows).toEqual([
      ['2024-01-02', '1', '2.3'],
      ['2024-01-03', '1.1', '2.4'],
    ])
    expect(source).toBe('xlsx')
  })

  it('Excel：数字归一化为字符串字面量', () => {
    const bytes = buildXlsxBytes([['n'], [42], [3.14], [0]])
    const { rows } = parseWorkbook(bytes)
    expect(rows).toEqual([['42'], ['3.14'], ['0']])
  })

  it('Excel：布尔与空单元格归一化', () => {
    const bytes = buildXlsxBytes([['flag', 'note'], [true, 'x'], [false, '']])
    const { rows } = parseWorkbook(bytes)
    expect(rows).toEqual([
      ['TRUE', 'x'],
      ['FALSE', ''],
    ])
  })

  it('Excel：空工作簿返回空表', () => {
    const bytes = buildXlsxBytes([])
    const { headers, rows } = parseWorkbook(bytes)
    expect(headers).toEqual([])
    expect(rows).toEqual([])
  })
})
