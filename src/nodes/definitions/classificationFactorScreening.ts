import type { NodeDefinition } from '../types'
import { createReportResult, extractTableRows } from '../result'

type ScreeningConfig = {
  targetField?: string
  factorNames?: string[]
  alpha?: number
  maxResultCount?: number
}

type ScreeningResultItem = {
  factorName: string
  factorType: 'numeric' | 'categorical'
  method: string
  statistic: number
  pValue: number
  effectSize: number
  sampleCount: number
  classCount: number
  significant: boolean
  note: string
}

type ScreeningRisk = {
  code: string
  level: 'low' | 'medium' | 'warning' | 'danger'
  title: string
  message: string
}

const toNumeric = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length

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

  const shiftedValue = value - 1
  let accumulator = 0.9999999999998099
  coefficients.forEach((coefficient, index) => {
    accumulator += coefficient / (shiftedValue + index + 1)
  })

  const shifted = shiftedValue + coefficients.length - 0.5
  return (
    0.5 * Math.log(2 * Math.PI) +
    (shiftedValue + 0.5) * Math.log(shifted) -
    shifted +
    Math.log(accumulator)
  )
}

const gammaLowerRegularized = (shape: number, value: number) => {
  if (value <= 0) return 0

  if (value < shape + 1) {
    let term = 1 / shape
    let sum = term
    for (let iteration = 1; iteration < 200; iteration += 1) {
      term *= value / (shape + iteration)
      sum += term
      if (Math.abs(term) < Math.abs(sum) * 1e-12) break
    }
    return sum * Math.exp(-value + shape * Math.log(value) - logGamma(shape))
  }

  let b = value + 1 - shape
  let c = 1 / 1e-30
  let d = 1 / Math.max(1e-30, b)
  let h = d

  for (let iteration = 1; iteration < 200; iteration += 1) {
    const an = -iteration * (iteration - shape)
    b += 2
    d = an * d + b
    if (Math.abs(d) < 1e-30) d = 1e-30
    c = b + an / c
    if (Math.abs(c) < 1e-30) c = 1e-30
    d = 1 / d
    const delta = d * c
    h *= delta
    if (Math.abs(delta - 1) < 1e-12) break
  }

  return 1 - Math.exp(-value + shape * Math.log(value) - logGamma(shape)) * h
}

const chiSquareSurvival = (value: number, degreesOfFreedom: number) => {
  if (!Number.isFinite(value) || value < 0 || degreesOfFreedom <= 0) return 1
  return Math.max(0, Math.min(1, 1 - gammaLowerRegularized(degreesOfFreedom / 2, value / 2)))
}

const erf = (value: number) => {
  const sign = value >= 0 ? 1 : -1
  const absoluteValue = Math.abs(value)
  const a1 = 0.254829592
  const a2 = -0.284496736
  const a3 = 1.421413741
  const a4 = -1.453152027
  const a5 = 1.061405429
  const p = 0.3275911
  const t = 1 / (1 + p * absoluteValue)
  const y =
    1 -
    (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t) * Math.exp(-absoluteValue * absoluteValue)
  return sign * y
}

const normalSurvival = (z: number) => 0.5 * (1 - erf(z / Math.SQRT2))

const averageRanks = (values: number[]) => {
  const indexed = values.map((value, index) => ({ value, index })).sort((left, right) => left.value - right.value)
  const ranks = new Array(values.length).fill(0)
  let pointer = 0
  while (pointer < indexed.length) {
    let end = pointer
    while (end + 1 < indexed.length && indexed[end + 1]!.value === indexed[pointer]!.value) {
      end += 1
    }
    const averageRank = (pointer + end + 2) / 2
    for (let index = pointer; index <= end; index += 1) {
      ranks[indexed[index]!.index] = averageRank
    }
    pointer = end + 1
  }
  return ranks
}

