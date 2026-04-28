import { markRaw } from 'vue'
import type { NodeDefinition } from '../types'
import { createTableResult, extractTableRows } from '../result'

export const dataMissingOutlierNode: NodeDefinition = {
  name: 'data-missing-outlier',
  displayName: '缺失/异常值处理',
  icon: 'shield-alert',
  category: 'action',
  description: '集中处理缺失值与异常值，提升样本质量。',
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
      name: 'missingValueStrategy',
      displayName: '缺失值处理',
      type: 'options',
      default: 'drop',
      options: [
        { name: '均值填充', value: 'mean' },
        { name: '中位数填充', value: 'median' },
        { name: '零值填充', value: 'zero' },
        { name: '直接删除', value: 'drop' },
        { name: '不处理', value: 'none' },
      ],
      description: '默认删除缺失样本。',
    },
    {
      name: 'outlierMethod',
      displayName: '异常值检测',
      type: 'options',
      default: 'iqr',
      options: [
        { name: 'IQR 四分位距', value: 'iqr' },
        { name: '百分比剔除', value: 'percentile' },
        { name: '无', value: 'none' },
      ],
      description: '默认启用 IQR 四分位距检测。',
    },
    {
      name: 'iqrK',
      displayName: 'IQR 系数 (k)',
      type: 'number',
      default: 1.5,
      displayIf: (config) => config.outlierMethod === 'iqr',
    },
    {
      name: 'percentile',
      displayName: '剔除比例 (%)',
      type: 'number',
      default: 1,
      displayIf: (config) => config.outlierMethod === 'percentile',
    },
  ],
  execute: async (input, config) => {
    const inputRows = extractTableRows(input)
    if (!inputRows) throw new Error('输入数据格式不正确')

    let data = JSON.parse(JSON.stringify(inputRows))
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
      missingFilled: 0,
      rowsRemovedByMissing: 0,
      outliersRemoved: 0,
      missingValueStrategy: config.missingValueStrategy || 'drop',
      outlierMethod: config.outlierMethod || 'iqr',
    }

    if (config.missingValueStrategy !== 'none') {
      if (config.missingValueStrategy === 'drop') {
        const prevCount = data.length
        data = data.filter((row: Record<string, unknown>) =>
          targetFields.every((field: string) => row[field] !== null && row[field] !== undefined && row[field] !== ''),
        )
        stats.rowsRemovedByMissing = prevCount - data.length
      } else {
        const fillValues: Record<string, number> = {}
        targetFields.forEach((field: string) => {
          const values = data
            .map((row: Record<string, unknown>) =>
              typeof row[field] === 'number' ? row[field] : parseFloat(String(row[field])),
            )
            .filter((value: number) => !Number.isNaN(value))

          if (values.length === 0) return

          if (config.missingValueStrategy === 'mean') {
            fillValues[field] = values.reduce((left: number, right: number) => left + right, 0) / values.length
          } else if (config.missingValueStrategy === 'median') {
            const sorted = [...values].sort((left, right) => left - right)
            fillValues[field] = sorted[Math.floor(sorted.length / 2)]
          } else if (config.missingValueStrategy === 'zero') {
            fillValues[field] = 0
          }
        })

        data.forEach((row: Record<string, unknown>) => {
          targetFields.forEach((field: string) => {
            if (row[field] === null || row[field] === undefined || row[field] === '') {
              row[field] = fillValues[field] ?? 0
              stats.missingFilled = Number(stats.missingFilled) + 1
            }
          })
        })
      }
    }

    if (config.outlierMethod !== 'none' && data.length > 0) {
      const prevCount = data.length

      targetFields.forEach((field: string) => {
        const values = data
          .map((row: Record<string, unknown>) => parseFloat(String(row[field])))
          .filter((value: number) => !Number.isNaN(value))
          .sort((left: number, right: number) => left - right)

        if (values.length < 10) return

        let lower = -Infinity
        let upper = Infinity

        if (config.outlierMethod === 'iqr') {
          const q1 = values[Math.floor(values.length * 0.25)]
          const q3 = values[Math.floor(values.length * 0.75)]
          const iqr = q3 - q1
          const iqrK = Number(config.iqrK || 1.5)
          lower = q1 - iqrK * iqr
          upper = q3 + iqrK * iqr
        } else if (config.outlierMethod === 'percentile') {
          const percentile = Number(config.percentile || 1) / 100
          lower = values[Math.floor(values.length * percentile)]
          upper = values[Math.floor(values.length * (1 - percentile))]
        }

        data = data.filter((row: Record<string, unknown>) => {
          const value = parseFloat(String(row[field]))
          return Number.isNaN(value) || (value >= lower && value <= upper)
        })
      })

      stats.outliersRemoved = prevCount - data.length
    }

    return createTableResult(markRaw(data), {
      meta: {
        stats: {
          originalCount,
          finalCount: data.length,
          ...stats,
        },
        originalCount,
        cleanedCount: data.length,
      },
    })
  },
}
