import type { NodeDefinition } from '../types'
import { markRaw } from 'vue'
import { createTableResult, extractTableRows } from '../result'

export const dataCleaningNode: NodeDefinition = {
  name: 'data-cleaning',
  displayName: '数据清洗',
  icon: 'settings-2',
  category: 'action',
  description: '处理缺失值、去重、异常值，并执行数据标准化与分类变量编码，为相关性分析做好准备。',
  properties: [
    {
      name: 'deduplicationMode',
      displayName: '去重方式',
      type: 'options',
      default: 'none',
      options: [
        { name: '不处理', value: 'none' },
        { name: '按整行去重', value: 'full_row' },
        { name: '按指定字段去重', value: 'by_fields' },
      ],
      description: '按当前数据顺序去重；若需要保留最早或最晚记录，请先用排序节点整理顺序。',
    },
    {
      name: 'deduplicationFields',
      displayName: '去重字段',
      type: 'tags',
      default: [],
      useUpstreamFactors: true,
      displayIf: (config) => config.deduplicationMode === 'by_fields',
      description: '仅在“按指定字段去重”时生效。多个字段会组合成一组唯一键。',
    },
    {
      name: 'deduplicationKeep',
      displayName: '去重保留方式',
      type: 'options',
      default: 'first',
      displayIf: (config) => config.deduplicationMode && config.deduplicationMode !== 'none',
      options: [
        { name: '保留首条', value: 'first' },
        { name: '保留末条', value: 'last' },
      ],
      description: '基于当前表格顺序保留首条或末条记录。',
    },
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
      duplicatesRemoved: 0,
      deduplicationMode: config.deduplicationMode || 'none',
      deduplicationKeep: config.deduplicationKeep || 'first',
      fieldsProcessed: [],
    }

    const serializeDedupKey = (value: unknown): string => {
      if (value instanceof Date) {
        return value.toISOString()
      }

      if (Array.isArray(value)) {
        return JSON.stringify(value.map((item) => serializeDedupKey(item)))
      }

      if (value && typeof value === 'object') {
        const sortedEntries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
          a.localeCompare(b),
        )
        return JSON.stringify(
          sortedEntries.map(([key, entryValue]) => [key, serializeDedupKey(entryValue)]),
        )
      }

      return JSON.stringify(value)
    }

    const buildDedupKey = (row: Record<string, unknown>, fields: string[]) =>
      fields.map((field) => `${field}:${serializeDedupKey(row[field])}`).join('|')

    // 1. 去重
    const deduplicationMode = config.deduplicationMode || 'none'
    if (deduplicationMode !== 'none' && data.length > 0) {
      const keepStrategy = config.deduplicationKeep || 'first'
      const dedupFields =
        deduplicationMode === 'full_row'
          ? Array.from<string>(
              data.reduce((fieldSet: Set<string>, row: Record<string, unknown>) => {
                Object.keys(row).forEach((field) => fieldSet.add(field))
                return fieldSet
              }, new Set<string>()),
            ).sort((a, b) => a.localeCompare(b))
          : Array.isArray(config.deduplicationFields)
            ? config.deduplicationFields.filter((field: string) =>
                data.some((row: Record<string, unknown>) => field in row),
              )
            : []

      if (deduplicationMode === 'full_row' || dedupFields.length > 0) {
        const seen = new Set<string>()
        const deduplicated: Array<Record<string, unknown>> = []
        const sourceRows = keepStrategy === 'last' ? [...data].reverse() : data

        sourceRows.forEach((row: Record<string, unknown>) => {
          const dedupKey = buildDedupKey(row, dedupFields)
          if (seen.has(dedupKey)) {
            return
          }

          seen.add(dedupKey)
          deduplicated.push(row)
        })

        data = keepStrategy === 'last' ? deduplicated.reverse() : deduplicated
        stats.duplicatesRemoved = originalCount - data.length
      }
    }

    // 2. 处理缺失值 (Missing Values)
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

    // 3. 异常值处理 (Outliers)
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

    // 4. 分类变量编码 (Categorical Encoding)
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

    // 5. 特征缩放 (Scaling)
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
