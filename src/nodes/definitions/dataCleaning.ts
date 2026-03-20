import type { NodeDefinition } from '../types'
import { markRaw } from 'vue'
import { createTableResult, extractTableRows } from '../result'

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
      useUpstreamFactors: true,
      description:
        '选择或输入要执行清洗操作的字段名。留空则自动处理所有数值型字段，排除 ID 或日期类字段。',
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
      description:
        '当数据存在空值（null/undefined/空字符串）时的填充方案。均值/中位数填充仅适用于数值字段。',
    },
    {
      name: 'outlierMethod',
      displayName: '异常值检测',
      type: 'options',
      default: 'none',
      options: [
        { name: 'IQR 四分位距', value: 'iqr' },
        { name: '百分比剔除', value: 'percentile' },
        { name: '无', value: 'none' },
      ],
      description:
        '识别并处理偏离正常范围的极端值。IQR 适用于近似正态分布的数据，百分比法适用于强制剔除两端极值。',
    },
    {
      name: 'iqrK',
      displayName: 'IQR 系数 (k)',
      type: 'number',
      default: 1.5,
      displayIf: (config) => config.outlierMethod === 'iqr',
      description:
        'IQR 方法的系数。通常 1.5 用于检测中度异常，3.0 用于检测极端异常。值越大，保留的数据越多。',
    },
    {
      name: 'percentile',
      displayName: '剔除比例 (%)',
      type: 'number',
      default: 1,
      displayIf: (config) => config.outlierMethod === 'percentile',
      description:
        '从数据两端剔除的比例。例如输入 1 表示剔除最小的 1% 和最大的 1% 数据。范围建议 0.5 - 5。',
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
      description:
        '将数据缩放到统一量纲。相关性分析（特别是回归类算法）通常需要标准化或归一化以消除量级偏差。',
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
      description:
        '将非数值字段（如“行业”、“类型”）转换为整数。Pearson 相关性分析和 XGBoost 训练必须将特征转为数值。',
    },
  ],
  execute: async (input, config) => {
    const inputRows = extractTableRows(input)
    if (!inputRows) {
      throw new Error('输入数据格式不正确')
    }

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
          const p = (config.percentile || 1) / 100
          lower = values[Math.floor(values.length * p)]
          upper = values[Math.floor(values.length * (1 - p))]
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

    return createTableResult(markRaw(data), {
      meta: {
        stats: {
          originalCount,
          finalCount: data.length,
          ...stats,
        },
        originalCount,
        cleanedCount: data.length,
        removedCount: originalCount - data.length,
      },
    })
  },
}
