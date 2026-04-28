import type { NodeDefinition } from '../types'
import { createReportResult, type NodeResult } from '../result'
import {
  correlationMethodMeta,
  executeCorrelationAnalysis,
  type CorrelationMethod,
} from './correlation/shared'

type CorrelationAnalysisConfig = {
  xFields?: string[]
  yFields?: string[]
  methods?: CorrelationMethod[]
  heatmapTopN?: number
  rankingTopN?: number
}

const DEFAULT_METHODS: CorrelationMethod[] = ['pearson', 'spearman']
const ALL_METHODS: CorrelationMethod[] = ['pearson', 'spearman', 'kendall']

const normalizeMethods = (value: unknown): CorrelationMethod[] => {
  const methods = Array.isArray(value)
    ? value.filter((item): item is CorrelationMethod => ALL_METHODS.includes(item))
    : []

  return methods.length > 0 ? [...new Set(methods)] : DEFAULT_METHODS
}

const methodOptions = ALL_METHODS.map((method) => ({
  label: correlationMethodMeta[method].displayName,
  value: method,
}))

const prefixMethodSections = (
  method: CorrelationMethod,
  sections: Array<Record<string, unknown>>,
) =>
  sections.map((section) => ({
    ...section,
    key: `${method}-${String(section.key ?? section.title ?? 'section')}`,
    title: `${correlationMethodMeta[method].displayName} - ${String(section.title ?? '分析结果')}`,
  }))

export const correlationAnalysisNode: NodeDefinition<unknown, CorrelationAnalysisConfig> = {
  name: 'correlation-analysis',
  displayName: '相关性分析',
  icon: 'grid',
  category: 'terminal',
  description: '统一执行 Pearson、Spearman 和 Kendall 相关性分析，用于排查 X 与 Y 的线性、单调或排序关系。',
  properties: [
    {
      name: 'xFields',
      displayName: 'X 字段',
      type: 'multi-options',
      default: [],
      useUpstreamFactors: true,
      editable: true,
      forceInput: true,
      required: true,
      description: '选择参与相关性计算的候选因子字段。',
    },
    {
      name: 'yFields',
      displayName: 'Y 字段',
      type: 'multi-options',
      default: [],
      useUpstreamFactors: true,
      editable: true,
      forceInput: true,
      required: true,
      description: '选择需要分析关联关系的目标字段，可同时选择多个 Y。',
    },
    {
      name: 'methods',
      displayName: '分析方法',
      type: 'multi-options',
      default: DEFAULT_METHODS,
      options: methodOptions,
      description: '默认同时运行 Pearson 和 Spearman；Kendall 更适合小样本或排序一致性验证。',
    },
    {
      name: 'heatmapTopN',
      displayName: '热力图显示因子数',
      type: 'number',
      default: 8,
      description: '每种方法的热力图按最大绝对相关值展示前 N 个 X 字段。',
    },
    {
      name: 'rankingTopN',
      displayName: '排行图显示因子数',
      type: 'number',
      default: 8,
      description: '每个 Y 字段按相关绝对值筛选重点因子后展示前 N 个 X 字段。',
    },
  ],
  execute: async (input, config) => {
    const methods = normalizeMethods(config.methods)
    const methodResults = await Promise.all(
      methods.map(async (method) => ({
        method,
        result: (await executeCorrelationAnalysis(method, input, config)) as NodeResult<Record<string, any>>,
      })),
    )

    if (methodResults.length === 1) {
      const only = methodResults[0]!
      return createReportResult(
        {
          ...(only.result.payload ?? {}),
          title: '相关性分析',
          metadata: {
            ...((only.result.payload?.metadata as Record<string, unknown> | undefined) ?? {}),
            methods,
          },
        },
        {
          meta: {
            ...(only.result.meta ?? {}),
            metrics: {
              ...((only.result.meta?.metrics as Record<string, unknown> | undefined) ?? {}),
              methods,
            },
          },
        },
      )
    }

    const firstMetrics = (methodResults[0]?.result.meta?.metrics ?? {}) as Record<string, unknown>
    const sections = methodResults.flatMap(({ method, result }) =>
      prefixMethodSections(
        method,
        Array.isArray(result.payload.sections) ? result.payload.sections : [],
      ),
    )
    const methodLabels = methods
      .map((method) => correlationMethodMeta[method].displayName)
      .join('、')

    return createReportResult(
      {
        title: '相关性分析',
        metadata: {
          methods,
          xFields: firstMetrics.xFields,
          yFields: firstMetrics.yFields,
        },
        sections: [
          {
            key: 'summary',
            type: 'summary',
            title: '分析摘要',
            cards: [
              { label: '分析方法', value: methodLabels },
              { label: '样本行数', value: firstMetrics.rowCount ?? '-' },
              { label: 'X 字段数', value: firstMetrics.xFieldCount ?? '-' },
              { label: 'Y 字段数', value: firstMetrics.yFieldCount ?? '-' },
              { label: '数值字段数', value: firstMetrics.numericFieldCount ?? '-' },
            ],
            content:
              '本报告把多个相关性方法整合到同一个结果中。Pearson 关注线性关系，Spearman 关注单调关系，Kendall 更适合小样本或排序一致性判断。',
            help: {
              summary: '整体对比多个相关性方法的分析范围和样本基础，帮助判断结果是否需要交叉验证。',
              howToRead: ['优先确认实际运行的方法、样本行数、X 字段数和 Y 字段数，再比较不同方法的排行是否一致。'],
              cautions: ['不同方法关注的关系类型不同，结论不一致时应回到散点图、回归或业务机理继续验证。'],
            },
          },
          ...sections,
        ],
      },
      {
        meta: {
          metrics: {
            ...firstMetrics,
            methods,
          },
          methodResults: Object.fromEntries(
            methodResults.map(({ method, result }) => [method, result.meta]),
          ),
        },
      },
    )
  },
}
