import type { NodeDefinition } from '../types'
import { createReportResult, extractTableRows } from '../result'
import { calculateBoxValues } from '../../utils/stats'

type GroupSummary = {
  name: string
  count: number
  mean: number
  variance: number
  stdDev: number
}

type AnovaMetrics = {
  sampleCount: number
  groupCount: number
  targetField: string
  groupField: string
  fStatistic: number
  pValue: number
  etaSquared: number
}

type AnovaRisk = {
  code: 'small_groups' | 'imbalanced_groups'
  level: 'warning'
  title: string
  message: string
  groups?: string[]
}

const toFiniteNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length

const sampleVariance = (values: number[], avg: number) => {
  if (values.length <= 1) return 0
  return values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / (values.length - 1)
}

const logGamma = (value: number): number => {
  const coefficients = [
    676.5203681218851,
    -1259.1392167224028,
    771.3234287776531,
    -176.6150291621406,
    12.507343278686905,
    -0.13857109526572012,
    9.984369578019572e-6,
    1.5056327351493116e-7,
  ]

  if (value < 0.5) {
    return Math.log(Math.PI) - Math.log(Math.sin(Math.PI * value)) - logGamma(1 - value)
  }

  const nextValue = value - 1
  let accumulator = 0.9999999999998099
  coefficients.forEach((coefficient, index) => {
    accumulator += coefficient / (nextValue + index + 1)
  })

  const shifted = nextValue + coefficients.length - 0.5
  return (
    0.5 * Math.log(2 * Math.PI) +
    (nextValue + 0.5) * Math.log(shifted) -
    shifted +
    Math.log(accumulator)
  )
}

const betaContinuedFraction = (x: number, a: number, b: number): number => {
  const maxIterations = 200
  const epsilon = 3e-7
  const fpMin = 1e-30

  const qab = a + b
  const qap = a + 1
  const qam = a - 1
  let c = 1
  let d = 1 - (qab * x) / qap
  if (Math.abs(d) < fpMin) d = fpMin
  d = 1 / d
  let h = d

  for (let iteration = 1; iteration <= maxIterations; iteration += 1) {
    const evenStep = iteration * 2
    let aa = (iteration * (b - iteration) * x) / ((qam + evenStep) * (a + evenStep))
    d = 1 + aa * d
    if (Math.abs(d) < fpMin) d = fpMin
    c = 1 + aa / c
    if (Math.abs(c) < fpMin) c = fpMin
    d = 1 / d
    h *= d * c

    aa = (-(a + iteration) * (qab + iteration) * x) / ((a + evenStep) * (qap + evenStep))
    d = 1 + aa * d
    if (Math.abs(d) < fpMin) d = fpMin
    c = 1 + aa / c
    if (Math.abs(c) < fpMin) c = fpMin
    d = 1 / d
    const delta = d * c
    h *= delta

    if (Math.abs(delta - 1) < epsilon) break
  }

  return h
}

const regularizedIncompleteBeta = (x: number, a: number, b: number): number => {
  if (x <= 0) return 0
  if (x >= 1) return 1

  const logBeta =
    logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x)
  const front = Math.exp(logBeta)

  if (x < (a + 1) / (a + b + 2)) {
    return (front * betaContinuedFraction(x, a, b)) / a
  }

  return 1 - (front * betaContinuedFraction(1 - x, b, a)) / b
}

const fDistributionSurvival = (fValue: number, d1: number, d2: number): number => {
  if (!Number.isFinite(fValue)) return 0
  if (fValue <= 0) return 1
  const x = (d1 * fValue) / (d1 * fValue + d2)
  return Math.max(0, Math.min(1, 1 - regularizedIncompleteBeta(x, d1 / 2, d2 / 2)))
}

const buildMeanChartOption = (groups: GroupSummary[]) => ({
  tooltip: {
    trigger: 'axis',
    axisPointer: { type: 'shadow' },
  },
  grid: { top: 24, left: 72, right: 20, bottom: 64, containLabel: true },
  xAxis: {
    type: 'category',
    data: groups.map((group) => group.name),
    axisLabel: {
      interval: 0,
      rotate: groups.length > 5 ? 20 : 0,
    },
  },
  yAxis: {
    type: 'value',
    name: '组均值',
  },
  series: [
    {
      name: '组均值',
      type: 'bar',
      data: groups.map((group) => Number(group.mean.toFixed(4))),
      itemStyle: {
        color: '#2563eb',
        borderRadius: [4, 4, 0, 0],
      },
      label: {
        show: true,
        position: 'top',
        formatter: ({ value }: { value: number }) => value.toFixed(2),
        color: '#334155',
      },
    },
  ],
})

