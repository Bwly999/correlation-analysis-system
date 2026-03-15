import type { NodeDefinition } from '../types'

type NumericRow = Record<string, number | null>

const EPSILON = 1e-12

const isFiniteNumber = (value: unknown): value is number => {
  return typeof value === 'number' && Number.isFinite(value)
}

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
  const ranks = new Array(values.length).fill(0)

  let i = 0
  while (i < indexed.length) {
    let j = i
    while (j + 1 < indexed.length && indexed[j + 1].value === indexed[i].value) j++
    const avgRank = (i + j + 2) / 2
    for (let k = i; k <= j; k++) {
      ranks[indexed[k].index] = avgRank
    }
    i = j + 1
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
  const abs = Math.abs(correlation)
  if (abs >= 0.8) return '极强'
  if (abs >= 0.6) return '强'
  if (abs >= 0.4) return '中等'
  if (abs >= 0.2) return '较弱'
  return '很弱'
}

const directionLabel = (correlation: number) => {
  if (correlation > 0) return '正相关'
  if (correlation < 0) return '负相关'
  return '无明显线性关系'
}

const buildNumericDataset = (rows: Record<string, unknown>[]) => {
  const keys = Object.keys(rows[0] || {})
  const numericKeys = keys.filter((key) =>
    rows.some((row) => {
      const value = toFiniteNumber(row[key])
      return value !== null
    }),
  )

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
    if (x !== null && y !== null) {
      xValues.push(x)
      yValues.push(y)
    }
  })

  return { xValues, yValues }
}

const calculatePearson = (xValues: number[], yValues: number[]) => {
  const sampleSize = Math.min(xValues.length, yValues.length)
  if (sampleSize < 2) return { correlation: 0, sampleSize, varianceX: 0, varianceY: 0 }

  const xMean = mean(xValues)
  const yMean = mean(yValues)
  const varianceX = variance(xValues, xMean)
  const varianceY = variance(yValues, yMean)

  if (varianceX === 0 || varianceY === 0) {
    return { correlation: 0, sampleSize, varianceX, varianceY }
  }

  const covariance =
    xValues.reduce((sum, xValue, index) => sum + (xValue - xMean) * (yValues[index] - yMean), 0) /
    (sampleSize - 1)

  return {
    correlation: covariance / Math.sqrt(varianceX * varianceY),
    sampleSize,
    varianceX,
    varianceY,
  }
}

