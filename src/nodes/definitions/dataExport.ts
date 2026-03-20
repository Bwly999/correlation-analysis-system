import type { NodeDefinition } from '../types'
import { createFileResult, extractTableRows } from '../result'
import * as XLSX from 'xlsx'

export const dataExportNode: NodeDefinition = {
  name: 'data-export',
  displayName: '数据导出',
  icon: 'download',
  category: 'terminal',
  description: '将当前节点的数据导出为 CSV、Excel 或 JSON 文件。',
  properties: [
    {
      name: 'format',
      displayName: '导出格式',
      type: 'options',
      default: 'csv',
      options: [
        { name: 'CSV', value: 'csv' },
        { name: 'Excel (.xlsx)', value: 'xlsx' },
        { name: 'JSON', value: 'json' },
      ],
    },
    {
      name: 'filename',
      displayName: '文件名称',
      type: 'string',
      default: 'export_data',
      placeholder: '输入导出文件名前缀',
    },
  ],
  execute: async (input, config) => {
    const rows = extractTableRows(input)
    if (!rows || rows.length === 0) {
      throw new Error('无输入数据')
    }

    const format = typeof config.format === 'string' ? config.format : 'csv'
    const filename = `${config.filename || 'export_data'}.${format}`
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
      const headers = Object.keys(rows[0] ?? {})
      const csvContent = [
        headers.join(','),
        ...rows.map((row) => headers.map((key) => JSON.stringify(row[key] ?? '')).join(',')),
      ].join('\n')
      blob = new Blob([csvContent], { type: 'text/csv' })
    }

    return createFileResult(
      {
        filename,
        url: URL.createObjectURL(blob),
        format,
      },
      {
        meta: {
          sourceKind: 'table',
          rowCount: rows.length,
        },
        preview: {
          viewer: 'file-viewer',
          title: '导出文件',
          summary: `已生成 ${filename}`,
        },
      },
    )
  },
}
