import type { NodeDefinition } from '../types'
import { markRaw } from 'vue'

export const dataCleaningNode: NodeDefinition = {
  name: 'data-cleaning',
  displayName: '数据清洗',
  icon: 'settings-2',
  category: 'action',
  description: '处理缺失值、异常值，并执行数据标准化与分类变量编码，为相关性分析做好准备。',
  properties: [
    {
      name: 'targetColumns',
      displayName: '目标字段',
      type: 'tags',
      default: [],
      description: '输入要处理的字段名（留空表示处理所有数值字段）',
    },
    {
      name: 'missingValueStrategy',
      displayName: '缺失值处理',
      type: 'options',
      default: 'mean',
      options: [
        { name: '均值填充', value: 'mean' },
        { name: '中位数填充', value: 'median' },
        { name: '零值填充', value: 'zero' },
        { name: '直接删除', value: 'drop' },
        { name: '不处理', value: 'none' },
      ],
    },
    {
      name: 'outlierMethod',
      displayName: '异常值检测',
      type: 'options',
      default: 'none',
      options: [
        { name: 'IQR 四分位距', value: 'iqr' },
        { name: '百分比剔除 (1% - 99%)', value: 'percentile' },
        { name: '无', value: 'none' },
      ],
    },
    {
      name: 'iqrK',
      displayName: 'IQR 系数 (k)',
      type: 'number',
      default: 1.5,
      displayIf: (config) => config.outlierMethod === 'iqr',
    },
    {
      name: 'scaling',
      displayName: '特征缩放',
      type: 'options',
      default: 'none',
      options: [
        { name: '无', value: 'none' },
        { name: 'Min-Max 归一化 (0-1)', value: 'minmax' },
        { name: 'Z-Score 标准化', value: 'zscore' },
      ],
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
      description: '将非数值字段转换为整数，以便参与 Pearson/XGBoost 分析。',
    },
  ],
  execute: async (input, config) => {
    if (!input || !input.data || !Array.isArray(input.data)) {
      throw new Error('输入数据格式不正确')
    }

    let data = JSON.parse(JSON.stringify(input.data)) // 深拷贝避免污染
    const originalCount = data.length
    if (originalCount === 0) return { data: [], stats: {} }

    const allFields = Object.keys(data[0])
    const targetFields =
      config.targetColumns && config.targetColumns.length > 0
        ? config.targetColumns.filter((f: string) => allFields.includes(f))
        : allFields

    const stats: any = {
      missingFilled: 0,
      rowsRemoved: 0,
      outliersRemoved: 0,
      fieldsProcessed: [],
    }

    // 1. 处理缺失值 (Missing Values)
    if (config.missingValueStrategy !== 'none') {
      if (config.missingValueStrategy === 'drop') {
        const prevCount = data.length
        data = data.filter((row: any) =>
          targetFields.every(
            (f: string) => row[f] !== null && row[f] !== undefined && row[f] !== '',
          ),
        )
        stats.rowsRemoved = prevCount - data.length
      } else {
        const fillValues: Record<string, any> = {}
        targetFields.forEach((f: string) => {
          const values = data
            .map((r: any) => (typeof r[f] === 'number' ? r[f] : parseFloat(r[f])))
            .filter((v: number) => !isNaN(v))

          if (values.length === 0) return

          if (config.missingValueStrategy === 'mean') {
            fillValues[f] = values.reduce((a: number, b: number) => a + b, 0) / values.length
          } else if (config.missingValueStrategy === 'median') {
            const sorted = [...values].sort((a: number, b: number) => a - b)
            fillValues[f] = sorted[Math.floor(sorted.length / 2)]
          } else if (config.missingValueStrategy === 'zero') {
            fillValues[f] = 0
          }
        })

        data.forEach((row: any) => {
          targetFields.forEach((f: string) => {
            if (row[f] === null || row[f] === undefined || row[f] === '') {
              row[f] = fillValues[f] ?? 0
              stats.missingFilled++
            }
          })
        })
      }
    }

    // 2. 异常值处理 (Outliers)
    if (config.outlierMethod !== 'none' && data.length > 0) {
      const prevCount = data.length
      targetFields.forEach((f: string) => {
        const values = data
          .map((r: any) => parseFloat(r[f]))
          .filter((v: number) => !isNaN(v))
          .sort((a: number, b: number) => a - b)

        if (values.length < 10) return // 数据太少不剔除异常值

        let lower = -Infinity
        let upper = Infinity

        if (config.outlierMethod === 'iqr') {
          const k = config.iqrK || 1.5
          const q1 = values[Math.floor(values.length * 0.25)]
          const q3 = values[Math.floor(values.length * 0.75)]
          const iqr = q3 - q1
          lower = q1 - k * iqr
          upper = q3 + k * iqr
        } else if (config.outlierMethod === 'percentile') {
          lower = values[Math.floor(values.length * 0.01)]
          upper = values[Math.floor(values.length * 0.99)]
        }

        data = data.filter((row: any) => {
          const val = parseFloat(row[f])
          return isNaN(val) || (val >= lower && val <= upper)
        })
      })
      stats.outliersRemoved = prevCount - data.length
    }

    // 3. 分类变量编码 (Categorical Encoding)
    if (config.encoding === 'label') {
      targetFields.forEach((f: string) => {
        // 判断是否为非数值列
        const sample = data.find((r: any) => r[f] !== null && r[f] !== undefined)?.[f]
        if (typeof sample === 'string' && isNaN(Number(sample))) {
          const uniqueValues = Array.from(new Set(data.map((r: any) => r[f])))
          const mapping = new Map(uniqueValues.map((val, idx) => [val, idx]))
          data.forEach((row: any) => {
            row[f] = mapping.get(row[f])
          })
          stats.fieldsProcessed.push(`${f} (Encoded)`)
        }
      })
    }

    // 4. 特征缩放 (Scaling)
    if (config.scaling !== 'none' && data.length > 0) {
      targetFields.forEach((f: string) => {
        const values = data.map((r: any) => parseFloat(r[f])).filter((v: number) => !isNaN(v))
        if (values.length === 0) return

        if (config.scaling === 'minmax') {
          const min = Math.min(...values)
          const max = Math.max(...values)
          const range = max - min || 1
          data.forEach((row: any) => {
            const val = parseFloat(row[f])
            if (!isNaN(val)) row[f] = (val - min) / range
          })
        } else if (config.scaling === 'zscore') {
          const mean = values.reduce((a: number, b: number) => a + b, 0) / values.length
          const std =
            Math.sqrt(
              values.reduce((a: number, b: number) => a + Math.pow(b - mean, 2), 0) / values.length,
            ) || 1
          data.forEach((row: any) => {
            const val = parseFloat(row[f])
            if (!isNaN(val)) row[f] = (val - mean) / std
          })
        }
        if (!stats.fieldsProcessed.includes(f)) stats.fieldsProcessed.push(f)
      })
    }

    return {
      data: markRaw(data),
      stats: {
        originalCount,
        finalCount: data.length,
        ...stats,
      },
      // 兼容旧版输出
      originalCount,
      cleanedCount: data.length,
      removedCount: originalCount - data.length,
    }
  },
}