const buildBoxplotChartOption = (rows: Array<Record<string, unknown>>, groupField: string, targetField: string, groups: GroupSummary[]) => ({
  tooltip: {
    trigger: 'item',
  },
  grid: { top: 24, left: 72, right: 20, bottom: 64, containLabel: true },
  xAxis: {
    type: 'category',
    data: groups.map((group) => group.name),
    axisLabel: {
      interval: 0,
      rotate: groups.length > 5 ? 20 : 0,
    },
  },
  yAxis: {
    type: 'value',
    name: targetField,
    scale: true,
  },
  series: [
    {
      name: '分布箱线图',
      type: 'boxplot',
      data: groups.map((group) =>
        calculateBoxValues(
          rows.filter((row) => String(row[groupField]) === group.name),
          targetField,
        ),
      ),
    },
  ],
})

const buildRisks = (groups: GroupSummary[]) => {
  const risks: AnovaRisk[] = []
  const smallGroups = groups.filter((group) => group.count < 5).map((group) => group.name)
  const counts = groups.map((group) => group.count)
  const maxCount = Math.max(...counts)
  const minCount = Math.min(...counts)

  if (smallGroups.length > 0) {
    risks.push({
      code: 'small_groups',
      level: 'warning',
      title: '部分分组样本偏少',
      message: `分组 ${smallGroups.join('、')} 的样本量低于 5，方差分析结果可能更容易受极端值影响。`,
      groups: smallGroups,
    })
  }

  if (minCount > 0 && maxCount / minCount >= 3) {
    risks.push({
      code: 'imbalanced_groups',
      level: 'warning',
      title: '分组样本量不均衡',
      message: `当前最大组与最小组样本量相差 ${(maxCount / minCount).toFixed(1)} 倍，建议结合箱线图一起判断结论稳定性。`,
      groups: groups.map((group) => group.name),
    })
  }

  return risks
}

