import { markRaw } from 'vue'
import type { NodeDefinition } from '../types'
import { createTableResult, extractTableRows } from '../result'

type FieldSelectionConfig = {
  mode?: 'include' | 'exclude'
  fields?: string[]
}

const collectFields = (rows: Array<Record<string, unknown>>) => [
  ...new Set(rows.flatMap((row) => Object.keys(row))),
]

export const fieldSelectionNode: NodeDefinition<unknown, FieldSelectionConfig> = {
  name: 'field-selection',
  displayName: '字段选择',
  icon: 'list-filter',
  category: 'action',
  description: '在进入算法或图表前保留或排除指定字段。',
  properties: [
    {
      name: 'mode',
      displayName: '选择模式',
      type: 'options',
      default: 'include',
      options: [
        { name: '包含', value: 'include' },
        { name: '不包含', value: 'exclude' },
      ],
      description: '决定是保留选中字段，还是排除选中字段。',
    },
    {
      name: 'fields',
      displayName: '目标字段',
      type: 'multi-options',
      default: [],
      useUpstreamFactors: true,
      filterable: true,
      allowRegexSearch: true,
      filterPlaceholder: '搜索选项',
      placeholder: '请选择要处理的字段',
      description: '支持普通搜索和正则搜索。',
    },
  ],
  execute: async (input, config) => {
    const rows = extractTableRows(input)
    if (!rows) {
      throw new Error('输入数据格式不正确')
    }

    const allFields = collectFields(rows)
    const selectedFields = Array.isArray(config.fields)
      ? config.fields.filter((field) => allFields.includes(field))
      : []
    const mode = config.mode === 'exclude' ? 'exclude' : 'include'
    const outputFields =
      mode === 'exclude'
        ? allFields.filter((field) => !selectedFields.includes(field))
        : selectedFields

    const outputRows = rows.map((row) => {
      const nextRow: Record<string, unknown> = {}
      outputFields.forEach((field) => {
        if (field in row) {
          nextRow[field] = row[field]
        }
      })
      return nextRow
    })

    return createTableResult(markRaw(outputRows), {
      meta: {
        stats: {
          mode,
          originalFieldCount: allFields.length,
          selectedFieldCount: selectedFields.length,
          outputFieldCount: outputFields.length,
        },
      },
      lineage: {
        selectedFields: outputFields,
      },
    })
  },
}
