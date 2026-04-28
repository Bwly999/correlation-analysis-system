import { markRaw } from 'vue'
import type { NodeDefinition } from '../types'
import { createTableResult, extractTableRows } from '../result'

export const dataEncodingScalingNode: NodeDefinition = {
  name: 'data-encoding-scaling',
  displayName: '编码/缩放',
  icon: 'sliders-horizontal',
  category: 'action',
  description: '处理类别编码与数值缩放，统一特征表达。',
  properties: [
    {
      name: 'targetColumns',
      displayName: '目标字段',
      type: 'multi-options',
      default: [],
      useUpstreamFactors: true,
      editable: true,
      forceInput: true,
      description: '选择要处理的字段；留空时默认处理所有字段。',
    },
    {
      name: 'encoding',
      displayName: '分类变量处理',
      type: 'options',
      default: 'none',
      options: [
        { name: '无', value: 'none' },
        { name: 'Label Encoding (标签编码)', value: 'label' },
      ],
      description: '按需将类别字段转为数值。',
    },
    {
      name: 'scaling',
      displayName: '特征缩放',
      type: 'options',
      default: 'zscore',
      options: [
        { name: '无', value: 'none' },
        { name: 'Min-Max 归一化 (0-1)', value: 'minmax' },
        { name: 'Z-Score 标准化', value: 'zscore' },
      ],
      description: '默认使用 Z-Score 标准化。',
    },
  ],
  execute: async (input, config) => {
    const inputRows = extractTableRows(input)
    if (!inputRows) throw new Error('输入数据格式不正确')

    const data = JSON.parse(JSON.stringify(inputRows))
    const originalCount = data.length
    if (originalCount === 0) {
      return createTableResult([], {
        meta: {
          stats: {},
        },
      })
    }

    const allFields = Object.keys(data[0])
    const targetFields =
      Array.isArray(config.targetColumns) && config.targetColumns.length > 0
        ? config.targetColumns.filter((field: string) => allFields.includes(field))
        : allFields

    const stats: Record<string, unknown> = {
      encoding: config.encoding || 'none',
      scaling: config.scaling || 'zscore',
      fieldsProcessed: [],
    }

    if (config.encoding === 'label') {
      targetFields.forEach((field: string) => {
        const sample = data.find((row: Record<string, unknown>) => row[field] !== null && row[field] !== undefined)?.[field]
        if (typeof sample === 'string' && Number.isNaN(Number(sample))) {
          const uniqueValues = Array.from(new Set(data.map((row: Record<string, unknown>) => row[field])))
          const mapping = new Map(uniqueValues.map((value, index) => [value, index]))
          data.forEach((row: Record<string, unknown>) => {
            row[field] = mapping.get(row[field])
          })
          ;(stats.fieldsProcessed as string[]).push(`${field} (Encoded)`)
        }
      })
    }

    if (config.scaling !== 'none') {
      targetFields.forEach((field: string) => {
        const values = data
          .map((row: Record<string, unknown>) => parseFloat(String(row[field])))
          .filter((value: number) => !Number.isNaN(value))

        if (values.length === 0) return

        if (config.scaling === 'minmax') {
          const min = Math.min(...values)
          const max = Math.max(...values)
          const range = max - min || 1
          data.forEach((row: Record<string, unknown>) => {
            const value = parseFloat(String(row[field]))
            if (!Number.isNaN(value)) row[field] = (value - min) / range
          })
        } else if (config.scaling === 'zscore') {
          const mean = values.reduce((left: number, right: number) => left + right, 0) / values.length
          const std =
            Math.sqrt(
              values.reduce((sum: number, value: number) => sum + Math.pow(value - mean, 2), 0) / values.length,
            ) || 1
          data.forEach((row: Record<string, unknown>) => {
            const value = parseFloat(String(row[field]))
            if (!Number.isNaN(value)) row[field] = (value - mean) / std
          })
        }

        if (!(stats.fieldsProcessed as string[]).includes(field)) {
          ;(stats.fieldsProcessed as string[]).push(field)
        }
      })
    }

    return createTableResult(markRaw(data), {
      meta: {
        stats: {
          originalCount,
          finalCount: data.length,
          ...stats,
        },
        originalCount,
      },
    })
  },
}
