import type { NodeDefinition } from '../types'
import { createReportResult, extractTableRows } from '../result'
import { requestXgboostShapAnalysis } from '@/services/analysis'

type ShapSummary = {
  targetField: string
  sampleCount: number
  featureCount: number
  r2: number
  mae: number
}

type ShapImportanceItem = {
  name: string
  value: number
  rank?: number
}

type ShapDependenceItem = {
  feature: string
  x: number[]
  shap: number[]
  actualY?: number[]
}

type ShapAssets = {
  beeswarmImage?: string
  fullReportImage?: string
  dependenceImages?: Array<{ feature: string; image: string }>
}

const SHAP_PRIMARY_COLOR = '#ff0052'
const SHAP_SECONDARY_COLOR = '#2563eb'
const DEFAULT_VISIBLE_FEATURES = 6
const DEFAULT_IMPORTANCE_LIMIT = 15
const DEFAULT_MAX_DEPENDENCE_PLOTS = 8

const asImageDataUrl = (value?: string) => {
  if (!value) return undefined
  return value.startsWith('data:') ? value : `data:image/png;base64,${value}`
}

const normalizeImportance = (importance: ShapImportanceItem[] = []) => {
  return importance
    .map((item, index) => ({
      name: item.name,
      value: Number(item.value ?? 0),
      rank: item.rank ?? index + 1,
    }))
    .sort((a, b) => b.value - a.value)
    .map((item, index) => ({ ...item, rank: index + 1 }))
}

const normalizeDependence = (dependence: ShapDependenceItem[] = []) => {
  return dependence.map((item) => ({
    feature: item.feature,
    x: Array.isArray(item.x) ? item.x : [],
    shap: Array.isArray(item.shap) ? item.shap : [],
    actualY: Array.isArray(item.actualY) ? item.actualY : [],
  }))
}

const buildLegacyPayload = (results: Record<string, any>) => {
  const importance = normalizeImportance(results.importance ?? [])
  const dependence = normalizeDependence(results.dependence ?? results.raw_dependence_data ?? [])

  const summary: ShapSummary = {
    targetField: results.targetField ?? 'target',
    sampleCount: dependence[0]?.x.length ?? 0,
    featureCount: importance.length,
    r2: Number(results.r2 ?? 0),
    mae: Number(results.mae ?? 0),
  }

  const assets: ShapAssets = {
    beeswarmImage: results.beeswarm_image,
    fullReportImage: results.full_report_image,
    dependenceImages: results.dependence_images ?? [],
  }

  return { summary, importance, dependence, assets }
}

const buildImportanceChartOption = (importance: Array<{ name: string; value: number }>) => {
  const visible = importance.slice(0, DEFAULT_IMPORTANCE_LIMIT)
  return {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
    xAxis: { type: 'value', name: '平均绝对 SHAP 值' },
    yAxis: {
      type: 'category',
      data: visible.map((item) => item.name).reverse(),
    },
    series: [
      {
        name: 'Mean |SHAP Value|',
        type: 'bar',
        data: visible.map((item) => item.value).reverse(),
        itemStyle: {
          color: SHAP_PRIMARY_COLOR,
          borderRadius: [0, 4, 4, 0],
        },
      },
    ],
  }
}

const buildScatterOption = (item: ShapDependenceItem) => ({
  title: { text: `因子趋势: ${item.feature}`, textStyle: { fontSize: 14 } },
  tooltip: { trigger: 'item' },
  xAxis: { type: 'value', name: item.feature, nameLocation: 'middle', nameGap: 25 },
  yAxis: { type: 'value', name: 'SHAP Value' },
  series: [
    {
      name: item.feature,
      type: 'scatter',
      symbolSize: 6,
      data: item.x.map((xValue, index) => [xValue, item.shap[index]]),
      itemStyle: { color: SHAP_SECONDARY_COLOR, opacity: 0.65 },
    },
  ],
})

