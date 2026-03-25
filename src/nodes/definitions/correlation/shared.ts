import type { NodeDefinition, NodeProperty } from '../../types'
import { createReportResult, extractTableRows } from '../../result'

type NumericRow = Record<string, number | null>

type PairStats = {
  correlation: number
  sampleSize: number
}

type PairDetail = {
  xField: string
  yField: string
  correlation: number
  sampleSize: number
  pValue: number | null
}

type CorrelationMetrics = {
  numericFieldCount: number
  rowCount: number
  xFields: string[]
  yFields: string[]
  xFieldCount: number
  yFieldCount: number
  significantRelationCount: number
  strongRelationCount: number
}

type CorrelationMethodMeta = {
  name: string
  displayName: string
  description: string
  reportTitle: string
  chartSeriesName: string
  axisName: string
}

export type CorrelationMethod = 'pearson' | 'spearman' | 'kendall'

const EPSILON = 1e-12

const methodMeta: Record<CorrelationMethod, CorrelationMethodMeta> = {
  pearson: {
    name: 'pearson',
    displayName: 'Pearson 相关系数',
    description: '计算数值字段之间以及目标变量与因子之间的 Pearson 相关性，并给出显著性摘要。',
    reportTitle: 'Pearson 相关系数矩阵分析',
    chartSeriesName: 'Pearson r',
    axisName: 'Pearson r',
  },
  spearman: {
    name: 'spearman',
    displayName: 'Spearman 秩相关系数',
    description: '计算数值字段之间以及目标变量与因子之间的 Spearman 秩相关性，并给出显著性摘要。',
    reportTitle: 'Spearman 秩相关矩阵分析',
    chartSeriesName: 'Spearman ρ',
    axisName: 'Spearman ρ',
  },
  kendall: {
    name: 'kendall',
    displayName: 'Kendall 秩相关系数',
    description: '计算数值字段之间以及目标变量与因子之间的 Kendall 秩相关性，并给出显著性摘要。',
    reportTitle: 'Kendall 秩相关矩阵分析',
    chartSeriesName: 'Kendall τ',
    axisName: 'Kendall τ',
  },
}

const commonProperties: NodeProperty[] = [
  {
    name: 'xFields',
    displayName: 'X 字段',
    type: 'multi-options',
    default: [],
    useUpstreamFactors: true,
    editable: true,
    required: true,
    description: '选择参与相关性计算的 X 字段集合，只计算这些字段与 Y 字段的交叉相关。',
  },
  {
    name: 'yFields',
    displayName: 'Y 字段',
    type: 'multi-options',
    default: [],
    useUpstreamFactors: true,
    editable: true,
    required: true,
    description: '选择参与相关性计算的 Y 字段集合，结果区的排行图可在这些字段间切换。',
  },
  {
    name: 'topN',
    displayName: '重点展示因子数',
    type: 'number',
    default: 8,
    description: '每个 Y 字段按相关绝对值排序后，展示前 N 个 X 字段。',
  },
]

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