const runMannWhitney = (groups: number[][]) => {
  const left = groups[0] ?? []
  const right = groups[1] ?? []
  const combined = [...left, ...right]
  const ranks = averageRanks(combined)
  const leftRankSum = ranks.slice(0, left.length).reduce((sum, rank) => sum + rank, 0)
  const u1 = leftRankSum - (left.length * (left.length + 1)) / 2
  const u2 = left.length * right.length - u1
  const u = Math.min(u1, u2)
  const meanU = (left.length * right.length) / 2
  const sdU = Math.sqrt((left.length * right.length * (left.length + right.length + 1)) / 12)
  const z = sdU > 0 ? (u - meanU) / sdU : 0
  const pValue = Math.min(1, 2 * normalSurvival(Math.abs(z)))
  const effectSize = left.length * right.length > 0 ? Math.abs(1 - (2 * u) / (left.length * right.length)) : 0

  return {
    method: 'Mann-Whitney U',
    statistic: Number(u.toFixed(6)),
    pValue: Number(pValue.toFixed(6)),
    effectSize: Number(effectSize.toFixed(6)),
  }
}

const runKruskalWallis = (groups: number[][]) => {
  const combined = groups.flat()
  const ranks = averageRanks(combined)
  let cursor = 0
  let sumSquares = 0
  groups.forEach((group) => {
    const rankSum = ranks.slice(cursor, cursor + group.length).reduce((sum, rank) => sum + rank, 0)
    cursor += group.length
    sumSquares += (rankSum * rankSum) / group.length
  })

  const sampleCount = combined.length
  const statistic = (12 / (sampleCount * (sampleCount + 1))) * sumSquares - 3 * (sampleCount + 1)
  const pValue = chiSquareSurvival(statistic, groups.length - 1)
  const effectSize = sampleCount > groups.length ? Math.max(0, (statistic - groups.length + 1) / (sampleCount - groups.length)) : 0

  return {
    method: 'Kruskal-Wallis',
    statistic: Number(statistic.toFixed(6)),
    pValue: Number(pValue.toFixed(6)),
    effectSize: Number(effectSize.toFixed(6)),
  }
}

const buildContingencyTable = (rows: Array<{ factorValue: string; targetValue: string }>) => {
  const factorLevels = Array.from(new Set(rows.map((row) => row.factorValue))).sort()
  const targetLevels = Array.from(new Set(rows.map((row) => row.targetValue))).sort()
  const matrix = factorLevels.map((factorLevel) =>
    targetLevels.map((targetLevel) =>
      rows.filter((row) => row.factorValue === factorLevel && row.targetValue === targetLevel).length,
    ),
  )

  return { factorLevels, targetLevels, matrix }
}

const computeExpectedTable = (matrix: number[][]) => {
  const rowTotals = matrix.map((row) => row.reduce((sum, value) => sum + value, 0))
  const columnTotals = matrix[0]?.map((_, columnIndex) =>
    matrix.reduce((sum, row) => sum + (row[columnIndex] ?? 0), 0),
  ) ?? []
  const total = rowTotals.reduce((sum, value) => sum + value, 0)
  return matrix.map((row, rowIndex) =>
    row.map((_, columnIndex) =>
      total > 0 ? (rowTotals[rowIndex]! * columnTotals[columnIndex]!) / total : 0,
    ),
  )
}

const chiSquareStatistic = (matrix: number[][], expected: number[][]) => {
  let statistic = 0
  matrix.forEach((row, rowIndex) => {
    row.forEach((value, columnIndex) => {
      const targetExpected = expected[rowIndex]?.[columnIndex] ?? 0
      if (targetExpected > 0) {
        statistic += ((value - targetExpected) ** 2) / targetExpected
      }
    })
  })
  return statistic
}

const logFactorial = (value: number) => logGamma(value + 1)

const hypergeometricProbability = (a: number, b: number, c: number, d: number) => {
  const row1 = a + b
  const row2 = c + d
  const col1 = a + c
  const col2 = b + d
  const total = row1 + row2
  return Math.exp(
    logFactorial(row1) +
      logFactorial(row2) +
      logFactorial(col1) +
      logFactorial(col2) -
      (logFactorial(total) + logFactorial(a) + logFactorial(b) + logFactorial(c) + logFactorial(d)),
  )
}

