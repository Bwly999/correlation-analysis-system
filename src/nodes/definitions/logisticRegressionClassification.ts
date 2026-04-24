import type { NodeDefinition } from '../types'
import { createReportResult, extractTableRows } from '../result'
import { requestLogisticRegressionClassificationAnalysis } from '@/services/analysis'

type LogisticRegressionClassificationConfig = {
  targetField?: string
  factorNames?: string[]
  testSize?: number
  regularizationStrength?: number
  maxIterations?: number
}

type ClassificationSummary = {
  targetField: string
  sampleCount: number
  featureCount: number
  classCount: number
  accuracy: number
  macroF1: number
  auc?: number | null
}

type ClassificationMetrics = {
  accuracy: number
  precision?: number
  recall?: number
  f1?: number
  macroPrecision: number
  macroRecall: number
  macroF1: number
  auc?: number | null
}

type ConfusionMatrix = {
  labels: string[]
  matrix: number[][]
}

type RocCurve = {
  fpr: number[]
  tpr: number[]
} | null

type CoefficientItem = {
  feature: string
  className: string
  coefficient: number
  oddsRatio: number
  rank: number
}

type ClassificationRisk = {
  code: string
  level: 'low' | 'medium' | 'warning' | 'danger'
  title: string
  message: string
}

type LogisticRegressionClassificationResults = {
  summary: ClassificationSummary
  metrics: ClassificationMetrics
  confusionMatrix: ConfusionMatrix
  rocCurve: RocCurve
  coefficients: CoefficientItem[]
  risks: ClassificationRisk[]
}

const toNumber = (value: unknown) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

const normalizeResults = (
  results: Partial<LogisticRegressionClassificationResults>,
): LogisticRegressionClassificationResults => ({
  summary: {
    targetField: String(results.summary?.targetField ?? 'target'),
    sampleCount: toNumber(results.summary?.sampleCount),
    featureCount: toNumber(results.summary?.featureCount),
    classCount: toNumber(results.summary?.classCount),
    accuracy: toNumber(results.summary?.accuracy),
    macroF1: toNumber(results.summary?.macroF1),
    auc: results.summary?.auc == null ? null : toNumber(results.summary.auc),
  },
  metrics: {
    accuracy: toNumber(results.metrics?.accuracy),
    precision: results.metrics?.precision == null ? undefined : toNumber(results.metrics.precision),
    recall: results.metrics?.recall == null ? undefined : toNumber(results.metrics.recall),
    f1: results.metrics?.f1 == null ? undefined : toNumber(results.metrics.f1),
    macroPrecision: toNumber(results.metrics?.macroPrecision),
    macroRecall: toNumber(results.metrics?.macroRecall),
    macroF1: toNumber(results.metrics?.macroF1),
    auc: results.metrics?.auc == null ? null : toNumber(results.metrics.auc),
  },
  confusionMatrix: {
    labels: Array.isArray(results.confusionMatrix?.labels)
      ? results.confusionMatrix!.labels.map((label) => String(label))
      : [],
    matrix: Array.isArray(results.confusionMatrix?.matrix)
      ? results.confusionMatrix!.matrix.map((row) => row.map((value) => toNumber(value)))
      : [],
  },
  rocCurve:
    results.rocCurve && Array.isArray(results.rocCurve.fpr) && Array.isArray(results.rocCurve.tpr)
      ? {
          fpr: results.rocCurve.fpr.map((value) => toNumber(value)),
          tpr: results.rocCurve.tpr.map((value) => toNumber(value)),
        }
      : null,
  coefficients: Array.isArray(results.coefficients)
    ? results.coefficients
        .map((item, index) => ({
          feature: String(item.feature ?? `因子${index + 1}`),
          className: String(item.className ?? 'positive'),
          coefficient: toNumber(item.coefficient),
          oddsRatio: toNumber(item.oddsRatio),
          rank: toNumber(item.rank ?? index + 1),
        }))
        .sort((left, right) => Math.abs(right.coefficient) - Math.abs(left.coefficient))
        .map((item, index) => ({ ...item, rank: index + 1 }))
    : [],
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
})

const buildConfusionMatrixOption = (matrix: ConfusionMatrix) => ({
  tooltip: { trigger: 'item' },
  grid: { top: 30, left: 80, right: 20, bottom: 50 },
  xAxis: {
    type: 'category',
    data: matrix.labels,
    name: '预测标签',
  },
  yAxis: {
    type: 'category',
    data: matrix.labels,
    name: '真实标签',
  },
  visualMap: {
    min: 0,
    max: Math.max(...matrix.matrix.flat(), 1),
    calculable: false,
    orient: 'horizontal',
    left: 'center',
    bottom: 0,
  },
  series: [
    {
      type: 'heatmap',
      data: matrix.matrix.flatMap((row, rowIndex) =>
        row.map((value, columnIndex) => [columnIndex, rowIndex, value]),
      ),
      label: {
        show: true,
      },
      itemStyle: {
        borderWidth: 1,
        borderColor: '#e2e8f0',
      },
    },
  ],
})

const buildRocOption = (rocCurve: Exclude<RocCurve, null>) => ({
  tooltip: { trigger: 'axis' },
  grid: { top: 20, left: 56, right: 20, bottom: 40, containLabel: true },
  xAxis: { type: 'value', min: 0, max: 1, name: 'FPR' },
  yAxis: { type: 'value', min: 0, max: 1, name: 'TPR' },
  series: [
    {
      type: 'line',
      smooth: true,
      data: rocCurve.fpr.map((value, index) => [value, rocCurve.tpr[index] ?? 0]),
      itemStyle: { color: '#2563eb' },
      lineStyle: { color: '#2563eb' },
    },
  ],
})

