import type { NodeDefinition } from '../types'

export const dataCleaningNode: NodeDefinition = {
  name: 'data-cleaning',
  displayName: '数据清洗',
  icon: 'settings-2',
  category: 'action',
  description: '处理数据中的缺失值和异常值，支持均值填充、中位数填充及 IQR 异常值剔除。',
  properties: [
    {
      name: 'missingValueStrategy',
      displayName: '缺失值处理策略',
      type: 'options',
      default: 'mean',
      options: [
        { name: '均值填充', value: 'mean' },
        { name: '中位数填充', value: 'median' },
        { name: '零值填充', value: 'zero' },
        { name: '直接删除', value: 'drop' },
      ],
    },
    {
      name: 'outlierMethod',
      displayName: '异常值检测方法',
      type: 'options',
      default: 'iqr',
      options: [
        { name: 'IQR 四分位距', value: 'iqr' },
        { name: '百分比剔除', value: 'percentile' },
        { name: '无', value: 'none' },
      ],
    },
    {
      name: 'iqrK',
      displayName: 'IQR 系数 (k)',
      type: 'number',
      default: 1.5,
    },
  ],
  execute: async (input, config) => {
    if (!input || !input.data || !Array.isArray(input.data)) {
      throw new Error('输入数据格式不正确')
    }

    let data = [...input.data]
    const originalCount = data.length
    const fields = Object.keys(data[0] || {})

    // 1. 处理缺失值
    if (config.missingValueStrategy === 'drop') {
      data = data.filter((row) =>
        fields.every((f) => row[f] !== null && row[f] !== undefined && row[f] !== ''),
      )
    } else {
      // 计算填充值
      const fillValues: Record<string, number> = {}
      fields.forEach((f) => {
        const values = data.map((r) => Number(r[f])).filter((v) => !isNaN(v))
        if (values.length === 0) return

        if (config.missingValueStrategy === 'mean') {
          fillValues[f] = values.reduce((a, b) => a + b, 0) / values.length
        } else if (config.missingValueStrategy === 'median') {
          const sorted = [...values].sort((a, b) => a - b)
          fillValues[f] = sorted[Math.floor(sorted.length / 2)]
        } else if (config.missingValueStrategy === 'zero') {
          fillValues[f] = 0
        }
      })

      data = data.map((row) => {
        const newRow = { ...row }
        fields.forEach((f) => {
          if (newRow[f] === null || newRow[f] === undefined || newRow[f] === '') {
            newRow[f] = fillValues[f] ?? 0
          }
        })
        return newRow
      })
    }

    // 2. 处理异常值
    if (config.outlierMethod === 'iqr') {
      const k = config.iqrK || 1.5
      fields.forEach((f) => {
        const values = data
          .map((r) => Number(r[f]))
          .filter((v) => !isNaN(v))
          .sort((a, b) => a - b)
        if (values.length < 4) return

        const q1 = values[Math.floor(values.length * 0.25)]
        const q3 = values[Math.floor(values.length * 0.75)]
        const iqr = q3 - q1
        const lower = q1 - k * iqr
        const upper = q3 + k * iqr

        data = data.filter((row) => {
          const val = Number(row[f])
          return isNaN(val) || (val >= lower && val <= upper)
        })
      })
    }

    return {
      data,
      originalCount,
      cleanedCount: data.length,
      removedCount: originalCount - data.length,
      strategy: config.missingValueStrategy,
      outlierMethod: config.outlierMethod,
      method: config.outlierMethod,
    }
  },
}