const runFisherExact = (matrix: number[][]) => {
  const firstRow = matrix[0] ?? []
  const secondRow = matrix[1] ?? []
  const a = firstRow[0] ?? 0
  const b = firstRow[1] ?? 0
  const c = secondRow[0] ?? 0
  const d = secondRow[1] ?? 0
  const row1 = a + b
  const row2 = c + d
  const col1 = a + c
  const minA = Math.max(0, col1 - row2)
  const maxA = Math.min(col1, row1)
  const observed = hypergeometricProbability(a, b, c, d)
  let pValue = 0

  for (let candidateA = minA; candidateA <= maxA; candidateA += 1) {
    const candidateB = row1 - candidateA
    const candidateC = col1 - candidateA
    const candidateD = row2 - candidateC
    const probability = hypergeometricProbability(candidateA, candidateB, candidateC, candidateD)
    if (probability <= observed + 1e-12) {
      pValue += probability
    }
  }

  const total = row1 + row2
  const phi = total > 0 ? Math.abs((a * d - b * c) / Math.sqrt(row1 * row2 * col1 * (b + d))) : 0

  return {
    method: 'Fisher exact',
    statistic: Number(observed.toFixed(6)),
    pValue: Number(Math.min(1, pValue).toFixed(6)),
    effectSize: Number((Number.isFinite(phi) ? phi : 0).toFixed(6)),
  }
}

const runCategoricalScreening = (rows: Array<{ factorValue: string; targetValue: string }>) => {
  const { factorLevels, targetLevels, matrix } = buildContingencyTable(rows)
  const expected = computeExpectedTable(matrix)
  const expectedMin = Math.min(...expected.flat())
  const total = matrix.flat().reduce((sum, value) => sum + value, 0)

  if (factorLevels.length === 2 && targetLevels.length === 2 && expectedMin < 5) {
    return runFisherExact(matrix)
  }

  const statistic = chiSquareStatistic(matrix, expected)
  const degreesOfFreedom = (factorLevels.length - 1) * (targetLevels.length - 1)
  const pValue = chiSquareSurvival(statistic, degreesOfFreedom)
  const minDimension = Math.min(factorLevels.length - 1, targetLevels.length - 1)
  const effectSize = total > 0 && minDimension > 0 ? Math.sqrt(statistic / (total * minDimension)) : 0

  return {
    method: 'Chi-square',
    statistic: Number(statistic.toFixed(6)),
    pValue: Number(pValue.toFixed(6)),
    effectSize: Number(effectSize.toFixed(6)),
  }
}

const buildRankingChartOption = (results: ScreeningResultItem[], maxResultCount: number) => {
  const visible = results.slice(0, maxResultCount)
  return {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
    },
    grid: { top: 20, left: 110, right: 20, bottom: 20, containLabel: true },
    xAxis: {
      type: 'value',
      name: '-log10(p)',
    },
    yAxis: {
      type: 'category',
      data: visible.map((item) => item.factorName).reverse(),
    },
    series: [
      {
        type: 'bar',
        data: visible
          .map((item) => ({
            value: Number((-Math.log10(Math.max(item.pValue, 1e-12))).toFixed(4)),
            itemStyle: {
              color: item.significant ? '#2563eb' : '#94a3b8',
              borderRadius: [0, 4, 4, 0],
            },
          }))
          .reverse(),
      },
    ],
  }
}

const buildRisks = (
  rows: Record<string, unknown>[],
  targetField: string,
  results: ScreeningResultItem[],
): ScreeningRisk[] => {
  const risks: ScreeningRisk[] = []
  const labelValues = rows
    .map((row) => row[targetField])
    .filter((value) => value !== null && value !== undefined && String(value).trim() !== '')
    .map((value) => String(value))
  const classCounts = Array.from(
    labelValues.reduce((map, value) => map.set(value, (map.get(value) ?? 0) + 1), new Map<string, number>()),
  )
  const minClass = Math.min(...classCounts.map(([, count]) => count))
  const maxClass = Math.max(...classCounts.map(([, count]) => count))
  if (minClass > 0 && maxClass / minClass >= 3) {
    risks.push({
      code: 'class_imbalance',
      level: 'medium',
      title: '类别分布不均衡',
      message: '目标标签存在明显不均衡，单因子显著性结果可能受少数类样本量限制。',
    })
  }

  if (results.some((item) => item.sampleCount < 20)) {
    risks.push({
      code: 'small_sample',
      level: 'warning',
      title: '部分因子有效样本较少',
      message: '部分因子的有效样本不足 20，建议结合业务含义和原始分布谨慎解释。',
    })
  }

  return risks
}

