import { markRaw } from 'vue'
import type { NodeDefinition } from '../types'
import { createTableResult, extractTableRows } from '../result'

type DataLimitConfig = {
  mode?: 'head' | 'tail'
  limit?: number
}

export const dataLimitNode: NodeDefinition<unknown, DataLimitConfig> = {
  name: 'data-limit',
  displayName: '数据量限制',
  icon: 'scissors-line-dashed',
  category: 'action',
  description: '按前 n 条或后 n 条截断表格数据。',
  properties: [
    {
      name: 'mode',
      displayName: '保留方式',
      type: 'options',
      default: 'head',
      options: [
        { name: '保留前 n 条', value: 'head' },
        { name: '保留后 n 条', value: 'tail' },
      ],
    },
    {
      name: 'limit',
      displayName: '保留数量',
      type: 'number',
      default: 100,
      description: '超过总行数时会直接返回全部数据。',
    },
  ],
  execute: async (input, config) => {
    const rows = extractTableRows(input)
    if (!rows) {
      throw new Error('输入数据格式不正确')
    }

    const mode = config.mode === 'tail' ? 'tail' : 'head'
    const limit = Math.max(0, Math.floor(Number(config.limit ?? 100)))
    const outputRows = mode === 'tail' ? rows.slice(-limit) : rows.slice(0, limit)

    return createTableResult(markRaw(outputRows), {
      meta: {
        stats: {
          mode,
          limit,
          originalCount: rows.length,
          outputCount: outputRows.length,
        },
      },
    })
  },
}
