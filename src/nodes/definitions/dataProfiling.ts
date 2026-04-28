import { markRaw } from 'vue'
import type { NodeDefinition } from '../types'
import { createReportResult, extractTableRows } from '../result'

type FieldType = 'numeric' | 'categorical' | 'datetime' | 'empty'
type RiskLevel = 'high' | 'medium' | 'low'
type TargetFieldUsability = 'regression' | 'classification' | 'unusable' | 'unknown'

type FieldProfile = {
  field: string
  type: FieldType
  riskLevel: RiskLevel
  nonNullCount: number
  missingCount: number
  missingRate: number
  uniqueCount: number
  uniqueRate: number
  sampleValues: string[]
  min?: number
  max?: number
  mean?: number
  std?: number
  zeroRate?: number
  outlierCount?: number
  outlierRate?: number
  suggestions: string[]
}

const isFiniteNumber = (value: unknown): value is number => {
  return typeof value === 'number' && Number.isFinite(value)
}

const toNumber = (value: unknown) => {
  if (isFiniteNumber(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

const isDateLike = (value: unknown) => {
  if (typeof value !== 'string' || value.trim() === '') return false
  return Number.isFinite(Date.parse(value))
}

const classifyField = (values: unknown[]): FieldType => {
  const presentValues = values.filter((value) => value !== null && value !== undefined && value !== '')
  if (presentValues.length === 0) return 'empty'

  const numericCount = presentValues.filter((value) => toNumber(value) !== null).length
  const datetimeCount = presentValues.filter((value) => isDateLike(value)).length

  if (numericCount / presentValues.length >= 0.8) return 'numeric'
  if (datetimeCount / presentValues.length >= 0.8) return 'datetime'
  return 'categorical'
}

const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length

const std = (values: number[], avg: number) => {
  if (values.length <= 1) return 0
  const variance =
    values.reduce((sum, value) => sum + Math.pow(value - avg, 2), 0) / (values.length - 1)
  return Math.sqrt(variance)
}

const quantile = (sortedValues: number[], ratio: number) => {
  if (sortedValues.length === 0) return 0
  const index = (sortedValues.length - 1) * ratio
  const lower = Math.floor(index)
  const upper = Math.ceil(index)
  const lowerValue = sortedValues[lower] ?? sortedValues[sortedValues.length - 1] ?? 0
  const upperValue = sortedValues[upper] ?? sortedValues[sortedValues.length - 1] ?? 0
  if (lower === upper) return lowerValue
  return lowerValue + (upperValue - lowerValue) * (index - lower)
}

const calculateOutlierStats = (values: number[]) => {
  if (values.length < 4) return { outlierCount: 0, outlierRate: 0 }

  const sorted = [...values].sort((a, b) => a - b)
  const q1 = quantile(sorted, 0.25)
  const q3 = quantile(sorted, 0.75)
  const iqr = q3 - q1
  if (iqr === 0) return { outlierCount: 0, outlierRate: 0 }

  const lowerBound = q1 - 1.5 * iqr
  const upperBound = q3 + 1.5 * iqr
  const outlierCount = values.filter((value) => value < lowerBound || value > upperBound).length

  return {
    outlierCount,
    outlierRate: values.length === 0 ? 0 : outlierCount / values.length,
  }
}

const getTargetFieldUsability = (
  targetField: string,
  fieldProfiles: FieldProfile[],
): TargetFieldUsability => {
  if (!targetField) return 'unknown'
  const profile = fieldProfiles.find((item) => item.field === targetField)
  if (!profile || profile.nonNullCount === 0) return 'unusable'

  if (profile.type === 'numeric') return 'regression'
  if (profile.type === 'categorical') return 'classification'
  return 'unusable'
}

const riskLevelLabelMap: Record<RiskLevel, string> = {
  high: '高',
  medium: '中',
  low: '低',
}

const targetFieldUsabilityText: Record<Exclude<TargetFieldUsability, 'unknown'>, string> = {
  regression: '适合回归任务',
  classification: '适合分类任务',
  unusable: '暂不适合直接建模',
}

const getRiskLevel = (profile: Omit<FieldProfile, 'riskLevel' | 'suggestions'>) => {
  const isIdLike =
    profile.field.toLowerCase().includes('id') ||
    /(^|_)(sn|code|编号|序列号)/i.test(profile.field)

  if (
    profile.missingRate >= 0.3 ||
    profile.uniqueCount === 1 ||
    (profile.outlierRate ?? 0) >= 0.2 ||
    isIdLike
  ) {
    return 'high' satisfies RiskLevel
  }

  if (
    profile.missingRate >= 0.1 ||
    (profile.outlierRate ?? 0) >= 0.05 ||
    (profile.zeroRate ?? 0) >= 0.8 ||
    profile.type === 'datetime'
  ) {
    return 'medium' satisfies RiskLevel
  }

  return 'low' satisfies RiskLevel
}

const buildSuggestions = (
  profile: Omit<FieldProfile, 'suggestions' | 'riskLevel'>,
  totalRows: number,
  targetField: string,
) => {
  const suggestions: string[] = []

  if (profile.field === targetField && profile.missingCount > 0) {
    suggestions.push('目标字段存在缺失，正式分析前应先处理或过滤。')
  }

  if (profile.missingRate >= 0.3) {
    suggestions.push('缺失率较高，建议确认采集逻辑或先制定缺失值处理策略。')
  }

  if (profile.uniqueCount === 1 && profile.nonNullCount > 0) {
    suggestions.push('字段为常量列，对相关性和建模基本没有贡献，可考虑剔除。')
  }

  if (profile.type === 'categorical' && profile.uniqueRate > 0.9 && totalRows >= 20) {
    suggestions.push('高基数字段，可能是 ID/流水号 类字段，不建议直接参与相关性分析。')
  }

  if (profile.type === 'datetime') {
    suggestions.push('时间字段建议先派生窗口、周期或滞后特征，再进入相关分析。')
  }

  if ((profile.outlierRate ?? 0) >= 0.05) {
    suggestions.push('字段存在异常值，建议在建模前确认业务含义或执行异常值处理。')
  }

  if ((profile.zeroRate ?? 0) >= 0.8) {
    suggestions.push('零值占比较高，建议确认业务含义，避免稀疏列误导结果。')
  }

  if (
    profile.field.toLowerCase().includes('id') ||
    /(^|_)(sn|code|编号|序列号)/i.test(profile.field)
  ) {
    suggestions.push('字段名称疑似标识符，通常应排除在因子分析之外。')
  }

  if (suggestions.length === 0) {
    suggestions.push('字段质量基本可用，可继续进入清洗或相关性分析。')
  }

  return suggestions
}

const stableSerializeRow = (row: Record<string, unknown>) => {
  const keys = Object.keys(row).sort()
  const normalized = keys.map((key) => [key, row[key] ?? null])
  return JSON.stringify(normalized)
}

export const dataProfilingNode: NodeDefinition = {
  name: 'data-profiling',
  displayName: '数据体检',
  isLegacy: true,
  icon: 'scan-search',
  category: 'action',
  description: '在分析前自动识别字段类型、缺失风险、常量列和疑似 ID 字段，生成数据画像报告。',
  properties: [
    {
      name: 'targetField',
      displayName: '目标变量',
      type: 'options',
      default: '',
      useUpstreamFactors: true,
      editable: true,
      description: '可选。填写后会重点提示目标字段质量，并优先展示与目标分析相关的建议。',
    },
    {
      name: 'topFields',
      displayName: '重点展示字段数',
      type: 'number',
      default: 10,
      description: '按缺失率和风险优先级展示前 N 个字段。',
    },
  ],
  execute: async (input, config) => {
    const inputRows = extractTableRows(input)
    if (!inputRows || inputRows.length === 0) {
      throw new Error('无可体检的数据')
    }

    const rows = inputRows.filter((row: unknown) => row && typeof row === 'object') as Record<
      string,
      unknown
    >[]
    if (rows.length === 0) {
      throw new Error('输入数据格式不正确')
    }

    const fieldSet = new Set<string>()
    rows.forEach((row) => Object.keys(row).forEach((key) => fieldSet.add(key)))
    const fields = Array.from(fieldSet)
    const totalRows = rows.length
    const targetField = typeof config.targetField === 'string' ? config.targetField : ''

    const fieldProfiles: FieldProfile[] = fields.map((field) => {
      const values = rows.map((row) => row[field])
      const type = classifyField(values)
      const nonNullValues = values.filter((value) => value !== null && value !== undefined && value !== '')
      const missingCount = totalRows - nonNullValues.length
      const uniqueValues = Array.from(new Set(nonNullValues.map((value) => String(value))))
      const numericValues = nonNullValues.map(toNumber).filter((value): value is number => value !== null)
      const outlierStats = type === 'numeric' ? calculateOutlierStats(numericValues) : { outlierCount: 0, outlierRate: 0 }

      const baseProfile: Omit<FieldProfile, 'suggestions' | 'riskLevel'> = {
        field,
        type,
        nonNullCount: nonNullValues.length,
        missingCount,
        missingRate: totalRows === 0 ? 0 : missingCount / totalRows,
        uniqueCount: uniqueValues.length,
        uniqueRate: nonNullValues.length === 0 ? 0 : uniqueValues.length / nonNullValues.length,
        sampleValues: uniqueValues.slice(0, 3),
        outlierCount: outlierStats.outlierCount,
        outlierRate: outlierStats.outlierRate,
      }

      if (type === 'numeric' && numericValues.length > 0) {
        const avg = mean(numericValues)
        baseProfile.min = Math.min(...numericValues)
        baseProfile.max = Math.max(...numericValues)
        baseProfile.mean = avg
        baseProfile.std = std(numericValues, avg)
        baseProfile.zeroRate = numericValues.filter((value) => value === 0).length / numericValues.length
      }

      return {
        ...baseProfile,
        riskLevel: getRiskLevel(baseProfile),
        suggestions: buildSuggestions(baseProfile, totalRows, targetField),
      }
    })

    const numericFields = fieldProfiles.filter((profile) => profile.type === 'numeric')
    const categoricalFields = fieldProfiles.filter((profile) => profile.type === 'categorical')
    const datetimeFields = fieldProfiles.filter((profile) => profile.type === 'datetime')
    const emptyFields = fieldProfiles.filter((profile) => profile.type === 'empty')
    const constantFields = fieldProfiles.filter(
      (profile) => profile.nonNullCount > 0 && profile.uniqueCount === 1,
    )
    const riskFields = fieldProfiles
      .filter((profile) => profile.riskLevel !== 'low')
      .sort((left, right) => {
        const riskWeight = { high: 2, medium: 1, low: 0 }
        return (
          riskWeight[right.riskLevel] - riskWeight[left.riskLevel] ||
          right.missingRate - left.missingRate ||
          (right.outlierRate ?? 0) - (left.outlierRate ?? 0)
        )
      })

    const rowSnapshots = rows.map(stableSerializeRow)
    const duplicateRowCount = Math.max(0, rowSnapshots.length - new Set(rowSnapshots).size)
    const duplicateRowRate = totalRows === 0 ? 0 : duplicateRowCount / totalRows
    const targetFieldUsability = getTargetFieldUsability(targetField, fieldProfiles)

    const topFields = Math.max(5, Number(config.topFields || 10))
    const focusFields = [...riskFields, ...fieldProfiles]
      .filter((profile, index, array) => array.findIndex((item) => item.field === profile.field) === index)
      .slice(0, topFields)

    const summaryLines = [
      `本次体检覆盖 ${fields.length} 个字段、${totalRows} 行数据。`,
      `字段类型识别结果：数值字段 ${numericFields.length} 个，类别字段 ${categoricalFields.length} 个，时间字段 ${datetimeFields.length} 个，空字段 ${emptyFields.length} 个。`,
      `高风险字段 ${fieldProfiles.filter((item) => item.riskLevel === 'high').length} 个，中风险字段 ${fieldProfiles.filter((item) => item.riskLevel === 'medium').length} 个，常量列 ${constantFields.length} 个，重复样本 ${duplicateRowCount} 行（${(duplicateRowRate * 100).toFixed(1)}%）。`,
    ]

    if (targetField) {
      const usabilityText =
        targetFieldUsability === 'unknown'
          ? '暂未识别'
          : targetFieldUsabilityText[targetFieldUsability]
      summaryLines.push(`目标字段“${targetField}”${usabilityText}。`)
    } else {
      summaryLines.push('当前未指定目标字段。')
    }

    if (riskFields[0]) {
      summaryLines.push(
        `当前最优先处理的字段是“${riskFields[0].field}”，主要原因：${riskFields[0].suggestions[0]}`,
      )
    }

    const missingRateOption = {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      grid: { top: '15%', left: 100, right: '10%', bottom: '15%', containLabel: true },
      xAxis: {
        type: 'value',
        min: 0,
        max: 1,
        boundaryGap: ['0%', '15%'],
        axisLabel: {
          formatter: (value: number) => `${Math.round(value * 100)}%`,
        },
      },
      yAxis: {
        type: 'category',
        data: focusFields.map((profile) => profile.field),
      },
      series: [
        {
          type: 'bar',
          data: focusFields.map((profile) => ({
            value: Number(profile.missingRate.toFixed(4)),
            itemStyle: {
              color:
                profile.riskLevel === 'high'
                  ? '#ef4444'
                  : profile.riskLevel === 'medium'
                    ? '#f59e0b'
                    : '#2563eb',
            },
          })),
          label: {
            show: true,
            position: 'right',
            formatter: ({ value }: { value: number }) => `${(value * 100).toFixed(1)}%`,
            color: '#334155',
          },
        },
      ],
    }

    const typeDistributionOption = {
      tooltip: { trigger: 'item' },
      legend: { bottom: '5%' },
      series: [
        {
          type: 'pie',
          radius: ['40%', '68%'],
          center: ['50%', '45%'],
          data: [
            { name: '数值字段', value: numericFields.length, itemStyle: { color: '#2563eb' } },
            { name: '类别字段', value: categoricalFields.length, itemStyle: { color: '#0f766e' } },
            { name: '时间字段', value: datetimeFields.length, itemStyle: { color: '#f59e0b' } },
            { name: '空字段', value: emptyFields.length, itemStyle: { color: '#94a3b8' } },
          ],
          label: {
            formatter: '{b}\n{c}',
          },
        },
      ],
    }

    const focusRows = focusFields.map((profile) => ({
      字段: profile.field,
      类型:
        profile.type === 'numeric'
          ? '数值'
          : profile.type === 'categorical'
            ? '类别'
            : profile.type === 'datetime'
              ? '时间'
              : '空字段',
      风险等级: riskLevelLabelMap[profile.riskLevel],
      缺失率: `${(profile.missingRate * 100).toFixed(1)}%`,
      异常值占比: `${((profile.outlierRate ?? 0) * 100).toFixed(1)}%`,
      唯一值数: profile.uniqueCount,
      示例值: profile.sampleValues.join(', ') || '-',
      建议: profile.suggestions.join('；'),
    }))

    return createReportResult(
      {
        title: '数据体检与字段画像',
        sections: [
          {
            type: 'text',
            content: summaryLines.join('\n'),
          },
          {
            title: '重点字段缺失率',
            type: 'chart',
            option: missingRateOption,
          },
          {
            title: '字段类型分布',
            type: 'chart',
            option: typeDistributionOption,
          },
          {
            title: '重点字段建议',
            type: 'text',
            content: JSON.stringify(focusRows, null, 2),
          },
        ],
      },
      {
        meta: {
          sourceData: markRaw(rows),
          profile: markRaw(fieldProfiles),
          metrics: {
            rowCount: totalRows,
            fieldCount: fields.length,
            numericFieldCount: numericFields.length,
            categoricalFieldCount: categoricalFields.length,
            datetimeFieldCount: datetimeFields.length,
            riskFieldCount: riskFields.length,
            constantFieldCount: constantFields.length,
            duplicateRowCount,
            duplicateRowRate,
            targetFieldUsability,
          },
        },
      },
    )
  },
}