const toFiniteNumber = (value: unknown): number | null => {
  if (isFiniteNumber(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length

const variance = (values: number[], avg: number) => {
  if (values.length <= 1) return 0
  return values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / (values.length - 1)
}

const rankValues = (values: number[]) => {
  const indexed = values.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value)
  const ranks = new Array<number>(values.length).fill(0)

  let start = 0
  while (start < indexed.length) {
    let end = start
    while (end + 1 < indexed.length && indexed[end + 1]!.value === indexed[start]!.value) {
      end += 1
    }

    const averageRank = (start + end + 2) / 2
    for (let cursor = start; cursor <= end; cursor += 1) {
      const item = indexed[cursor]
      if (item) ranks[item.index] = averageRank
    }

    start = end + 1
  }

  return ranks
}

const erf = (x: number) => {
  const sign = x < 0 ? -1 : 1
  const absX = Math.abs(x)
  const a1 = 0.254829592
  const a2 = -0.284496736
  const a3 = 1.421413741
  const a4 = -1.453152027
  const a5 = 1.061405429
  const p = 0.3275911
  const t = 1 / (1 + p * absX)
  const y =
    1 -
    (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX))

  return sign * y
}

const normalCdf = (value: number) => 0.5 * (1 + erf(value / Math.sqrt(2)))

const approximatePValue = (correlation: number, sampleSize: number) => {
  if (!Number.isFinite(correlation) || sampleSize < 4) return null

  const bounded = Math.min(1 - EPSILON, Math.max(-1 + EPSILON, correlation))
  const fisherZ = 0.5 * Math.log((1 + bounded) / (1 - bounded)) * Math.sqrt(sampleSize - 3)
  const tail = 1 - normalCdf(Math.abs(fisherZ))

  return Math.max(0, Math.min(1, tail * 2))
}

const formatPValue = (value: number | null) => {
  if (value === null) return '样本不足'
  if (value < 0.001) return '< 0.001'
  return value.toFixed(3)
}

const strengthLabel = (correlation: number) => {
  const absolute = Math.abs(correlation)
  if (absolute >= 0.8) return '极强'
  if (absolute >= 0.6) return '强'
  if (absolute >= 0.4) return '中等'
  if (absolute >= 0.2) return '较弱'
  return '很弱'
}

const directionLabel = (correlation: number) => {
  if (correlation > 0) return '正相关'
  if (correlation < 0) return '负相关'
  return '无明显关系'
}

const buildNumericDataset = (rows: Record<string, unknown>[]) => {
  const keys = Object.keys(rows[0] ?? {})
  const numericKeys = keys.filter((key) => rows.some((row) => toFiniteNumber(row[key]) !== null))

  const normalizedRows: NumericRow[] = rows.map((row) => {
    const normalized: NumericRow = {}
    numericKeys.forEach((key) => {
      normalized[key] = toFiniteNumber(row[key])
    })
    return normalized
  })

  return { numericKeys, normalizedRows }
}

const getPairSeries = (rows: NumericRow[], xKey: string, yKey: string) => {
  const xValues: number[] = []
  const yValues: number[] = []

  rows.forEach((row) => {
    const x = row[xKey]
    const y = row[yKey]
    if (x !== null && x !== undefined && y !== null && y !== undefined) {
      xValues.push(x)
      yValues.push(y)
    }
  })

  return { xValues, yValues }
}

const calculatePearson = (xValues: number[], yValues: number[]): PairStats => {
  const sampleSize = Math.min(xValues.length, yValues.length)
  if (sampleSize < 2) return { correlation: 0, sampleSize }

  const xMean = mean(xValues)
  const yMean = mean(yValues)
  const varianceX = variance(xValues, xMean)
  const varianceY = variance(yValues, yMean)

  if (varianceX === 0 || varianceY === 0) {
    return { correlation: 0, sampleSize }
  }

  const covariance =
    xValues.reduce((sum, xValue, index) => sum + (xValue - xMean) * ((yValues[index] ?? 0) - yMean), 0) /
    (sampleSize - 1)

  return {
    correlation: covariance / Math.sqrt(varianceX * varianceY),
    sampleSize,
  }
}

const calculateSpearman = (xValues: number[], yValues: number[]): PairStats => {
  const sampleSize = Math.min(xValues.length, yValues.length)
  if (sampleSize < 2) return { correlation: 0, sampleSize }

  return calculatePearson(rankValues(xValues), rankValues(yValues))
}

const comparePair = (a: number, b: number) => (a === b ? 0 : a > b ? 1 : -1)

const calculateKendall = (xValues: number[], yValues: number[]): PairStats => {
  const sampleSize = Math.min(xValues.length, yValues.length)
  if (sampleSize < 2) return { correlation: 0, sampleSize }

  let concordant = 0
  let discordant = 0
  let tiesX = 0
  let tiesY = 0

  for (let left = 0; left < sampleSize - 1; left += 1) {
    for (let right = left + 1; right < sampleSize; right += 1) {
      const xLeft = xValues[left]
      const xRight = xValues[right]
      const yLeft = yValues[left]
      const yRight = yValues[right]

      if (
        xLeft === undefined ||
        xRight === undefined ||
        yLeft === undefined ||
        yRight === undefined
      ) {
        continue
      }

      const dx = comparePair(xLeft, xRight)
      const dy = comparePair(yLeft, yRight)

      if (dx === 0 && dy === 0) continue
      if (dx === 0) {
        tiesX += 1
        continue
      }
      if (dy === 0) {
        tiesY += 1
        continue
      }

      if (dx === dy) {
        concordant += 1
      } else {
        discordant += 1
      }
    }
  }

  const denominator = Math.sqrt(
    (concordant + discordant + tiesX) * (concordant + discordant + tiesY),
  )

  return {
    correlation: denominator === 0 ? 0 : (concordant - discordant) / denominator,
    sampleSize,
  }
}

const calculateCorrelation = (
  method: CorrelationMethod,
  xValues: number[],
  yValues: number[],
): PairStats => {
  if (method === 'spearman') return calculateSpearman(xValues, yValues)
  if (method === 'kendall') return calculateKendall(xValues, yValues)
  return calculatePearson(xValues, yValues)
}

const createSummaryLines = (
  numericKeys: string[],
  rowCount: number,
  xFields: string[],
  yFields: string[],
  significantRelationCount: number,
  strongRelationCount: number,
  incompleteFieldCount: number,
  strongestByY: Array<{ yField: string; detail: PairDetail | null }>,
) => {
  const lines = [
    `本次共识别 ${numericKeys.length} 个数值字段，基于 ${rowCount} 行样本计算 X × Y 交叉相关矩阵。`,
    `本次纳入 ${xFields.length} 个 X 字段、${yFields.length} 个 Y 字段；显著相关（近似 p < 0.05）的字段对共 ${significantRelationCount} 个，强相关（|r| >= 0.60）的字段对共 ${strongRelationCount} 个。`,
    `数值字段缺失单元格共 ${incompleteFieldCount} 个；相关分析采用成对可用样本计算，不同字段对的样本量可能不同。`,
  ]

  strongestByY.forEach(({ yField, detail }) => {
    if (!detail) return
    lines.push(
      `Y 字段 "${yField}" 当前最强相关的 X 字段是 "${detail.xField}"，呈 ${directionLabel(detail.correlation)}，强度为 ${strengthLabel(detail.correlation)}（r=${detail.correlation.toFixed(3)}，近似 p ${formatPValue(detail.pValue)}）。`,
    )
  })

  return lines
}

const normalizeSelectedFields = (
  selected: unknown,
  numericKeys: string[],
) => {
  const rawFields = Array.isArray(selected)
    ? selected.filter((item): item is string => typeof item === 'string')
    : typeof selected === 'string'
      ? [selected]
      : []

  return rawFields.filter((field, index) => numericKeys.includes(field) && rawFields.indexOf(field) === index)
}

const buildRankingOption = (
  method: CorrelationMethodMeta,
  yField: string,
  rankingRows: Array<{
    field: string
    correlation: number
    sampleSize: number
    pValue: number | null
  }>,
) => ({
  tooltip: {
    trigger: 'axis',
    axisPointer: { type: 'shadow' },
    formatter: (params: Array<{ dataIndex: number }>) => {
      const index = params[0]?.dataIndex ?? 0
      const row = rankingRows[index]
      if (!row) return ''

      return [
        row.field,
        `r = ${row.correlation.toFixed(3)}`,
        `样本量 = ${row.sampleSize}`,
        `近似 p ${formatPValue(row.pValue)}`,
      ].join('<br/>')
    },
  },
  grid: { top: 20, left: 90, right: 20, bottom: 20, containLabel: true },
  xAxis: {
    type: 'value',
    min: -1,
    max: 1,
    name: method.axisName,
  },
  yAxis: {
    type: 'category',
    data: rankingRows.map((item) => item.field),
  },
  series: [
    {
      type: 'bar',
      data: rankingRows.map((item) => ({
        value: item.correlation,
        itemStyle: {
          color: item.correlation >= 0 ? '#2563eb' : '#ef4444',
        },
      })),
      label: {
        show: true,
        position: 'right',
        formatter: ({ value }: { value: number }) => value.toFixed(2),
        color: '#334155',
      },
    },
  ],
  metadata: {
    yField,
  },
})

export const executeCorrelationAnalysis = async (
  method: CorrelationMethod,
  input: unknown,
  config: Record<string, unknown>,
) => {
  const sourceRows = extractTableRows(input)
  if (!sourceRows || sourceRows.length === 0) {
    throw new Error('无可分析的输入数据')
  }

  const { numericKeys, normalizedRows } = buildNumericDataset(sourceRows)
  if (numericKeys.length < 2) {
    throw new Error('至少需要 2 个数值字段才能进行相关性分析')
  }

  const meta = methodMeta[method]
  const xFields = normalizeSelectedFields(config.xFields, numericKeys)
  const yFields = normalizeSelectedFields(config.yFields, numericKeys)
  if (xFields.length === 0) {
    throw new Error('至少需要选择 1 个有效的 X 字段')
  }
  if (yFields.length === 0) {
    throw new Error('至少需要选择 1 个有效的 Y 字段')
  }

  const matrixData: Array<[number, number, number]> = []
  const pairDetails: PairDetail[] = []

  xFields.forEach((xField, xIndex) => {
    yFields.forEach((yField, yIndex) => {
      const { xValues, yValues } = getPairSeries(normalizedRows, xField, yField)
      const stats = calculateCorrelation(method, xValues, yValues)
      const correlation = xField === yField ? 1 : stats.correlation
      const sampleSize = xField === yField ? xValues.length : stats.sampleSize
      const pValue = xField === yField ? 0 : approximatePValue(correlation, sampleSize)

      matrixData.push([xIndex, yIndex, Number(correlation.toFixed(4))])

      pairDetails.push({
        xField,
        yField,
        correlation: Number(correlation.toFixed(4)),
        sampleSize,
        pValue,
      })
    })
  })

  const topNValue = typeof config.topN === 'number' ? config.topN : Number(config.topN ?? 8)
  const topN = Math.max(3, Number.isFinite(topNValue) ? topNValue : 8)
  const rankingMap = Object.fromEntries(
    yFields.map((yField) => {
      const rankingRows = pairDetails
        .filter((item) => item.yField === yField && item.xField !== yField)
        .map((item) => ({
          field: item.xField,
          correlation: item.correlation,
          sampleSize: item.sampleSize,
          pValue: item.pValue,
        }))
        .sort((left, right) => Math.abs(right.correlation) - Math.abs(left.correlation))
        .slice(0, topN)

      return [yField, rankingRows]
    }),
  ) as Record<string, Array<{ field: string; correlation: number; sampleSize: number; pValue: number | null }>>

  const validPairs = pairDetails.filter((item) => item.sampleSize >= 4)
  const strongRelationCount = validPairs.filter((item) => Math.abs(item.correlation) >= 0.6).length
  const significantRelationCount = validPairs.filter(
    (item) => item.pValue !== null && item.pValue < 0.05,
  ).length
  const incompleteFieldCount = normalizedRows.reduce((count, row) => {
    const relatedKeys = [...new Set([...xFields, ...yFields])]
    return count + relatedKeys.filter((key) => row[key] === null).length
  }, 0)

  const strongestByY = yFields.map((yField) => ({
    yField,
    detail:
      pairDetails
        .filter((item) => item.yField === yField && item.xField !== yField)
        .sort((left, right) => Math.abs(right.correlation) - Math.abs(left.correlation))[0] ?? null,
  }))

  const summaryLines = createSummaryLines(
    numericKeys,
    normalizedRows.length,
    xFields,
    yFields,
    significantRelationCount,
    strongRelationCount,
    incompleteFieldCount,
    strongestByY,
  )

  const detailRows = yFields.flatMap((yField) =>
    (rankingMap[yField] ?? []).map((item) => ({
      Y字段: yField,
      X字段: item.field,
      相关系数: item.correlation,
      方向: directionLabel(item.correlation),
      强度: strengthLabel(item.correlation),
      样本量: item.sampleSize,
      显著性: formatPValue(item.pValue),
    })),
  )

  const heatmapOption = {
    tooltip: {
      position: 'top',
      formatter: (params: { data: [number, number, number] }) => {
        const [xIndex, yIndex, value] = params.data
        const xLabel = xFields[xIndex] ?? ''
        const yLabel = yFields[yIndex] ?? ''
        return `${yLabel} vs ${xLabel}<br/>r = ${value}`
      },
    },
    grid: { top: 72, left: 90, right: 20, bottom: 70 },
    xAxis: {
      type: 'category',
      data: xFields,
      axisLabel: { interval: 0, rotate: xFields.length > 8 ? 40 : 0 },
    },
    yAxis: {
      type: 'category',
      data: yFields,
    },
    visualMap: {
      min: -1,
      max: 1,
      calculable: true,
      orient: 'horizontal',
      left: 'center',
      top: 8,
      bottom: 'auto',
      inRange: {
        color: ['#0f172a', '#60a5fa', '#f8fafc', '#fca5a5', '#991b1b'],
      },
    },
    series: [
      {
        name: meta.chartSeriesName,
        type: 'heatmap',
        data: matrixData,
        label: {
          show: true,
          formatter: (params: { data: [number, number, number] }) => params.data[2].toFixed(2),
          color: '#0f172a',
          fontSize: 11,
        },
        emphasis: {
          itemStyle: {
            borderColor: '#2563eb',
            borderWidth: 1,
          },
        },
      },
    ],
  }

  const metrics: CorrelationMetrics = {
    numericFieldCount: numericKeys.length,
    rowCount: normalizedRows.length,
    xFields,
    yFields,
    xFieldCount: xFields.length,
    yFieldCount: yFields.length,
    significantRelationCount,
    strongRelationCount,
  }

  const defaultYField = yFields[0]!
  const rankingOptionMap = Object.fromEntries(
    yFields.map((yField) => [yField, buildRankingOption(meta, yField, rankingMap[yField] ?? [])]),
  )

  return createReportResult(
    {
      title: meta.reportTitle,
      metadata: {
        xFields,
        yFields,
        currentYField: defaultYField,
      },
      sections: [
        {
          title: '分析摘要',
          type: 'text',
          content: summaryLines.join('\n'),
        },
        {
          key: 'matrix',
          title: '相关性热力图',
          type: 'chart',
          option: heatmapOption,
        },
        {
          key: 'ranking',
          title: 'Y 字段相关性排行',
          type: 'chart',
          option: rankingOptionMap[defaultYField],
          optionMap: rankingOptionMap,
          controls: {
            select: {
              label: '当前 Y',
              modelKey: 'rankingYField',
              options: yFields,
            },
            labelTruncate: {
              label: '标签截断',
              modelKey: 'labelTruncateLength',
              defaultValue: 12,
            },
          },
        },
        {
          title: 'X / Y 字段相关明细',
          type: 'text',
          content: JSON.stringify(detailRows, null, 2),
        },
      ],
    },
    {
      meta: {
        sourceData: sourceRows,
        metrics,
        pairDetails,
        matrixData,
      },
    },
  )
}

export const createCorrelationNode = (method: CorrelationMethod): NodeDefinition => {
  const meta = methodMeta[method]

  return {
    name: meta.name,
    displayName: meta.displayName,
    icon: 'grid',
    category: 'terminal',
    description: meta.description,
    properties: commonProperties,
    execute: async (input, config) => executeCorrelationAnalysis(method, input, config),
  }
}
