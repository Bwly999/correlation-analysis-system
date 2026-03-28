import type { NodeDefinition } from '../types'
import { createReportResult, extractTableRows } from '../result'

type NumericRow = Record<string, number | null>

type PcaMetrics = {
  featureCount: number
  sampleCount: number
  componentCount: number
  explainedVarianceRatio: number[]
  cumulativeExplainedVarianceRatio: number[]
}

type PcaLoading = {
  field: string
  component: string
  loading: number
}

const toFiniteNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
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

const normalizeSelectedFields = (
  selected: unknown,
  allKeys: string[],
  numericKeys: string[],
) => {
  const rawFields = Array.isArray(selected)
    ? selected.filter((item): item is string => typeof item === 'string')
    : typeof selected === 'string'
      ? [selected]
      : []

  const uniqueFields = rawFields.filter((field, index) => rawFields.indexOf(field) === index)
  const missingFields = uniqueFields.filter((field) => !allKeys.includes(field))
  const nonNumericFields = uniqueFields.filter(
    (field) => allKeys.includes(field) && !numericKeys.includes(field),
  )
  const validFields = uniqueFields.filter((field) => numericKeys.includes(field))

  return {
    validFields,
    missingFields,
    nonNumericFields,
  }
}

const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length

const standardDeviation = (values: number[], avg: number) => {
  if (values.length <= 1) return 0
  const variance =
    values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / (values.length - 1)
  return Math.sqrt(variance)
}

const dotProduct = (left: number[], right: number[]) =>
  left.reduce((sum, value, index) => sum + value * (right[index] ?? 0), 0)

const multiplyMatrixVector = (matrix: number[][], vector: number[]) =>
  matrix.map((row) => dotProduct(row, vector))

const normalizeVector = (vector: number[]) => {
  const norm = Math.sqrt(dotProduct(vector, vector))
  if (norm <= 1e-12) return vector.map(() => 0)
  return vector.map((value) => value / norm)
}

const powerIteration = (matrix: number[][]) => {
  let vector = normalizeVector(matrix.map((_, index) => (index === 0 ? 1 : 0.5)))
  for (let iteration = 0; iteration < 80; iteration += 1) {
    const nextVector = normalizeVector(multiplyMatrixVector(matrix, vector))
    const delta = Math.sqrt(
      nextVector.reduce((sum, value, index) => sum + (value - (vector[index] ?? 0)) ** 2, 0),
    )
    vector = nextVector
    if (delta < 1e-8) break
  }

  const matrixVector = multiplyMatrixVector(matrix, vector)
  const eigenvalue = dotProduct(vector, matrixVector)
  return { eigenvalue, eigenvector: vector }
}

const deflateMatrix = (matrix: number[][], eigenvalue: number, eigenvector: number[]) =>
  matrix.map((row, rowIndex) =>
    row.map(
      (value, columnIndex) =>
        value - eigenvalue * (eigenvector[rowIndex] ?? 0) * (eigenvector[columnIndex] ?? 0),
    ),
  )

const buildBarChartOption = (metrics: PcaMetrics) => ({
  tooltip: {
    trigger: 'axis',
    axisPointer: { type: 'shadow' },
  },
  legend: {
    top: 0,
  },
  grid: { top: 48, left: 56, right: 20, bottom: 36, containLabel: true },
  xAxis: {
    type: 'category',
    data: metrics.explainedVarianceRatio.map((_, index) => `PC${index + 1}`),
  },
  yAxis: {
    type: 'value',
    name: '解释方差占比',
    max: 1,
  },
  series: [
    {
      name: '单个主成分',
      type: 'bar',
      data: metrics.explainedVarianceRatio.map((value) => Number(value.toFixed(4))),
      itemStyle: {
        color: '#2563eb',
        borderRadius: [4, 4, 0, 0],
      },
    },
    {
      name: '累计解释方差',
      type: 'line',
      smooth: true,
      data: metrics.cumulativeExplainedVarianceRatio.map((value) => Number(value.toFixed(4))),
      itemStyle: { color: '#0f172a' },
    },
  ],
})

