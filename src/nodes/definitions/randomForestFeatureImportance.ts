import type { NodeDefinition } from '../types'
import { createReportResult, extractTableRows } from '../result'
import { requestRandomForestFeatureImportanceAnalysis } from '@/services/analysis'

type RandomForestSummary = {
  targetField: string
  sampleCount: number
  featureCount: number
  r2: number
  mae: number
  nEstimators: number
  maxDepth: number
}

type ImportanceItem = {
  name: string
  value: number
  rank?: number
}

type CumulativeImportanceItem = {
  name: string
  cumulativeValue: number
  rank?: number
}

type PredictionSeries = {
  actual: number[]
  predicted: number[]
}

type RandomForestRisk = {
  code: string
  level: 'low' | 'medium' | 'warning' | 'danger'
  title: string
  message: string
}

type RandomForestResults = {
  summary: RandomForestSummary
  importance: ImportanceItem[]
  cumulativeImportance: CumulativeImportanceItem[]
  predictions: PredictionSeries
  risks: RandomForestRisk[]
}

const toNumber = (value: unknown) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

const normalizeResults = (results: Partial<RandomForestResults>): RandomForestResults => {
  const importance = (results.importance ?? [])
    .map((item, index) => ({
      name: String(item.name ?? `因子${index + 1}`),
      value: toNumber(item.value),
      rank: toNumber(item.rank ?? index + 1),
    }))
    .sort((left, right) => right.value - left.value)
    .map((item, index) => ({ ...item, rank: index + 1 }))

  let runningCumulative = 0
  const cumulativeImportance =
    Array.isArray(results.cumulativeImportance) && results.cumulativeImportance.length > 0
      ? results.cumulativeImportance
          .map((item, index) => ({
            name: String(item.name ?? importance[index]?.name ?? `因子${index + 1}`),
            cumulativeValue: toNumber(item.cumulativeValue),
            rank: toNumber(item.rank ?? index + 1),
          }))
          .sort((left, right) => left.rank - right.rank)
      : importance.map((item, index) => {
          runningCumulative += item.value
          return {
            name: item.name,
            cumulativeValue: Number(runningCumulative.toFixed(6)),
            rank: index + 1,
          }
        })

  return {
    summary: {
      targetField: String(results.summary?.targetField ?? 'target'),
      sampleCount: toNumber(results.summary?.sampleCount),
      featureCount: toNumber(results.summary?.featureCount ?? importance.length),
      r2: toNumber(results.summary?.r2),
      mae: toNumber(results.summary?.mae),
      nEstimators: toNumber(results.summary?.nEstimators ?? 200),
      maxDepth: toNumber(results.summary?.maxDepth ?? 8),
    },
    importance,
    cumulativeImportance,
    predictions: {
      actual: Array.isArray(results.predictions?.actual)
        ? results.predictions!.actual.map((item) => toNumber(item))
        : [],
      predicted: Array.isArray(results.predictions?.predicted)
        ? results.predictions!.predicted.map((item) => toNumber(item))
        : [],
    },
    risks: Array.isArray(results.risks)
      ? results.risks.map((item) => ({
          code: String(item.code ?? 'analysis_hint'),
          level:
            item.level === 'danger' || item.level === 'warning' || item.level === 'medium'
              ? item.level
              : 'low',
          title: String(item.title ?? '结果解读提示'),
          message: String(item.message ?? ''),
        }))
      : [],
  }
}

