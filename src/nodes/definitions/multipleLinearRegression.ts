import type { NodeDefinition } from '../types'
import { createReportResult, extractTableRows } from '../result'
import { requestMultipleLinearRegressionAnalysis } from '@/services/analysis'
import { buildRegressionFitChartOption } from './regressionFitChart'

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
            help: {
              summary: '展示线性回归模型整体拟合质量和样本基础。',
              howToRead: ['先看 R²、调整后 R² 和 MAE 判断模型可用性，再阅读系数排序判断方向和幅度。'],
              cautions: ['线性回归系数受共线性和量纲影响，进入设计规则前建议先结合 VIF 与标准化策略。'],
            },
          },
          {
            key: 'coefficients',
            title: '回归系数排序',
            type: 'chart',
            option: buildCoefficientChartOption(normalized.coefficients),
            items: normalized.coefficients,
            help: {
              summary: '展示各因子在线性模型中的系数方向和相对影响幅度。',
              howToRead: ['正系数表示因子升高时预测 Y 倾向升高，负系数表示倾向降低；绝对值越大影响越强。'],
              cautions: ['系数表示控制其他入模变量后的线性关系，不等于单变量相关性或因果效应。'],
            },
          },
          {
            key: 'predictions',
            title: '预测值对比',
            type: 'chart',
            option: buildRegressionFitChartOption(normalized.predictions),
            help: {
              summary: '对比真实 Y 与模型预测 Y，用来检查线性模型是否能复现目标变化。',
              howToRead: ['点越贴近理想拟合线说明预测越好，成片偏离说明线性假设可能不足。'],
            },
          },
          {
            key: 'residuals',
            title: '残差分布',
            type: 'chart',
            option: buildResidualChartOption(normalized.residuals),
            help: {
              summary: '展示预测误差的分布，帮助判断模型是否存在系统性偏差。',
              howToRead: ['残差应尽量围绕 0 随机分布；偏斜、长尾或分层代表仍有未解释结构。'],
            },
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
