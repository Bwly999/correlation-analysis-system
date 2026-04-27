import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import {
  extractTextColumnValues,
  parseTabularTextFile,
} from '../fileColumnTextImport'

const createFile = (content: BlobPart, name: string, type = 'text/plain') =>
  new File([content], name, { type })

describe('fileColumnTextImport', () => {
  it('从 CSV 按文本读取列并默认跳过空值、去重', async () => {
    const file = createFile('SN,备注\n001234,A\n,B\nSN002,C\n001234,D\n', 'sn.csv', 'text/csv')

    const parsed = await parseTabularTextFile(file)
    const result = extractTextColumnValues(parsed.rows, 'SN', { deduplicate: true })

    expect(parsed.columns).toEqual(['SN', '备注'])
    expect(result.values).toEqual(['001234', 'SN002'])
    expect(result.stats).toMatchObject({
      rawRowCount: 4,
      emptyCount: 1,
      duplicateCount: 1,
      finalCount: 2,
    })
  })

  it('关闭去重时保留重复 SN', async () => {
    const rows = [{ SN: 'SN001' }, { SN: 'SN001' }, { SN: 'SN002' }]

    const result = extractTextColumnValues(rows, 'SN', { deduplicate: false })

    expect(result.values).toEqual(['SN001', 'SN001', 'SN002'])
    expect(result.stats.duplicateCount).toBe(1)
    expect(result.stats.finalCount).toBe(3)
  })

  it('从 Excel 按显示文本读取列，保留前导零', async () => {
    const workbook = XLSX.utils.book_new()
    const sheet = XLSX.utils.aoa_to_sheet([
      ['SN', '备注'],
      ['001234', '文本 SN'],
      ['SN002', '普通 SN'],
    ])
    XLSX.utils.book_append_sheet(workbook, sheet, 'Sheet1')
    const buffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer

    const parsed = await parseTabularTextFile(createFile(buffer, 'sn.xlsx'))
    const result = extractTextColumnValues(parsed.rows, 'SN', { deduplicate: true })

    expect(result.values).toEqual(['001234', 'SN002'])
  })

  it('选择不存在的列时抛出中文错误', () => {
    expect(() => extractTextColumnValues([{ SN: 'SN001' }], '缺失列', { deduplicate: true }))
      .toThrow('未找到列：缺失列')
  })
})