export const anovaNode: NodeDefinition = {
  name: 'anova',
  displayName: '方差分析',
  icon: 'split',
  category: 'terminal',
  description: '对数值目标字段执行单因素方差分析，判断不同分组之间均值差异是否显著。',
  properties: [
    {
      name: 'targetField',
      displayName: '目标字段',
      type: 'options',
      default: '',
      useUpstreamFactors: true,
      editable: true,
      description: '选择要比较组间均值差异的数值字段。',
    },
    {
      name: 'groupField',
      displayName: '分组字段',
      type: 'options',
      default: '',
      useUpstreamFactors: true,
      editable: true,
      description: '选择用于分组的字段，通常是类别、批次、工艺段或实验条件。',
    },
  ],
  execute: async (input, config) => {
    const rows = extractTableRows(input)
    if (!rows || rows.length === 0) {
      throw new Error('无可分析的输入数据')
    }

    const allKeys = [...new Set(rows.flatMap((row) => Object.keys(row)))]
    const targetField = typeof config.targetField === 'string' ? config.targetField.trim() : ''
    const groupField = typeof config.groupField === 'string' ? config.groupField.trim() : ''

    if (!targetField || !groupField) {
      throw new Error('请先选择目标字段和分组字段')
    }
    if (!allKeys.includes(targetField)) {
      throw new Error(`目标字段不存在：${targetField}`)
    }
    if (!allKeys.includes(groupField)) {
      throw new Error(`分组字段不存在：${groupField}`)
    }
    if (targetField === groupField) {
      throw new Error('目标字段和分组字段不能相同')
    }

    const availableRows = rows
      .map((row) => ({
        ...row,
        __target: toFiniteNumber(row[targetField]),
        __group: row[groupField],
      }))
      .filter(
        (row) =>
          row.__target !== null &&
          row.__group !== null &&
          row.__group !== undefined &&
          String(row.__group).trim() !== '',
      )

    if (availableRows.length < 5) {
      throw new Error('有效样本不足，无法完成方差分析')
    }

    const groupedValues = new Map<string, number[]>()
    availableRows.forEach((row) => {
      const groupName = String(row.__group)
      const existing = groupedValues.get(groupName) ?? []
      existing.push(row.__target as number)
      groupedValues.set(groupName, existing)
    })

    const groups = [...groupedValues.entries()]
      .map(([name, values]) => {
        const avg = mean(values)
        const variance = sampleVariance(values, avg)
        return {
          name,
          count: values.length,
          mean: avg,
          variance,
          stdDev: Math.sqrt(variance),
        } satisfies GroupSummary
      })
      .filter((group) => group.count >= 2)
      .sort((left, right) => right.mean - left.mean)

    if (groups.length < 2) {
      throw new Error('至少需要 2 个有效分组且每组至少 2 条样本才能进行方差分析')
    }

    const totalSampleCount = groups.reduce((sum, group) => sum + group.count, 0)
    if (totalSampleCount - groups.length <= 0) {
      throw new Error('组内自由度不足，无法完成方差分析')
    }

    const overallMean =
      groups.reduce((sum, group) => sum + group.mean * group.count, 0) / totalSampleCount
    const betweenSumSquares = groups.reduce(
      (sum, group) => sum + group.count * (group.mean - overallMean) ** 2,
      0,
    )
    const withinSumSquares = groups.reduce(
      (sum, group) => sum + (group.count - 1) * group.variance,
      0,
    )
    const totalSumSquares = betweenSumSquares + withinSumSquares

    const dfBetween = groups.length - 1
    const dfWithin = totalSampleCount - groups.length
    const meanSquareBetween = betweenSumSquares / dfBetween
    const meanSquareWithin = withinSumSquares / dfWithin
    const fStatistic =
      meanSquareWithin <= 1e-12
        ? betweenSumSquares > 1e-12
          ? Number.POSITIVE_INFINITY
          : 0
        : meanSquareBetween / meanSquareWithin
    const pValue = fDistributionSurvival(fStatistic, dfBetween, dfWithin)
    const etaSquared = totalSumSquares <= 1e-12 ? 0 : betweenSumSquares / totalSumSquares
    const risks = buildRisks(groups)

    const metrics: AnovaMetrics = {
      sampleCount: totalSampleCount,
      groupCount: groups.length,
      targetField,
      groupField,
      fStatistic: Number.isFinite(fStatistic) ? Number(fStatistic.toFixed(6)) : Number.POSITIVE_INFINITY,
      pValue: Number(pValue.toFixed(6)),
      etaSquared: Number(etaSquared.toFixed(6)),
    }

    return createReportResult(
      {
        title: '单因素方差分析',
        metadata: metrics,
        sections: [
          {
            key: 'summary',
            type: 'summary',
            title: '分析摘要',
            cards: [
              { label: '目标字段', value: targetField },
              { label: '分组字段', value: groupField },
              { label: '有效样本量', value: totalSampleCount },
              { label: '有效分组数', value: groups.length },
              {
                label: 'F 值',
                value: Number.isFinite(fStatistic) ? Number(fStatistic.toFixed(4)) : '∞',
              },
              { label: 'P 值', value: Number(pValue.toFixed(4)) },
              { label: '效应量 η²', value: Number(etaSquared.toFixed(4)) },
            ],
            content:
              pValue < 0.05
                ? `当前结果显示不同 ${groupField} 分组在 ${targetField} 上存在显著均值差异（p < 0.05），建议继续结合组均值和箱线图判断差异方向与业务意义。`
                : `当前结果未显示不同 ${groupField} 分组在 ${targetField} 上存在显著均值差异（p ≥ 0.05），建议结合样本量和分布形态继续判断是否需要分组重构。`,
            help: {
              summary: '判断不同分组在目标数值字段上的均值是否存在显著差异。',
              howToRead: ['先看 P 值是否低于阈值，再结合 F 值、效应量和分组样本量判断差异是否有业务意义。'],
              cautions: ['显著差异不说明哪个分组最佳，也不直接证明分组字段导致了目标变化。'],
            },
          },
          {
            key: 'group-means',
            type: 'chart',
            title: '分组均值对比',
            option: buildMeanChartOption(groups),
            help: {
              summary: '对比各分组目标字段的平均水平，帮助判断差异方向。',
              howToRead: ['均值高低展示分组中心差异，需结合箱线图确认分布重叠和离散程度。'],
            },
          },
          {
            key: 'distribution',
            type: 'chart',
            title: '分组分布箱线图',
            option: buildBoxplotChartOption(
              availableRows.map((row) => ({
                [groupField]: row.__group,
                [targetField]: row.__target,
              })),
              groupField,
              targetField,
              groups,
            ),
            help: {
              summary: '展示各分组目标字段的分布、中位数、离散程度和异常点。',
              howToRead: ['看箱体位置、宽度和离群点；箱体重叠严重时，即使均值不同也需谨慎解读。'],
            },
          },
          {
            key: 'risks',
            type: 'risk-list',
            title: '结果可信提示',
            items: risks,
            help: {
              summary: '提示样本量、分组不均衡或方差差异等可能影响方差分析可信度的问题。',
              howToRead: ['优先处理样本过少或分组极不均衡的问题，再采纳显著性结论。'],
            },
          },
          {
            key: 'details',
            type: 'text',
            title: '分组明细',
            content: JSON.stringify(
              groups.map((group) => ({
                分组: group.name,
                样本量: group.count,
                均值: Number(group.mean.toFixed(4)),
                标准差: Number(group.stdDev.toFixed(4)),
                方差: Number(group.variance.toFixed(4)),
              })),
              null,
              2,
            ),
            help: {
              summary: '列出每个分组的样本量、均值和离散统计量，便于复核。',
              howToRead: ['重点比较样本量、均值、标准差和方差，识别不稳定分组。'],
            },
          },
        ],
      },
      {
        meta: {
          metrics,
          groups,
          risks,
        },
      },
    )
  },
}
