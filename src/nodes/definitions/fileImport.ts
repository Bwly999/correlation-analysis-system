import type { NodeDefinition } from '../types'
import { createFileImportTask } from '../fileImport/task'

export const fileImportNode: NodeDefinition = {
  name: 'file-import',
  displayName: '本地文件导入',
  icon: 'file-type',
  category: 'trigger',
  description: '从 CSV, JSON, Excel 等文件读取原始因子数据。',
  properties: [
    {
      name: 'fileData',
      displayName: '选择数据文件',
      type: 'file',
      required: true,
      isRuntimeInput: true,
      description: '请上传需要分析的原始数据集',
    },
    {
      name: 'format',
      displayName: '文件格式',
      type: 'options',
      default: 'auto',
      options: [
        { name: '自动识别', value: 'auto' },
        { name: 'CSV', value: 'csv' },
        { name: 'Excel', value: 'xlsx' },
        { name: 'JSON', value: 'json' },
      ],
    },
    {
      name: 'autoClean',
      displayName: '自动转换数字',
      type: 'boolean',
      default: true,
      description: '自动将数字字符串转换为数值，并处理 N/A、null 等特殊空值字符串',
    },
    {
      name: 'excludeFields',
      displayName: '排除字段',
      type: 'tags', // 使用标签类型，更适合多选操作
      default: [],
      placeholder: '输入字段名并按回车确认',
      displayIf: (config) => !!config.autoClean,
      description: '这些字段的内容将保持原始字符串格式，不进行数值转换',
    },
  ],
  execute: async (input, config) => {
    const file = config.fileData as File
    if (!file) throw new Error('未选择任何文件')
    if (!file.name || typeof file.name !== 'string') {
      throw new Error('选择的文件已失效（可能是刷新页面导致），请重新选择文件')
    }
    const task = createFileImportTask(file, {
      format: typeof config.format === 'string' ? config.format : 'auto',
      autoClean: config.autoClean !== false,
      excludeFields: config.excludeFields,
    })
    return task.result
  },
}
