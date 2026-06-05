import type { NodeDefinition } from '../types'
import { createReportResult, extractTableRows } from '../result'
import { trimAnalysisPayload } from '../analysisTrim'
import { requestRandomForestFeatureImportanceAnalysis } from '@/services/analysis'
import { buildRegressionFitChartOption } from './regressionFitChart'

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
      description: '选择参与建模的因子列表；请先显式选择字段，留空将无法执行分析。',
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

    const trimmedData = trimAnalysisPayload({
      rows,
      targetField: config.targetField || 'target',
      factorNames: config.factorNames ?? [],
    })

    const result = await requestRandomForestFeatureImportanceAnalysis<{
      results?: Partial<RandomForestResults>
    }>({
      data: trimmedData,
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
            help: {
              summary: '展示随机森林模型的样本、特征和拟合质量，用来判断本次重要性排序是否具备参考基础。',
              howToRead: ['先看 R² 和 MAE 判断模型是否能解释 Y，再看样本量和特征数是否足够支撑排序。'],
              cautions: ['模型拟合较弱时，重要性排序只能作为探索线索，不适合作为拦截规则依据。'],
            },
          },
          {
            key: 'importance',
            title: '特征重要性排行',
            type: 'chart',
            option: buildImportanceChartOption(normalized.importance),
            items: normalized.importance,
            help: {
              summary: '按随机森林对预测误差的贡献排序，帮助确定哪些因子值得优先关注。',
              howToRead: ['条形越长表示该因子越能提升模型预测 Y 的能力，可用于缩小关键因子排查范围。'],
              cautions: ['重要性高不等于正向影响，也不等于因果；若要判断调高或调低方向，请结合 SHAP、相关性或回归系数。'],
            },
          },
          {
            key: 'cumulative-importance',
            title: '累计重要性',
            type: 'chart',
            option: buildCumulativeChartOption(normalized.cumulativeImportance),
            items: normalized.cumulativeImportance,
            help: {
              summary: '展示从高到低累计覆盖了多少模型重要性，用来判断少数因子是否已解释主要预测贡献。',
              howToRead: ['观察曲线达到 80% 或 90% 时需要多少个因子，数量越少说明头部因子越集中。'],
              cautions: ['累计覆盖率是模型内部贡献分布，不等于业务上只控制这些因子就一定能改变 Y。'],
            },
          },
          {
            key: 'predictions',
            title: '预测值对比',
            type: 'chart',
            option: buildRegressionFitChartOption(normalized.predictions),
            help: {
              summary: '对比模型预测值和真实 Y，验证重要性排序背后的模型是否真的能预测目标。',
              howToRead: ['点越贴近理想拟合线，说明模型预测越稳定；系统性偏离代表模型仍缺关键变量或关系未学到。'],
            },
          },
          {
            key: 'risks',
            title: '结果解读提示',
            type: 'risk-list',
            items: normalized.risks,
            help: {
              summary: '提示随机森林重要性排序中可能导致误读的集中度、样本或模型风险。',
              howToRead: ['先处理高风险提示，再把高重要性因子交给 SHAP、相关性或回归节点确认方向和稳定性。'],
            },
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
