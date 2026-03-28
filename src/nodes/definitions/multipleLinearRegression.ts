import type { NodeDefinition } from '../types'
import { createReportResult, extractTableRows } from '../result'
import { requestMultipleLinearRegressionAnalysis } from '@/services/analysis'

type RegressionSummary = {
  targetField: string
  sampleCount: number
  featureCount: number
  r2: number
  adjustedR2: number
  mae: number
  intercept: number
}

type RegressionCoefficientItem = {
  name: string
  coefficient: number
  absCoefficient?: number
  pValue?: number
  rank?: number
}

type RegressionPredictions = {
  actual: number[]
  predicted: number[]
}

type RegressionResiduals = {
  fitted: number[]
  residuals: number[]
}

type RegressionResults = {
  summary: RegressionSummary
  coefficients: RegressionCoefficientItem[]
  predictions: RegressionPredictions
  residuals: RegressionResiduals
}

const toNumber = (value: unknown) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

const normalizeResults = (results: Partial<RegressionResults>): RegressionResults => {
  const summary = {
    targetField: String(results.summary?.targetField ?? 'target'),
    sampleCount: toNumber(results.summary?.sampleCount),
    featureCount: toNumber(results.summary?.featureCount),
    r2: toNumber(results.summary?.r2),
    adjustedR2: toNumber(results.summary?.adjustedR2),
    mae: toNumber(results.summary?.mae),
    intercept: toNumber(results.summary?.intercept),
  }

  const coefficients = (results.coefficients ?? [])
    .map((item, index) => ({
      name: String(item.name ?? `因子${index + 1}`),
      coefficient: toNumber(item.coefficient),
      absCoefficient: toNumber(item.absCoefficient ?? Math.abs(toNumber(item.coefficient))),
      pValue: toNumber(item.pValue),
      rank: toNumber(item.rank ?? index + 1),
    }))
    .sort((left, right) => right.absCoefficient - left.absCoefficient)
    .map((item, index) => ({
      ...item,
      rank: index + 1,
    }))

  const predictions = {
    actual: Array.isArray(results.predictions?.actual)
      ? results.predictions!.actual.map((item) => toNumber(item))
      : [],
    predicted: Array.isArray(results.predictions?.predicted)
      ? results.predictions!.predicted.map((item) => toNumber(item))
      : [],
  }

  const residuals = {
    fitted: Array.isArray(results.residuals?.fitted)
      ? results.residuals!.fitted.map((item) => toNumber(item))
      : [],
    residuals: Array.isArray(results.residuals?.residuals)
      ? results.residuals!.residuals.map((item) => toNumber(item))
      : [],
  }

  return {
    summary,
    coefficients,
    predictions,
    residuals,
  }
}

const buildCoefficientChartOption = (coefficients: RegressionCoefficientItem[]) => ({
  tooltip: {
    trigger: 'axis',
    axisPointer: { type: 'shadow' },
  },
  grid: { top: 20, left: 90, right: 24, bottom: 20, containLabel: true },
  xAxis: {
    type: 'value',
    name: '回归系数',
  },
  yAxis: {
    type: 'category',
    data: coefficients.map((item) => item.name).reverse(),
  },
  series: [
    {
      name: '回归系数',
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

const buildPredictionChartOption = (predictions: RegressionPredictions) => {
  const actual = predictions.actual
  const predicted = predictions.predicted
  const paired = actual.map((value, index) => [value, predicted[index]])
  const minValue = paired.length > 0 ? Math.min(...actual, ...predicted) : 0
  const maxValue = paired.length > 0 ? Math.max(...actual, ...predicted) : 0

  return {
    tooltip: { trigger: 'item' },
    grid: { top: 20, left: 56, right: 20, bottom: 40, containLabel: true },
    xAxis: { type: 'value', name: '实际值' },
    yAxis: { type: 'value', name: '预测值' },
    series: [
      {
        name: '样本点',
        type: 'scatter',
        data: paired,
        itemStyle: { color: '#2563eb', opacity: 0.75 },
      },
      {
        name: '理想拟合线',
        type: 'line',
        data: [
          [minValue, minValue],
          [maxValue, maxValue],
        ],
        symbol: 'none',
        lineStyle: { color: '#94a3b8', type: 'dashed' },
      },
    ],
  }
}

const buildResidualChartOption = (residuals: RegressionResiduals) => {
  const fitted = residuals.fitted
  const residualValues = residuals.residuals
  const minValue = fitted.length > 0 ? Math.min(...fitted) : 0
  const maxValue = fitted.length > 0 ? Math.max(...fitted) : 0

  return {
    tooltip: { trigger: 'item' },
    grid: { top: 20, left: 56, right: 20, bottom: 40, containLabel: true },
    xAxis: { type: 'value', name: '拟合值' },
    yAxis: { type: 'value', name: '残差' },
    series: [
      {
        name: '残差点',
        type: 'scatter',
        data: fitted.map((value, index) => [value, residualValues[index]]),
        itemStyle: { color: '#0f172a', opacity: 0.7 },
      },
      {
        name: '零基线',
        type: 'line',
        data: [
          [minValue, 0],
          [maxValue, 0],
        ],
        symbol: 'none',
        lineStyle: { color: '#94a3b8', type: 'dashed' },
      },
    ],
  }
}

export const multipleLinearRegressionNode: NodeDefinition = {
  name: 'multiple-linear-regression',
  displayName: '多元线性回归',
  icon: 'chart-column',
  category: 'terminal',
  description: '对多个数值因子执行多元线性回归，输出拟合质量、回归系数和残差诊断。',
  properties: [
    {
      name: 'targetField',
      displayName: '目标变量 (Y)',
      type: 'options',
      default: 'target',
      useUpstreamFactors: true,
      editable: true,
      description: '选择需要被解释或预测的目标字段。',
    },
    {
      name: 'factorNames',
      displayName: '影响因子 (X)',
      type: 'multi-options',
      default: [],
      useUpstreamFactors: true,
      editable: true,
      forceInput: true,
      description: '选择参与回归建模的因子列表；留空时默认使用除目标变量外的全部数值字段。',
    },
  ],
  execute: async (input, config) => {
    const rows = extractTableRows(input)
    if (!rows || rows.length === 0) {
      throw new Error('无输入数据')
    }

    const result = await requestMultipleLinearRegressionAnalysis<{ results?: Partial<RegressionResults> }>({
      data: rows,
      target: config.targetField || 'target',
      config,
    })
    const normalized = normalizeResults(result.results ?? {})

    return createReportResult(
      {
        title: '多元线性回归分析',
        metadata: {
          ...normalized.summary,
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
              { label: 'R²', value: normalized.summary.r2 },
              { label: '调整后 R²', value: normalized.summary.adjustedR2 },
              { label: 'MAE', value: normalized.summary.mae },
              { label: '截距', value: normalized.summary.intercept },
            ],
          },
          {
            key: 'coefficients',
            title: '回归系数排序',
            type: 'chart',
            option: buildCoefficientChartOption(normalized.coefficients),
            items: normalized.coefficients,
          },
          {
            key: 'predictions',
            title: '预测值对比',
            type: 'chart',
            option: buildPredictionChartOption(normalized.predictions),
          },
          {
            key: 'residuals',
            title: '残差分布',
            type: 'chart',
            option: buildResidualChartOption(normalized.residuals),
          },
        ],
      },
      {
        meta: {
          sourceData: rows,
          metrics: normalized.summary,
          coefficients: normalized.coefficients,
          predictions: normalized.predictions,
          residuals: normalized.residuals,
        },
      },
    )
  },
}