const buildCoefficientOption = (coefficients: CoefficientItem[]) => ({
  tooltip: {
    trigger: 'axis',
    axisPointer: { type: 'shadow' },
  },
  grid: { top: 20, left: 120, right: 20, bottom: 20, containLabel: true },
  xAxis: { type: 'value', name: '系数' },
  yAxis: {
    type: 'category',
    data: coefficients.map((item) => `${item.feature} / ${item.className}`).reverse(),
  },
  series: [
    {
      type: 'bar',
      data: coefficients
        .map((item) => ({
          value: Number(item.coefficient.toFixed(4)),
          itemStyle: {
            color: item.coefficient >= 0 ? '#2563eb' : '#ef4444',
            borderRadius: [0, 4, 4, 0],
          },
        }))
        .reverse(),
    },
  ],
})

export const logisticRegressionClassificationNode: NodeDefinition<
  unknown,
  LogisticRegressionClassificationConfig
> = {
  name: 'logistic-regression-classification',
  displayName: '逻辑回归分类分析',
  icon: 'waypoints',
  category: 'terminal',
  description: '针对二分类或多分类标签执行逻辑回归分类分析，输出分类指标、混淆矩阵和因子解释。',
  properties: [
    {
      name: 'targetField',
      displayName: '目标标签 (Y)',
      type: 'options',
      default: '',
      useUpstreamFactors: true,
      editable: true,
      description: '选择需要分类解释的标签字段。',
    },
    {
      name: 'factorNames',
      displayName: '影响因子 (X)',
      type: 'multi-options',
      default: [],
      useUpstreamFactors: true,
      editable: true,
      forceInput: true,
      description: '选择参与逻辑回归分类分析的多个因子。',
    },
    {
      name: 'testSize',
      displayName: '测试集占比',
      type: 'number',
      default: 0.2,
      description: '控制训练/测试集切分比例，默认 0.2。',
    },
    {
      name: 'regularizationStrength',
      displayName: '正则化强度',
      type: 'number',
      default: 1,
      description: '对应逻辑回归中的 C 参数，值越大正则化越弱。',
    },
    {
      name: 'maxIterations',
      displayName: '最大迭代次数',
      type: 'number',
      default: 1000,
      description: '当模型较难收敛时可适当增大。',
    },
  ],
  execute: async (input, config) => {
    const rows = extractTableRows(input)
    if (!rows || rows.length === 0) {
      throw new Error('无输入数据')
    }

    const result = await requestLogisticRegressionClassificationAnalysis<{
      results?: Partial<LogisticRegressionClassificationResults>
    }>({
      data: rows,
      target: config.targetField || 'target',
      config,
    })
    const normalized = normalizeResults(result.results ?? {})

    return createReportResult(
      {
        title: '逻辑回归分类分析',
        metadata: normalized.summary,
        sections: [
          {
            key: 'summary',
            type: 'summary',
            title: '模型摘要',
            cards: [
              { label: '目标标签', value: normalized.summary.targetField },
              { label: '样本量', value: normalized.summary.sampleCount },
              { label: '特征数', value: normalized.summary.featureCount },
              { label: '类别数', value: normalized.summary.classCount },
            ],
          },
          {
            key: 'metrics',
            type: 'summary',
            title: '分类指标',
            cards: [
              { label: 'Accuracy', value: normalized.metrics.accuracy },
              { label: 'Precision', value: normalized.metrics.precision ?? '-' },
              { label: 'Recall', value: normalized.metrics.recall ?? '-' },
              { label: 'F1', value: normalized.metrics.f1 ?? '-' },
              { label: 'Macro Precision', value: normalized.metrics.macroPrecision },
              { label: 'Macro Recall', value: normalized.metrics.macroRecall },
              { label: 'Macro F1', value: normalized.metrics.macroF1 },
              { label: 'AUC', value: normalized.metrics.auc ?? '-' },
            ],
          },
          {
            key: 'confusion-matrix',
            title: '混淆矩阵',
            type: 'chart',
            option: buildConfusionMatrixOption(normalized.confusionMatrix),
          },
          {
            key: 'roc',
            title: 'ROC 曲线',
            type: 'chart',
            option: normalized.rocCurve
              ? buildRocOption(normalized.rocCurve)
              : {
                  title: { text: '当前为多分类任务，ROC 曲线仅在二分类场景展示。' },
                  xAxis: { type: 'value' },
                  yAxis: { type: 'value' },
                  series: [{ type: 'line', data: [] }],
                },
          },
          {
            key: 'coefficients',
            title: '系数解释',
            type: 'chart',
            option: buildCoefficientOption(normalized.coefficients),
            items: normalized.coefficients,
          },
          {
            key: 'risks',
            title: '结果可信提示',
            type: 'risk-list',
            items: normalized.risks,
          },
        ],
      },
      {
        meta: {
          metrics: normalized.summary,
          confusionMatrix: normalized.confusionMatrix,
          rocCurve: normalized.rocCurve,
          coefficients: normalized.coefficients,
          risks: normalized.risks,
        },
      },
    )
  },
}