export const xgboostShapNode: NodeDefinition = {
  name: 'xgboost-shap',
  displayName: 'Xgboost + SHAP',
  icon: 'brain',
  category: 'terminal',
  description: '使用 Xgboost 结合 SHAP 值分析各个因子对目标变量的贡献程度和影响趋势。',
  properties: [
    {
      name: 'targetField',
      displayName: '目标变量 (Y)',
      type: 'options',
      default: 'target',
      useUpstreamFactors: true,
      editable: true,
      description: '选择回归任务的目标字段名称，支持从上游自动获取。',
    },
    {
      name: 'factorNames',
      displayName: '影响因子 (X)',
      type: 'multi-options',
      default: [],
      useUpstreamFactors: true,
      editable: true,
      forceInput: true,
      description: '选择参与分析的因子列表；留空时默认使用除目标变量外的全部数值字段。',
    },
    {
      name: 'maxDependencePlots',
      displayName: '依赖图数量上限',
      type: 'number',
      default: DEFAULT_MAX_DEPENDENCE_PLOTS,
      description: '限制生成的因子趋势图数量，默认取 SHAP 重要性最高的前 8 个，避免图片过多影响速度和存储。',
    },
  ],
  execute: async (input, config) => {
    const rows = extractTableRows(input)
    if (!rows || rows.length === 0) {
      throw new Error('无输入数据')
    }

    const result = await requestXgboostShapAnalysis<{ results?: Record<string, any> }>({
      data: rows,
      target: config.targetField || 'target',
      config,
    })
    const normalized = result.results?.summary
      ? {
          summary: result.results.summary as ShapSummary,
          importance: normalizeImportance(result.results.importance ?? []),
          dependence: normalizeDependence(result.results.dependence ?? []),
          assets: (result.results.assets ?? {}) as ShapAssets,
        }
      : buildLegacyPayload(result.results ?? {})

    const { summary, importance, dependence, assets } = normalized
    return createReportResult(
      {
        title: 'Xgboost + SHAP 因子贡献度分析报告',
        metadata: {
          targetField: summary.targetField,
          sampleCount: summary.sampleCount,
          featureCount: summary.featureCount || importance.length,
          r2: summary.r2,
          mae: summary.mae,
        },
        sections: [
          {
            key: 'summary',
            type: 'summary',
            title: '模型摘要',
            cards: [
              { label: '目标字段', value: summary.targetField },
              { label: '样本量', value: summary.sampleCount },
              { label: '特征数', value: summary.featureCount || importance.length },
              { label: 'R²', value: summary.r2 },
              { label: 'MAE', value: summary.mae },
            ],
            help: {
              summary: '展示 SHAP 建模的目标、样本和拟合质量，用来判断贡献解释是否可信。',
              howToRead: ['先看 R²、MAE 和样本量，再阅读特征贡献排行和趋势明细。'],
            },
          },
          {
            key: 'importance',
            type: 'chart',
            title: '特征贡献排行',
            option: buildImportanceChartOption(importance),
            items: importance,
            help: {
              summary: '按平均 SHAP 绝对值展示每个因子对模型预测的总体贡献。',
              howToRead: ['排行越靠前，代表该因子越常影响模型预测；再进入趋势明细判断高低取值如何影响 Y。'],
              cautions: ['贡献度不等于因果，且平均绝对值本身不表示正向或负向。'],
            },
          },
          {
            key: 'dependence',
            type: 'dependence',
            title: '因子趋势明细',
            defaultVisibleCount: DEFAULT_VISIBLE_FEATURES,
            items: dependence.map((item) => ({
              feature: item.feature,
              title: `因子趋势: ${item.feature}`,
              option: buildScatterOption(item),
            })),
            help: {
              summary: '展示单个因子取值与 SHAP 贡献之间的关系，用来判断可能的影响方向和非线性区间。',
              howToRead: ['横轴看因子取值，纵轴看对预测的正负贡献；明显拐点可作为设计阈值候选。'],
              cautions: ['趋势来自模型解释，仍需结合实验、业务机理或回归结果确认。'],
            },
          },
        ],
        supplements: {
          beeswarmImage: asImageDataUrl(assets.beeswarmImage),
          fullReportImage: asImageDataUrl(assets.fullReportImage),
          dependenceImages: (assets.dependenceImages ?? []).map((item) => ({
            feature: item.feature,
            image: asImageDataUrl(item.image),
          })),
        },
      },
      {
        meta: {
          sourceData: rows,
          metrics: {
            targetField: summary.targetField,
            sampleCount: summary.sampleCount,
            featureCount: summary.featureCount || importance.length,
            r2: summary.r2,
            mae: summary.mae,
          },
        },
      },
    )
  },
}