export const pearsonNode: NodeDefinition = {
  name: 'pearson',
  displayName: 'Pearson 相关系数',
  icon: 'grid',
  category: 'terminal',
  description: '计算数值字段之间及目标变量与因子之间的 Pearson 相关性，并输出显著性摘要。',
  properties: [
    {
      name: 'targetField',
      displayName: '目标变量 (Y)',
      type: 'options',
      default: 'target',
      useUpstreamFactors: true,
      editable: true,
      description: '用于重点排序和摘要解读的目标字段名。',
    },
    {
      name: 'topN',
      displayName: '重点展示因子数',
      type: 'number',
      default: 8,
      description: '按与目标变量的相关绝对值排序，展示前 N 个关键因子。',
    },
  ],
  execute: async (input, config) => {
    if (!input || !Array.isArray(input.data) || input.data.length === 0) {
      throw new Error('无可分析的输入数据')
    }

    const sourceRows = input.data.filter((row: unknown) => row && typeof row === 'object')
    if (sourceRows.length === 0) {
      throw new Error('输入数据格式不正确')
    }

    const { numericKeys, normalizedRows } = buildNumericDataset(sourceRows as Record<string, unknown>[])
    if (numericKeys.length < 2) {
      throw new Error('至少需要 2 个数值字段才能进行相关性分析')
    }

    const targetField = numericKeys.includes(config.targetField) ? config.targetField : numericKeys[0]
    const matrixData: Array<[number, number, number]> = []
    const pairDetails: Array<{
      xField: string
      yField: string
      correlation: number
      sampleSize: number
      pValue: number | null
    }> = []

    numericKeys.forEach((xField, xIndex) => {
      numericKeys.forEach((yField, yIndex) => {
        const { xValues, yValues } = getPairSeries(normalizedRows, xField, yField)
        const stats = calculatePearson(xValues, yValues)
        const correlation = xField === yField ? 1 : stats.correlation
        const sampleSize = xField === yField ? xValues.length : stats.sampleSize
        const pValue = xField === yField ? 0 : approximatePValue(correlation, sampleSize)

        matrixData.push([xIndex, yIndex, Number(correlation.toFixed(4))])
        if (xIndex < yIndex) {
          pairDetails.push({
            xField,
            yField,
            correlation: Number(correlation.toFixed(4)),
            sampleSize,
            pValue,
          })
        }
      })
    })

    const targetRelations = numericKeys
      .filter((field) => field !== targetField)
      .map((field) => {
        const detail =
          pairDetails.find(
            (item) =>
              (item.xField === targetField && item.yField === field) ||
              (item.xField === field && item.yField === targetField),
          ) || null

        return {
          field,
          correlation: detail?.correlation ?? 0,
          sampleSize: detail?.sampleSize ?? 0,
          pValue: detail?.pValue ?? null,
        }
      })
      .sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation))

    const topN = Math.max(3, Number(config.topN || 8))
    const topTargetRelations = targetRelations.slice(0, topN)
    const validTargetRelations = targetRelations.filter((item) => item.sampleSize >= 4)
    const strongRelationCount = validTargetRelations.filter((item) => Math.abs(item.correlation) >= 0.6).length
    const significantRelationCount = validTargetRelations.filter(
      (item) => item.pValue !== null && item.pValue < 0.05,
    ).length
    const incompleteFieldCount = normalizedRows.reduce((count, row) => {
      return count + numericKeys.filter((key) => row[key] === null).length
    }, 0)

    const summaryLines = [
      `本次共识别 ${numericKeys.length} 个数值字段，基于 ${normalizedRows.length} 行样本计算相关矩阵。`,
      `目标字段使用 "${targetField}"。与目标变量相关性显著（近似 p < 0.05）的字段有 ${significantRelationCount} 个，强相关（|r| >= 0.60）的字段有 ${strongRelationCount} 个。`,
      `数值字段缺失单元格共 ${incompleteFieldCount} 个；Pearson 采用成对可用样本计算，不同字段对的样本量可能不同。`,
    ]

    if (topTargetRelations.length > 0) {
      const strongest = topTargetRelations[0]
      summaryLines.push(
        `当前最值得优先关注的因子是 "${strongest.field}"，与目标变量呈 ${directionLabel(strongest.correlation)}，强度为 ${strengthLabel(strongest.correlation)}（r=${strongest.correlation.toFixed(3)}，近似 p ${formatPValue(strongest.pValue)}）。`,
      )
    }

    const topTableRows = topTargetRelations.map((item) => ({
      因子: item.field,
      相关系数: item.correlation,
      方向: directionLabel(item.correlation),
      强度: strengthLabel(item.correlation),
      样本量: item.sampleSize,
      显著性: formatPValue(item.pValue),
    }))

    const heatmapOption = {
      tooltip: {
        position: 'top',
        formatter: (params: any) => {
          const [xIndex, yIndex, value] = params.data
          return `${numericKeys[yIndex]} vs ${numericKeys[xIndex]}<br/>r = ${value}`
        },
      },
      grid: { top: 40, left: 90, right: 20, bottom: 70 },
      xAxis: {
        type: 'category',
        data: numericKeys,
        axisLabel: { interval: 0, rotate: numericKeys.length > 8 ? 40 : 0 },
      },
      yAxis: {
        type: 'category',
        data: numericKeys,
      },
      visualMap: {
        min: -1,
        max: 1,
        calculable: true,
        orient: 'horizontal',
        left: 'center',
        bottom: 10,
        inRange: {
          color: ['#0f172a', '#60a5fa', '#f8fafc', '#fca5a5', '#991b1b'],
        },
      },
      series: [
        {
          name: 'Pearson r',
          type: 'heatmap',
          data: matrixData,
          label: {
            show: true,
            formatter: (params: any) => Number(params.data[2]).toFixed(2),
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

    const rankingOption = {
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: (params: any[]) => {
          const row = topTargetRelations[params[0].dataIndex]
          return [
            `${row.field}`,
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
        name: 'Pearson r',
      },
      yAxis: {
        type: 'category',
        data: topTargetRelations.map((item) => item.field),
      },
      series: [
        {
          type: 'bar',
          data: topTargetRelations.map((item) => ({
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
    }

    return {
      viewType: 'report',
      metrics: {
        numericFieldCount: numericKeys.length,
        rowCount: normalizedRows.length,
        targetField,
        significantRelationCount,
        strongRelationCount,
      },
      report: {
        title: 'Pearson 相关系数矩阵分析',
        sections: [
          {
            type: 'text',
            content: summaryLines.join('\n'),
          },
          {
            title: '相关性热力图',
            type: 'chart',
            option: heatmapOption,
          },
          {
            title: `目标变量 "${targetField}" 重点相关因子`,
            type: 'chart',
            option: rankingOption,
          },
          {
            title: '目标变量重点因子摘要',
            type: 'text',
            content: JSON.stringify(topTableRows, null, 2),
          },
        ],
      },
    }
  },
}