const buildImportanceChartOption = (importance: ImportanceItem[]) => ({
  tooltip: {
    trigger: 'axis',
    axisPointer: { type: 'shadow' },
  },
  grid: { top: 20, left: 90, right: 24, bottom: 20, containLabel: true },
  xAxis: {
    type: 'value',
    name: '重要性',
    max: 1,
  },
  yAxis: {
    type: 'category',
    data: importance.map((item) => item.name).reverse(),
  },
  series: [
    {
      name: '特征重要性',
      type: 'bar',
      data: importance
        .map((item) => ({
          value: Number(item.value.toFixed(4)),
          itemStyle: {
            color: '#2563eb',
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

const buildCumulativeChartOption = (items: CumulativeImportanceItem[]) => ({
  tooltip: {
    trigger: 'axis',
  },
  grid: { top: 20, left: 56, right: 20, bottom: 40, containLabel: true },
  xAxis: {
    type: 'category',
    data: items.map((item) => item.name),
    axisLabel: {
      interval: 0,
      rotate: items.length > 5 ? 20 : 0,
    },
  },
  yAxis: {
    type: 'value',
    name: '累计重要性',
    min: 0,
    max: 1,
  },
  series: [
    {
      name: '累计重要性',
      type: 'line',
      smooth: true,
      data: items.map((item) => Number(item.cumulativeValue.toFixed(4))),
      itemStyle: { color: '#0f172a' },
      lineStyle: { color: '#0f172a' },
      areaStyle: { color: 'rgba(15, 23, 42, 0.08)' },
    },
  ],
})

const buildPredictionChartOption = (predictions: PredictionSeries) => ({
  tooltip: { trigger: 'item' },
  grid: { top: 20, left: 56, right: 20, bottom: 40, containLabel: true },
  xAxis: { type: 'value', name: '实际值' },
  yAxis: { type: 'value', name: '预测值' },
  series: [
    {
      name: '样本点',
      type: 'scatter',
      data: predictions.actual.map((value, index) => [value, predictions.predicted[index]]),
      itemStyle: { color: '#2563eb', opacity: 0.75 },
    },
  ],
})

export const randomForestFeatureImportanceNode: NodeDefinition = {
  name: 'random-forest-feature-importance',
  displayName: '随机森林特征重要性',
  icon: 'trees',
  category: 'terminal',
  description: '使用随机森林评估各因子对目标字段的相对重要性，并输出排序、累计贡献和拟合表现。',
  properties: [
    {
      name: 'targetField',
      displayName: '目标变量 (Y)',
      type: 'options',
      default: 'target',
      useUpstreamFactors: true,
      editable: true,
      description: '选择要解释或预测的目标字段。',
    },
    {
      name: 'factorNames',
      displayName: '影响因子 (X)',
      type: 'multi-options',
      default: [],
      useUpstreamFactors: true,
      editable: true,
      forceInput: true,
      description: '选择参与建模的因子列表；留空时默认使用除目标变量外的全部数值字段。',
    },
    {
      name: 'nEstimators',
      displayName: '树数量',
      type: 'number',
      default: 200,
      description: '控制随机森林中的决策树数量，默认 200。',
    },
    {
      name: 'maxDepth',
      displayName: '最大深度',
      type: 'number',
      default: 8,
      description: '限制单棵树的最大深度，避免模型过深导致解释失真。',
    },
  ],
  execute: async (input, config) => {
    const rows = extractTableRows(input)
    if (!rows || rows.length === 0) {
      throw new Error('无输入数据')
    }

    const result = await requestRandomForestFeatureImportanceAnalysis<{
      results?: Partial<RandomForestResults>
    }>({
      data: rows,
      target: config.targetField || 'target',
      config,
    })
    const normalized = normalizeResults(result.results ?? {})

    return createReportResult(
      {
        title: '随机森林特征重要性',
        metadata: normalized.summary,
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
              { label: 'MAE', value: normalized.summary.mae },
              { label: '树数量', value: normalized.summary.nEstimators },
              { label: '最大深度', value: normalized.summary.maxDepth },
            ],
          },
          {
            key: 'importance',
            title: '特征重要性排行',
            type: 'chart',
            option: buildImportanceChartOption(normalized.importance),
            items: normalized.importance,
          },
          {
            key: 'cumulative-importance',
            title: '累计重要性',
            type: 'chart',
            option: buildCumulativeChartOption(normalized.cumulativeImportance),
            items: normalized.cumulativeImportance,
          },
          {
            key: 'predictions',
            title: '预测值对比',
            type: 'chart',
            option: buildPredictionChartOption(normalized.predictions),
          },
          {
            key: 'risks',
            title: '结果解读提示',
            type: 'risk-list',
            items: normalized.risks,
          },
        ],
      },
      {
        meta: {
          sourceData: rows,
          metrics: normalized.summary,
          importance: normalized.importance,
          cumulativeImportance: normalized.cumulativeImportance,
          predictions: normalized.predictions,
          risks: normalized.risks,
        },
      },
    )
  },
}
