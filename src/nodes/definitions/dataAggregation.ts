import type { NodeDefinition } from '../types'
import { markRaw } from 'vue'
import { createTableResult, extractTableRows } from '../result'

const toFiniteNumber = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

const toDate = (value: unknown) => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value)
    if (!Number.isNaN(parsed.getTime())) return parsed
  }
  return null
}

const getWindowUnitMs = (unit: string) => {
  if (unit === 'minute') return 60 * 1000
  if (unit === 'hour') return 60 * 60 * 1000
  if (unit === 'day') return 24 * 60 * 60 * 1000
  return 60 * 60 * 1000
}

const summarizeValues = (values: number[], method: string) => {
  if (values.length === 0) return null
  if (method === 'mean') return values.reduce((a, b) => a + b, 0) / values.length
  if (method === 'sum') return values.reduce((a, b) => a + b, 0)
  if (method === 'max') return Math.max(...values)
  if (method === 'min') return Math.min(...values)
  if (method === 'count') return values.length
  if (method === 'std') {
    const avg = values.reduce((a, b) => a + b, 0) / values.length
    return Math.sqrt(values.reduce((sum, value) => sum + Math.pow(value - avg, 2), 0) / values.length)
  }
  if (method === 'median') {
    const sorted = [...values].sort((a, b) => a - b)
    return sorted[Math.floor(sorted.length / 2)] ?? null
  }
  return null
}

