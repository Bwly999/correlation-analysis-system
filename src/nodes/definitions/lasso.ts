import type { NodeDefinition } from '../types'
import { createReportResult, extractTableRows } from '../result'
import { requestLassoAnalysis } from '@/services/analysis'

type LassoSummary = {
  targetField: string
  sampleCount: number
  featureCount: number
  selectedFeatureCount: number
  alpha: number
  r2: number
  mae: number
}

type LassoCoefficientItem = {
  name: string
  coefficient: number
  absCoefficient?: number
  selected?: boolean
  rank?: number
}

type LassoPathSeries = {
  feature: string
  coefficients: number[]
}

type LassoResults = {
  summary: LassoSummary
  coefficients: LassoCoefficientItem[]
  selectedFeatures: string[]
  path: {
    alphas: number[]
    series: LassoPathSeries[]
  }
}

const toNumber = (value: unknown) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

const normalizeResults = (results: Partial<LassoResults>): LassoResults => {
  const summary = {
    targetField: String(results.summary?.targetField ?? 'target'),
    sampleCount: toNumber(results.summary?.sampleCount),
    featureCount: toNumber(results.summary?.featureCount),
    selectedFeatureCount: toNumber(results.summary?.selectedFeatureCount),
    alpha: toNumber(results.summary?.alpha),
    r2: toNumber(results.summary?.r2),
    mae: toNumber(results.summary?.mae),
  }

  const coefficients = (results.coefficients ?? [])
    .map((item, index) => ({
      name: String(item.name ?? `因子${index + 1}`),
      coefficient: toNumber(item.coefficient),
      absCoefficient: toNumber(item.absCoefficient ?? Math.abs(toNumber(item.coefficient))),
      selected: Boolean(item.selected),
      rank: toNumber(item.rank ?? index + 1),
    }))
    .sort((left, right) => right.absCoefficient - left.absCoefficient)
    .map((item, index) => ({
      ...item,
      rank: index + 1,
    }))

  const path = {
    alphas: Array.isArray(results.path?.alphas) ? results.path!.alphas.map((item) => toNumber(item)) : [],
    series: Array.isArray(results.path?.series)
      ? results.path!.series.map((item) => ({
          feature: String(item.feature ?? ''),
          coefficients: Array.isArray(item.coefficients)
            ? item.coefficients.map((value) => toNumber(value))
            : [],
        }))
      : [],
  }

  const selectedFeatures =
    results.selectedFeatures?.map((item) => String(item)).filter(Boolean) ??
    coefficients.filter((item) => item.selected).map((item) => item.name)

  return {
    summary,
    coefficients,
    selectedFeatures,
    path,
  }
}

const buildCoefficientChartOption = (coefficients: LassoCoefficientItem[]) => ({
  tooltip: {
    trigger: 'axis',
    axisPointer: { type: 'shadow' },
  },
  grid: { top: 20, left: 90, right: 24, bottom: 20, containLabel: true },
  xAxis: {
    type: 'value',
    name: '标准化系数',
  },
  yAxis: {
    type: 'category',
    data: coefficients.map((item) => item.name).reverse(),
  },
  series: [
    {
      name: 'Lasso 系数',
      type: 'bar',
      data: coefficients
        .map((item) => ({
          value: item.coefficient,
          itemStyle: {
            color: item.coefficient >= 0 ? '#2563eb' : '#ef4444',
            borderRadius: [0, 4, 4, 0],
          },
        }))
        .reverse(),
      label: {
        show: true,
        position: 'right',
        formatter: ({ value }: { value: number }) => value.toFixed(3),
        color: '#334155',
      },
    },
  ],
})

const buildPathChartOption = (path: LassoResults['path']) => ({
  tooltip: {
    trigger: 'axis',
  },
  legend: {
    top: 0,
  },
  grid: { top: 48, left: 56, right: 20, bottom: 36, containLabel: true },
  xAxis: {
    type: 'category',
    name: 'alpha',
    data: path.alphas.map((item) => item.toFixed(4)),
  },
  yAxis: {
    type: 'value',
    name: '系数',
  },
  series: path.series.map((item) => ({
    name: item.feature,
    type: 'line',
    smooth: true,
    symbol: 'none',
    data: item.coefficients,
  })),
})

export const lassoNode: NodeDefinition = {
  name: 'lasso',
  displayName: 'Lasso 回归',
  icon: 'filter',
  category: 'terminal',
  description: '使用 Lasso 回归进行特征筛选并输出简要的建模结果。',
  properties: [
    {
      name: 'targetField',
      displayName: '目标变量 (Y)',
      type: 'options',
      default: 'target',
      useUpstreamFactors: true,
      editable: true,
    },
  ],
  execute: async (input, config) => {
    const rows = extractTableRows(input)
    if (!rows || rows.length === 0) {
      throw new Error('无输入数据')
    }

    const result = await requestLassoAnalysis<{ results?: Partial<LassoResults> }>({
      data: rows,
      target: config.targetField || 'target',
      config,
    })
    const normalized = normalizeResults(result.results ?? {})

    return createReportResult(
      {
        title: 'Lasso 回归分析',
        metadata: {
          ...normalized.summary,
          selectedFeatures: normalized.selectedFeatures,
        },
        sections: [
          {
            key: 'summary',
            type: 'summary',
            title: '模型摘要',
            cards: [
              { label: '目标字段', value: normalized.summary.targetField },
              { label: '样本量', value: normalized.summary.sampleCount },
              { label: '特征数', value: normalized.summary.featureCount },
              { label: '入选特征数', value: normalized.summary.selectedFeatureCount },
              { label: '最优 alpha', value: normalized.summary.alpha },
              { label: 'R²', value: normalized.summary.r2 },
              { label: 'MAE', value: normalized.summary.mae },
            ],
          },
          {
            key: 'coefficients',
            title: '特征系数排序',
            type: 'chart',
            option: buildCoefficientChartOption(normalized.coefficients),
            items: normalized.coefficients,
          },
          {
            key: 'path',
            title: '正则路径',
            type: 'chart',
            option: buildPathChartOption(normalized.path),
          },
          {
            key: 'selected-features',
            title: '入选特征',
            type: 'text',
            content:
              normalized.selectedFeatures.length > 0
                ? `本次 Lasso 共筛出 ${normalized.selectedFeatures.length} 个重点因子：${normalized.selectedFeatures.join('、')}`
                : '本次 Lasso 未筛出非零系数特征，建议检查目标字段、样本量或特征有效性。',
          },
        ],
      },
      {
        meta: {
          sourceData: rows,
          metrics: normalized.summary,
          coefficients: normalized.coefficients,
          path: normalized.path,
        },
      },
    )
  },
}
