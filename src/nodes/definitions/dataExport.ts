import type { NodeDefinition } from '../types'

export const dataExportNode: NodeDefinition = {
  name: 'data-export',
  displayName: '数据导出',
  icon: 'download',
  category: 'terminal',
  description: '将处理后的数据导出为指定格式的文件。',
  properties: [
    {
      name: 'format',
      displayName: '导出格式',
      type: 'options',
      default: 'csv',
      options: [
        { name: 'CSV (逗号分隔)', value: 'csv' },
        { name: 'Excel (.xlsx)', value: 'xlsx' },
        { name: 'JSON 数据', value: 'json' },
      ],
    },
    {
      name: 'filename',
      displayName: '文件名称',
      type: 'string',
      default: 'export_data',
      placeholder: '输入导出的文件名前缀',
    },
  ],
  execute: async (input, config) => {
    if (!input || !input.data) return { message: '无输入数据' }
    console.log('Exporting data as:', config.format)

    // 模拟文件生成
    const format = config.format || 'csv'
    const filename = `${config.filename || 'export_data'}.${format}`
    let blob: Blob

    if (format === 'json') {
      blob = new Blob([JSON.stringify(input.data, null, 2)], { type: 'application/json' })
    } else {
      // 简单模拟 CSV
      const keys = Object.keys(input.data[0] || {})
      const csvContent = [
        keys.join(','),
        ...input.data.slice(0, 100).map((row: any) => keys.map((k) => row[k]).join(',')),
      ].join('\n')
      blob = new Blob([csvContent], { type: 'text/csv' })
    }

    return {
      viewType: 'export',
      exportInfo: {
        filename,
        url: URL.createObjectURL(blob),
      },
    }
  },
}