const buildLoadingHeatmapOption = (loadings: PcaLoading[], factorNames: string[], componentNames: string[]) => ({
  tooltip: {
    position: 'top',
    formatter: (params: { data: [number, number, number] }) => {
      const [xIndex, yIndex, value] = params.data
      return `${componentNames[xIndex] ?? ''} / ${factorNames[yIndex] ?? ''}<br/>载荷 = ${value.toFixed(3)}`
    },
  },
  grid: { top: 72, left: 90, right: 20, bottom: 60 },
  xAxis: {
    type: 'category',
    data: componentNames,
  },
  yAxis: {
    type: 'category',
    data: factorNames,
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
      color: ['#991b1b', '#fca5a5', '#f8fafc', '#93c5fd', '#1d4ed8'],
    },
  },
  series: [
    {
      name: '载荷热力图',
      type: 'heatmap',
      data: loadings.map((item) => [
        componentNames.indexOf(item.component),
        factorNames.indexOf(item.field),
        Number(item.loading.toFixed(4)),
      ]),
      label: {
        show: true,
        formatter: (params: { data: [number, number, number] }) => params.data[2].toFixed(2),
        color: '#0f172a',
        fontSize: 11,
      },
    },
  ],
})

export const pcaNode: NodeDefinition = {
  name: 'pca',
  displayName: 'PCA 主成分分析',
  icon: 'chart-no-axes-column',
  category: 'terminal',
  description: '对多个数值因子做 PCA 主成分分析，查看主成分解释方差和字段载荷结构。',
  properties: [
    {
      name: 'factorNames',
      displayName: '分析字段',
      type: 'tags',
      useUpstreamFactors: true,
      description: '选择参与 PCA 的数值字段；留空时默认使用全部数值字段。',
    },
    {
      name: 'componentCount',
      displayName: '主成分数量',
      type: 'number',
      default: 2,
      description: '控制输出的主成分数量，默认保留前 2 个主成分。',
    },
    {
      name: 'standardize',
      displayName: '分析前标准化',
      type: 'boolean',
      default: true,
      description: '字段量纲差异较大时建议开启，避免大尺度字段主导结果。',
    },
  ],
  execute: async (input, config) => {
    const rows = extractTableRows(input)
    if (!rows || rows.length === 0) {
      throw new Error('无可分析的输入数据')
    }

    const allKeys = [...new Set(rows.flatMap((row) => Object.keys(row)))]
    const { numericKeys, normalizedRows } = buildNumericDataset(rows)
    if (numericKeys.length < 2) {
      throw new Error('至少需要 2 个数值字段才能进行 PCA 分析')
    }

    const selection = normalizeSelectedFields(config.factorNames, allKeys, numericKeys)
    if (selection.missingFields.length > 0) {
      throw new Error(`所选字段中以下字段不存在：${selection.missingFields.join('、')}`)
    }
    if (selection.nonNumericFields.length > 0) {
      throw new Error(`所选字段中以下字段不支持 PCA 分析：${selection.nonNumericFields.join('、')}`)
    }

    const factorNames = selection.validFields.length > 0 ? selection.validFields : numericKeys
    if (factorNames.length < 2) {
      throw new Error('至少需要 2 个有效数值字段才能进行 PCA 分析')
    }

    const completeRows = normalizedRows.filter((row) =>
      factorNames.every((field) => row[field] !== null && row[field] !== undefined),
    )
    if (completeRows.length < 5) {
      throw new Error('有效样本不足，无法完成 PCA 分析')
    }

    const standardize = config.standardize !== false
    const matrix = completeRows.map((row) => factorNames.map((field) => row[field] as number))
    const columns = factorNames.map((_, columnIndex) => matrix.map((row) => row[columnIndex] ?? 0))
    const processedColumns = columns.map((values) => {
      const avg = mean(values)
      const std = standardDeviation(values, avg)
      return values.map((value) =>
        standardize && std > 1e-12 ? (value - avg) / std : value - avg,
      )
    })
    const processedMatrix = matrix.map((_, rowIndex) =>
      processedColumns.map((column) => column[rowIndex] ?? 0),
    )

    const covarianceMatrix = factorNames.map((_, leftIndex) =>
      factorNames.map((__, rightIndex) => {
        const leftValues = processedColumns[leftIndex]!
        const rightValues = processedColumns[rightIndex]!
        return (
          leftValues.reduce(
            (sum, value, rowIndex) => sum + value * (rightValues[rowIndex] ?? 0),
            0,
          ) /
          (processedMatrix.length - 1)
        )
      }),
    )

    const desiredComponentCount = Math.max(
      1,
      Math.min(
        Number(config.componentCount ?? 2),
        factorNames.length,
      ),
    )

    const eigenPairs: Array<{ eigenvalue: number; eigenvector: number[] }> = []
    let workingMatrix = covarianceMatrix.map((row) => [...row])
    for (let index = 0; index < desiredComponentCount; index += 1) {
      const next = powerIteration(workingMatrix)
      if (next.eigenvalue <= 1e-10) {
        eigenPairs.push({
          eigenvalue: 0,
          eigenvector: factorNames.map((_, fieldIndex) => (fieldIndex === index ? 1 : 0)),
        })
        continue
      }
      eigenPairs.push(next)
      workingMatrix = deflateMatrix(workingMatrix, next.eigenvalue, next.eigenvector)
    }

    if (eigenPairs.every((item) => item.eigenvalue <= 1e-10)) {
      throw new Error('当前字段缺少可分解的有效方差，无法完成 PCA 分析')
    }

    const totalVariance = covarianceMatrix.reduce(
      (sum, row, index) => sum + (row[index] ?? 0),
      0,
    )
    const explainedVarianceRatio = eigenPairs.map((item) =>
      totalVariance > 1e-12 ? item.eigenvalue / totalVariance : 0,
    )
    const cumulativeExplainedVarianceRatio = explainedVarianceRatio.reduce<number[]>(
      (result, value, index) => {
        const previous = result[index - 1] ?? 0
        result.push(previous + value)
        return result
      },
      [],
    )

    const componentNames = eigenPairs.map((_, index) => `PC${index + 1}`)
    const loadings: PcaLoading[] = eigenPairs.flatMap((item, componentIndex) =>
      factorNames.map((field, fieldIndex) => ({
        field,
        component: componentNames[componentIndex]!,
        loading: item.eigenvector[fieldIndex] ?? 0,
      })),
    )

    const metrics: PcaMetrics = {
      featureCount: factorNames.length,
      sampleCount: completeRows.length,
      componentCount: eigenPairs.length,
      explainedVarianceRatio: explainedVarianceRatio.map((value) => Number(value.toFixed(6))),
      cumulativeExplainedVarianceRatio: cumulativeExplainedVarianceRatio.map((value) =>
        Number(value.toFixed(6)),
      ),
    }

    return createReportResult(
      {
        title: 'PCA 主成分分析',
        metadata: {
          featureCount: metrics.featureCount,
          sampleCount: metrics.sampleCount,
          componentCount: metrics.componentCount,
          standardize,
        },
        sections: [
          {
            key: 'summary',
            type: 'summary',
            title: '分析摘要',
            cards: [
              { label: '分析字段数', value: metrics.featureCount },
              { label: '有效样本量', value: metrics.sampleCount },
              { label: '主成分数', value: metrics.componentCount },
              {
                label: '前两项累计解释方差',
                value: Number((metrics.cumulativeExplainedVarianceRatio[1] ?? metrics.cumulativeExplainedVarianceRatio[0] ?? 0).toFixed(4)),
              },
            ],
            content: `本次 PCA 使用 ${metrics.sampleCount} 行完整样本，对 ${metrics.featureCount} 个字段进行降维分析；前 ${metrics.componentCount} 个主成分用于展示主要方差结构。`,
          },
          {
            key: 'variance',
            type: 'chart',
            title: '解释方差占比',
            option: buildBarChartOption(metrics),
          },
          {
            key: 'loadings',
            type: 'chart',
            title: '字段载荷热力图',
            option: buildLoadingHeatmapOption(loadings, factorNames, componentNames),
          },
          {
            key: 'details',
            type: 'text',
            title: '字段载荷明细',
            content: JSON.stringify(
              loadings.map((item) => ({
                字段: item.field,
                主成分: item.component,
                载荷: Number(item.loading.toFixed(4)),
              })),
              null,
              2,
            ),
          },
        ],
      },
      {
        meta: {
          metrics,
          loadings,
          factorNames,
        },
      },
    )
  },
}
