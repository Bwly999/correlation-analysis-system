import type { NodeDefinition } from '../types'
import { markRaw } from 'vue'

export const dataAggregationNode: NodeDefinition = {
  name: 'data-aggregation',
  displayName: '数据聚合',
  icon: 'sigma',
  category: 'action',
  description: '提供多列合并、Group By 分组统计及移动窗口计算，是特征工程的核心算子。',
  properties: [
    {
      name: 'mode',
      displayName: '聚合模式',
      type: 'select-button', // 仅保留组件 UI 改进
      default: 'row_combine',
      options: [
        { name: '行内多列合并 (Row-wise)', value: 'row_combine' },
        { name: '维度分组统计 (Group By)', value: 'group_by' },
        { name: '移动窗口计算 (Rolling)', value: 'rolling' },
      ],
      description: '行内合并用于构建综合指标；分组统计用于分析维度特征；移动窗口用于捕捉时序趋势。',
    },
    // --- 模式 1: 行内多列合并 (恢复原始 Collection 布局) ---
    {
      name: 'aggregationGroups',
      displayName: '任务配置',
      type: 'collection',
      default: [],
      displayIf: (config) => config.mode === 'row_combine',
      description: '定义如何将当前行内的多个字段合并为一个新字段。',
      properties: [
        {
          name: 'targetFactorName',
          displayName: '新字段名称',
          type: 'string',
          default: 'factor_combined',
          placeholder: '例如: factor_index',
        },
        {
          name: 'method',
          displayName: '聚合算法',
          type: 'options',
          default: 'mean',
          options: [
            { name: '算术平均 (Mean)', value: 'mean' },
            { name: '总和 (Sum)', value: 'sum' },
            { name: '最大值 (Max)', value: 'max' },
            { name: '最小值 (Min)', value: 'min' },
          ],
        },
        {
          name: 'inputColumns',
          displayName: '参与字段',
          type: 'tags',
          default: [],
          useUpstreamFactors: true,
          description: '输入或选择要参与合并的字段名。',
        },
      ],
    },
    // --- 模式 2: 分组聚合 ---
    {
      name: 'groupByField',
      displayName: '分组基准字段',
      type: 'options',
      useUpstreamFactors: true,
      editable: true,
      displayIf: (config) => config.mode === 'group_by',
      placeholder: '例如: 行业, 日期, 分类',
      description: '数据将根据此字段的唯一值进行拆分并分别统计。',
    },
    {
      name: 'groupByMethods',
      displayName: '统计指标',
      type: 'multi-options',
      default: ['mean'],
      displayIf: (config) => config.mode === 'group_by',
      options: [
        { name: '均值 (Mean)', value: 'mean' },
        { name: '总和 (Sum)', value: 'sum' },
        { name: '数据量 (Count)', value: 'count' },
        { name: '标准差 (Std)', value: 'std' },
        { name: '中位数 (Median)', value: 'median' },
      ],
    },
    // --- 模式 3: 移动窗口 ---
    {
      name: 'windowSize',
      displayName: '窗口长度 (N)',
      type: 'number',
      default: 5,
      displayIf: (config) => config.mode === 'rolling',
      description: '计算包含当前行在内的前 N 行数据的移动统计量。',
    },
    {
      name: 'rollingMethod',
      displayName: '窗口算法',
      type: 'options',
      default: 'mean',
      displayIf: (config) => config.mode === 'rolling',
      options: [
        { name: '移动平均 (MA)', value: 'mean' },
        { name: '窗口求和 (Sum)', value: 'sum' },
        { name: '窗口最大值 (Max)', value: 'max' },
        { name: '窗口最小值 (Min)', value: 'min' },
      ],
    },
    {
      name: 'targetColumns',
      displayName: '目标处理字段',
      type: 'tags',
      default: [],
      useUpstreamFactors: true,
      displayIf: (config) => config.mode === 'group_by' || config.mode === 'rolling',
      description: '指定要参与聚合计算的字段。留空则尝试自动处理所有数值型字段。',
    },
  ],
  execute: async (input, config) => {
    if (!input || !input.data || !Array.isArray(input.data)) {
      throw new Error('输入数据格式不正确')
    }

    const rawData = input.data
    const allFields = Object.keys(rawData[0] || {})
    const targetFields =
      config.targetColumns && config.targetColumns.length > 0
        ? config.targetColumns.filter((f: string) => allFields.includes(f))
        : allFields.filter((f: string) => typeof rawData[0][f] === 'number')

    if (config.mode === 'row_combine') {
      const groups = config.aggregationGroups || []
      const resultData = rawData.map((row: any) => {
        const newRow = { ...row }
        groups.forEach((group: any) => {
          const inputCols = group.inputColumns || []
          const vals = inputCols
            .map((col: string) => Number(row[col]))
            .filter((v: number) => !isNaN(v))

          if (vals.length === 0) {
            newRow[group.targetFactorName] = null
            return
          }

          if (group.method === 'mean') {
            newRow[group.targetFactorName] = vals.reduce((a, b) => a + b, 0) / vals.length
          } else if (group.method === 'sum') {
            newRow[group.targetFactorName] = vals.reduce((a, b) => a + b, 0)
          } else if (group.method === 'max') {
            newRow[group.targetFactorName] = Math.max(...vals)
          } else if (group.method === 'min') {
            newRow[group.targetFactorName] = Math.min(...vals)
          }
        })
        return newRow
      })
      return { data: markRaw(resultData), count: resultData.length }
    }

    if (config.mode === 'group_by') {
      const groupKey = config.groupByField
      if (!groupKey || !allFields.includes(groupKey)) {
        throw new Error(`分组字段 "${groupKey}" 不存在`)
      }

      const groups: Record<string, any[]> = {}
      rawData.forEach((row: any) => {
        const val = String(row[groupKey])
        if (!groups[val]) groups[val] = []
        groups[val].push(row)
      })

      const methods = config.groupByMethods || ['mean']
      const resultData = Object.entries(groups).map(([groupVal, rows]) => {
        const result: any = { [groupKey]: groupVal, row_count: rows.length }
        targetFields.forEach((f: string) => {
          if (f === groupKey) return
          const values = rows.map((r) => Number(r[f])).filter((v) => !isNaN(v))
          if (values.length === 0) return

          methods.forEach((m: string) => {
            const key = `${f}_${m}`
            if (m === 'mean') {
              result[key] = values.reduce((a, b) => a + b, 0) / values.length
            } else if (m === 'sum') {
              result[key] = values.reduce((a, b) => a + b, 0)
            } else if (m === 'count') {
              result[key] = values.length
            } else if (m === 'std') {
              const mean = values.reduce((a, b) => a + b, 0) / values.length
              result[key] = Math.sqrt(
                values.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / values.length,
              )
            } else if (m === 'median') {
              const sorted = [...values].sort((a, b) => a - b)
              result[key] = sorted[Math.floor(sorted.length / 2)]
            }
          })
        })
        return result
      })
      return { data: markRaw(resultData), count: resultData.length }
    }

    if (config.mode === 'rolling') {
      const windowSize = Number(config.windowSize || 5)
      const method = config.rollingMethod || 'mean'

      const resultData = rawData.map((row: any, idx: number) => {
        const newRow = { ...row }
        targetFields.forEach((f: string) => {
          const start = Math.max(0, idx - windowSize + 1)
          const windowRows = rawData.slice(start, idx + 1)
          const values = windowRows.map((r: any) => Number(r[f])).filter((v: number) => !isNaN(v))

          const key = `${f}_rolling_${windowSize}`
          if (values.length === 0) {
            newRow[key] = null
          } else if (method === 'mean') {
            newRow[key] = values.reduce((a, b) => a + b, 0) / values.length
          } else if (method === 'sum') {
            newRow[key] = values.reduce((a, b) => a + b, 0)
          } else if (method === 'max') {
            newRow[key] = Math.max(...values)
          } else if (method === 'min') {
            newRow[key] = Math.min(...values)
          }
        })
        return newRow
      })
      return { data: markRaw(resultData), count: resultData.length }
    }

    return { data: markRaw(rawData), count: rawData.length }
  },
}