const inferFactorType = (values: unknown[]) => {
  const presentValues = values.filter((value) => value !== null && value !== undefined && String(value).trim() !== '')
  if (presentValues.length === 0) return 'categorical' as const
  const numericCount = presentValues.filter((value) => toNumeric(value) !== null).length
  return numericCount / presentValues.length >= 0.8 ? ('numeric' as const) : ('categorical' as const)
}

export const classificationFactorScreeningNode: NodeDefinition<unknown, ScreeningConfig> = {
  name: 'classification-factor-screening',
  displayName: '分类因子筛查',
  icon: 'list-filter',
  category: 'terminal',
  description: '针对二分类或多分类标签，逐个筛查多个因子与目标标签之间的差异或关联强度。',
  properties: [
    {
      name: 'targetField',
      displayName: '目标标签 (Y)',
      type: 'options',
      default: '',
      useUpstreamFactors: true,
      editable: true,
      description: '选择二分类或多分类标签字段。',
    },
    {
      name: 'factorNames',
      displayName: '候选因子 (X)',
      type: 'multi-options',
      default: [],
      useUpstreamFactors: true,
      editable: true,
      forceInput: true,
      description: '选择需要逐个筛查的因子列表；留空时默认使用除目标标签外的全部字段。',
    },
    {
      name: 'alpha',
      displayName: '显著性阈值',
      type: 'number',
      default: 0.05,
      numberMode: 'decimal',
      description: '用于判断单因子结果是否显著，默认 0.05。',
    },
    {
      name: 'maxResultCount',
      displayName: '排行展示数量',
      type: 'number',
      default: 10,
      description: '控制报告中排行图和摘要明细展示的因子数量。',
    },
  ],
  execute: async (input, config) => {
    const rows = extractTableRows(input)
    if (!rows || rows.length === 0) {
      throw new Error('无可分析的输入数据')
    }

    const targetField = typeof config.targetField === 'string' ? config.targetField.trim() : ''
    if (!targetField) {
      throw new Error('请先选择目标标签字段')
    }

    const allFields = Array.from(new Set(rows.flatMap((row) => Object.keys(row))))
    if (!allFields.includes(targetField)) {
      throw new Error(`目标标签字段不存在：${targetField}`)
    }

    const alpha = typeof config.alpha === 'number' && config.alpha > 0 ? config.alpha : 0.05
    const factorNames =
      Array.isArray(config.factorNames) && config.factorNames.length > 0
        ? config.factorNames.filter((name): name is string => typeof name === 'string' && name !== targetField)
        : allFields.filter((field) => field !== targetField)

    if (factorNames.length === 0) {
      throw new Error('未提供可筛查的因子字段')
    }

    const validTargetRows = rows
      .map((row) => ({
        ...row,
        __target: row[targetField],
      }))
      .filter((row) => row.__target !== null && row.__target !== undefined && String(row.__target).trim() !== '') as Array<
      Record<string, unknown> & { __target: unknown }
    >

    const classLabels = Array.from(new Set(validTargetRows.map((row) => String(row.__target)))).sort()
    if (classLabels.length < 2) {
      throw new Error('目标标签至少需要 2 个有效类别才能进行分类因子筛查')
    }

    const results: ScreeningResultItem[] = factorNames.map((factorName) => {
      if (!allFields.includes(factorName)) {
        throw new Error(`候选因子字段不存在：${factorName}`)
      }

      const factorType = inferFactorType(validTargetRows.map((row) => row[factorName]))
      if (factorType === 'numeric') {
        const grouped = classLabels
          .map((label) =>
            validTargetRows
              .filter((row) => String(row.__target) === label)
              .map((row) => toNumeric(row[factorName]))
              .filter((value): value is number => value !== null),
          )
          .filter((group) => group.length > 0)

        if (grouped.length < 2 || grouped.flat().length < 6) {
          return {
            factorName,
            factorType,
            method: classLabels.length === 2 ? 'Mann-Whitney U' : 'Kruskal-Wallis',
            statistic: 0,
            pValue: 1,
            effectSize: 0,
            sampleCount: grouped.flat().length,
            classCount: grouped.length,
            significant: false,
            note: '有效样本不足，暂不建议解释该因子。',
          }
        }

        const metrics = grouped.length === 2 ? runMannWhitney(grouped) : runKruskalWallis(grouped)
        const classMeans = grouped.map((group) => mean(group).toFixed(2))
        return {
          factorName,
          factorType,
          ...metrics,
          sampleCount: grouped.flat().length,
          classCount: grouped.length,
          significant: metrics.pValue <= alpha,
          note:
            grouped.length === 2
              ? `两类样本的分布差异已完成检验，组均值分别为 ${classMeans.join(' / ')}。`
              : `多类样本的分布差异已完成检验，各类均值分别为 ${classMeans.join(' / ')}。`,
        }
      }

      const categoricalRows = validTargetRows
        .map((row) => ({
          factorValue: String(row[factorName]),
          targetValue: String(row.__target),
        }))
        .filter((row) => row.factorValue.trim() !== '')

      const metrics = runCategoricalScreening(categoricalRows)
      return {
        factorName,
        factorType,
        ...metrics,
        sampleCount: categoricalRows.length,
        classCount: classLabels.length,
        significant: metrics.pValue <= alpha,
        note: '已按列联表关系完成类别因子与目标标签的关联检验。',
      }
    })

    const sortedResults = [...results].sort(
      (left, right) => left.pValue - right.pValue || right.effectSize - left.effectSize,
    )
    const maxResultCount =
      typeof config.maxResultCount === 'number' && config.maxResultCount > 0 ? config.maxResultCount : 10
    const significantCount = sortedResults.filter((item) => item.significant).length
    const risks = buildRisks(validTargetRows, targetField, sortedResults)

    return createReportResult(
      {
        title: '分类因子筛查',
        metadata: {
          targetField,
          classCount: classLabels.length,
          testedFactorCount: sortedResults.length,
          significantFactorCount: significantCount,
        },
        sections: [
          {
            key: 'summary',
            type: 'summary',
            title: '筛查摘要',
            cards: [
              { label: '目标标签', value: targetField },
              { label: '类别数', value: classLabels.length },
              { label: '筛查因子数', value: sortedResults.length },
              { label: '显著因子数', value: significantCount },
              { label: '显著性阈值', value: alpha },
            ],
            content:
              significantCount > 0
                ? `共识别到 ${significantCount} 个显著因子，建议优先将这些因子带入逻辑回归分类分析。`
                : '当前未识别到达到阈值的显著因子，建议检查样本量、类别分布或放宽筛查范围。',
            help: {
              summary: '概览分类目标下每个候选因子的单因素显著性筛查结果。',
              howToRead: ['先看显著因子数和阈值，再进入排行查看哪些因子与类别差异最明显。'],
              cautions: ['单因素显著只说明与类别有关联，不能替代多因素分类模型。'],
            },
          },
          {
            key: 'ranking',
            type: 'chart',
            title: '因子显著性排行',
            option: buildRankingChartOption(sortedResults, maxResultCount),
            items: sortedResults.slice(0, maxResultCount),
            help: {
              summary: '按统计显著性和效应量展示最值得进入分类模型的候选因子。',
              howToRead: ['优先关注 P 值低且效应量高的因子，同时注意因子类型和检验方法。'],
            },
          },
          {
            key: 'details',
            type: 'text',
            title: '因子明细',
            content: JSON.stringify(
              sortedResults.slice(0, maxResultCount).map((item) => ({
                因子: item.factorName,
                类型: item.factorType === 'numeric' ? '数值' : '类别',
                方法: item.method,
                统计量: item.statistic,
                P值: item.pValue,
                效应量: item.effectSize,
                显著: item.significant ? '是' : '否',
                说明: item.note,
              })),
              null,
              2,
            ),
            help: {
              summary: '列出每个因子的检验方法、统计量、P 值、效应量和显著性判断。',
              howToRead: ['结合方法列区分数值因子和类别因子，不同检验的统计量不可简单横向比较。'],
            },
          },
          {
            key: 'risks',
            type: 'risk-list',
            title: '结果可信提示',
            items: risks,
            help: {
              summary: '提示类别分布、样本量和检验适用性问题。',
              howToRead: ['优先修正类别极不均衡或样本不足问题，再用排行筛选入模因子。'],
            },
          },
        ],
      },
      {
        meta: {
          metrics: {
            targetField,
            classCount: classLabels.length,
            testedFactorCount: sortedResults.length,
            significantFactorCount: significantCount,
          },
          results: sortedResults,
          risks,
        },
      },
    )
  },
}