export const dataAggregationNode: NodeDefinition = {
  name: 'data-aggregation',
  displayName: '数据聚合',
  icon: 'sigma',
  category: 'action',
  description: '提供行内合并、分组统计和移动窗口聚合，便于构建新的分析特征。',
  properties: [
    {
      name: 'mode',
      displayName: '聚合模式',
      type: 'select-button',
      default: 'row_combine',
      options: [
        { name: '行内多列合并', value: 'row_combine' },
        { name: '分组统计', value: 'group_by' },
        { name: '移动窗口', value: 'rolling' },
        { name: '时间窗口', value: 'time_window' },
      ],
      description: '行内合并适合构建综合指标；分组统计适合做维度汇总；移动窗口适合按行顺序计算；时间窗口适合按时间分桶汇总。',
    },
    {
      name: 'aggregationGroups',
      displayName: '任务配置',
      type: 'collection',
      default: [],
      displayIf: (config) => config.mode === 'row_combine',
      description: '定义如何把当前行内多个字段聚合为一个新字段。',
      properties: [
        {
          name: 'targetFactorName',
          displayName: '新字段名称',
          type: 'string',
          default: 'factor_combined',
          placeholder: '例如：factor_index',
        },
        {
          name: 'method',
          displayName: '聚合算法',
          type: 'options',
          default: 'mean',
          options: [
            { name: '平均值', value: 'mean' },
            { name: '求和', value: 'sum' },
            { name: '最大值', value: 'max' },
            { name: '最小值', value: 'min' },
          ],
        },
        {
          name: 'inputColumns',
          displayName: '参与字段',
          type: 'tags',
          default: [],
          useUpstreamFactors: true,
          description: '输入或选择需要参与聚合的字段名。',
        },
      ],
    },
    {
      name: 'groupByField',
      displayName: '分组字段',
      type: 'options',
      useUpstreamFactors: true,
      editable: true,
      displayIf: (config) => config.mode === 'group_by',
      placeholder: '例如：工序、日期、类型',
      description: '按该字段拆分数据后分别计算统计结果。',
    },
    {
      name: 'groupByMethods',
      displayName: '统计指标',
      type: 'multi-options',
      default: ['mean'],
      displayIf: (config) => config.mode === 'group_by',
      options: [
        { name: '平均值', value: 'mean' },
        { name: '求和', value: 'sum' },
        { name: '数量', value: 'count' },
        { name: '标准差', value: 'std' },
        { name: '中位数', value: 'median' },
      ],
    },
    {
      name: 'windowSize',
      displayName: '窗口长度',
      type: 'number',
      default: 5,
      displayIf: (config) => config.mode === 'rolling',
      description: '计算包含当前行在内的前 N 行窗口统计值。',
    },
    {
      name: 'timeField',
      displayName: '时间字段',
      type: 'options',
      useUpstreamFactors: true,
      editable: true,
      displayIf: (config) => config.mode === 'time_window',
      placeholder: '例如：created_at、ts、采集时间',
      description: '选择用于时间分桶的字段，字段值需要能被识别为合法时间。',
    },
    {
      name: 'timeWindowSize',
      displayName: '时间窗口长度',
      type: 'number',
      default: 1,
      displayIf: (config) => config.mode === 'time_window',
      description: '每个时间桶覆盖的固定窗口长度。',
    },
    {
      name: 'timeWindowUnit',
      displayName: '时间单位',
      type: 'options',
      default: 'hour',
      displayIf: (config) => config.mode === 'time_window',
      options: [
        { name: '分钟', value: 'minute' },
        { name: '小时', value: 'hour' },
        { name: '天', value: 'day' },
      ],
    },
    {
      name: 'timeWindowMethods',
      displayName: '窗口统计指标',
      type: 'multi-options',
      default: ['mean'],
      displayIf: (config) => config.mode === 'time_window',
      options: [
        { name: '平均值', value: 'mean' },
        { name: '求和', value: 'sum' },
        { name: '数量', value: 'count' },
        { name: '标准差', value: 'std' },
        { name: '中位数', value: 'median' },
        { name: '最大值', value: 'max' },
        { name: '最小值', value: 'min' },
      ],
    },
    {
      name: 'rollingMethod',
      displayName: '窗口算法',
      type: 'options',
      default: 'mean',
      displayIf: (config) => config.mode === 'rolling',
      options: [
        { name: '移动平均', value: 'mean' },
        { name: '窗口求和', value: 'sum' },
        { name: '窗口最大值', value: 'max' },
        { name: '窗口最小值', value: 'min' },
      ],
    },
    {
      name: 'targetColumns',
      displayName: '目标处理字段',
      type: 'tags',
      default: [],
      useUpstreamFactors: true,
      displayIf: (config) =>
        config.mode === 'group_by' || config.mode === 'rolling' || config.mode === 'time_window',
      description: '留空时自动选择全部数值字段。',
    },
  ],
  execute: async (input, config) => {
    const rawData = extractTableRows(input)
    if (!rawData || rawData.length === 0) {
      throw new Error('输入数据格式不正确')
    }

    const allFields = Object.keys(rawData[0] ?? {})
    const targetFields: string[] =
      Array.isArray(config.targetColumns) && config.targetColumns.length > 0
        ? config.targetColumns.filter((field: string) => allFields.includes(field))
        : allFields.filter((field) => rawData.some((row) => toFiniteNumber(row[field]) !== null))

    if (config.mode === 'row_combine') {
      const groups = Array.isArray(config.aggregationGroups) ? config.aggregationGroups : []
      const resultData = rawData.map((row) => {
        const nextRow = { ...row }
        groups.forEach((group: any) => {
          const inputColumns = Array.isArray(group.inputColumns) ? group.inputColumns : []
          const values = inputColumns
            .map((column: string) => toFiniteNumber(row[column]))
            .filter((value: number | null): value is number => value !== null)

          nextRow[group.targetFactorName || 'factor_combined'] = summarizeValues(
            values,
            group.method || 'mean',
          )
        })
        return nextRow
      })

      return createTableResult(markRaw(resultData), {
        meta: {
          stats: {
            mode: 'row_combine',
            originalCount: rawData.length,
            outputCount: resultData.length,
            taskCount: groups.length,
          },
        },
      })
    }

    if (config.mode === 'group_by') {
      const groupKey = typeof config.groupByField === 'string' ? config.groupByField : ''
      if (!groupKey || !allFields.includes(groupKey)) {
        throw new Error(`分组字段 "${groupKey}" 不存在`)
      }

      const groupedRows: Record<string, Array<Record<string, unknown>>> = {}
      rawData.forEach((row) => {
        const groupValue = String(row[groupKey] ?? '')
        groupedRows[groupValue] ??= []
        groupedRows[groupValue].push(row)
      })

      const methods: string[] =
        Array.isArray(config.groupByMethods) && config.groupByMethods.length > 0
        ? config.groupByMethods
        : ['mean']

      const resultData = Object.entries(groupedRows).map(([groupValue, rows]) => {
        const summary: Record<string, unknown> = {
          [groupKey]: groupValue,
          row_count: rows.length,
        }

        targetFields.forEach((field) => {
          if (field === groupKey) return
          const values = rows
            .map((row) => toFiniteNumber(row[field]))
            .filter((value: number | null): value is number => value !== null)

          methods.forEach((method: string) => {
            summary[`${field}_${method}`] = summarizeValues(values, method)
          })
        })

        return summary
      })

      return createTableResult(markRaw(resultData), {
        meta: {
          stats: {
            mode: 'group_by',
            originalCount: rawData.length,
            outputCount: resultData.length,
            groupCount: Object.keys(groupedRows).length,
          },
        },
      })
    }

    if (config.mode === 'rolling') {
      const windowSize = Math.max(1, Number(config.windowSize || 5))
      const method = typeof config.rollingMethod === 'string' ? config.rollingMethod : 'mean'

      const resultData = rawData.map((row, index) => {
        const nextRow = { ...row }
        targetFields.forEach((field) => {
          const start = Math.max(0, index - windowSize + 1)
          const values = rawData
            .slice(start, index + 1)
            .map((windowRow) => toFiniteNumber(windowRow[field]))
            .filter((value: number | null): value is number => value !== null)

          nextRow[`${field}_rolling_${windowSize}`] = summarizeValues(values, method)
        })
        return nextRow
      })

      return createTableResult(markRaw(resultData), {
        meta: {
          stats: {
            mode: 'rolling',
            originalCount: rawData.length,
            outputCount: resultData.length,
            windowSize,
            method,
          },
        },
      })
    }

    if (config.mode === 'time_window') {
      const timeField = typeof config.timeField === 'string' ? config.timeField : ''
      if (!timeField || !allFields.includes(timeField)) {
        throw new Error(`时间字段 "${timeField}" 不存在`)
      }

      const windowSize = Math.max(1, Number(config.timeWindowSize || 1))
      const windowUnit = typeof config.timeWindowUnit === 'string' ? config.timeWindowUnit : 'hour'
      const methods: string[] =
        Array.isArray(config.timeWindowMethods) && config.timeWindowMethods.length > 0
          ? config.timeWindowMethods
          : ['mean']

      const windowMs = windowSize * getWindowUnitMs(windowUnit)
      const bucketMap = new Map<
        number,
        {
          start: number
          end: number
          rows: Array<Record<string, unknown>>
        }
      >()

      rawData.forEach((row) => {
        const timestamp = toDate(row[timeField])?.getTime()
        if (timestamp === undefined || timestamp === null || Number.isNaN(timestamp)) {
          return
        }

        const bucketStart = Math.floor(timestamp / windowMs) * windowMs
        const currentBucket = bucketMap.get(bucketStart) ?? {
          start: bucketStart,
          end: bucketStart + windowMs,
          rows: [],
        }
        currentBucket.rows.push(row)
        bucketMap.set(bucketStart, currentBucket)
      })

      const resultData = Array.from(bucketMap.values())
        .sort((left, right) => left.start - right.start)
        .map((bucket) => {
          const summary: Record<string, unknown> = {
            window_start: new Date(bucket.start).toISOString(),
            window_end: new Date(bucket.end).toISOString(),
            row_count: bucket.rows.length,
          }

          targetFields.forEach((field) => {
            if (field === timeField) return
            const values = bucket.rows
              .map((row) => toFiniteNumber(row[field]))
              .filter((value: number | null): value is number => value !== null)

            methods.forEach((method) => {
              summary[`${field}_${method}`] = summarizeValues(values, method)
            })
          })

          return summary
        })

      return createTableResult(markRaw(resultData), {
        meta: {
          stats: {
            mode: 'time_window',
            originalCount: rawData.length,
            outputCount: resultData.length,
            windowCount: resultData.length,
            timeField,
            windowSize,
            windowUnit,
          },
        },
      })
    }

    return createTableResult(markRaw(rawData), {
      meta: {
        stats: {
          mode: 'passthrough',
          originalCount: rawData.length,
          outputCount: rawData.length,
        },
      },
    })
  },
}
