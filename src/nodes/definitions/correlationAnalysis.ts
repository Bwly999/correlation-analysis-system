import type { NodeDefinition } from '../types'
import { createReportResult, type NodeResult } from '../result'
import {
  correlationMethodMeta,
  executeCorrelationAnalysis,
  type CorrelationMethod,
} from './correlation/shared'

type CorrelationAnalysisConfig = {
  method?: CorrelationMethod
  // 兼容旧草稿中的多选配置，执行时只取第一个有效方法。
  methods?: CorrelationMethod[]
  xFields?: string[]
  yFields?: string[]
  heatmapTopN?: number
  rankingTopN?: number
}

const DEFAULT_METHOD: CorrelationMethod = 'pearson'
const ALL_METHODS: CorrelationMethod[] = ['pearson', 'spearman', 'kendall']

const normalizeMethod = (config: CorrelationAnalysisConfig): CorrelationMethod => {
  if (config.method && ALL_METHODS.includes(config.method)) {
    return config.method
  }

  const legacyMethod = Array.isArray(config.methods)
    ? config.methods.find((item): item is CorrelationMethod => ALL_METHODS.includes(item))
    : undefined

  return legacyMethod ?? DEFAULT_METHOD
}

const methodOptions = ALL_METHODS.map((method) => ({
  name: correlationMethodMeta[method].displayName,
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
  displayName: '单调性分析',
  icon: 'chart-line',
  category: 'terminal',
  description: '分析因子与目标值的单调性关系。',
  properties: [
    {
      name: 'method',
      displayName: '分析方法',
      type: 'options',
      default: DEFAULT_METHOD,
      options: methodOptions,
      description: '默认使用 Pearson；Spearman 适合单调关系，Kendall 更适合小样本或排序一致性验证。',
    },
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
    const method = normalizeMethod(config)
    const result = (await executeCorrelationAnalysis(method, input, config)) as NodeResult<Record<string, any>>
    return createReportResult(
      {
        ...(result.payload ?? {}),
        title: '单调性分析',
        metadata: {
          ...((result.payload?.metadata as Record<string, unknown> | undefined) ?? {}),
          method,
        },
      },
      {
        meta: {
          ...(result.meta ?? {}),
          metrics: {
            ...((result.meta?.metrics as Record<string, unknown> | undefined) ?? {}),
            method,
          },
        },
      },
    )
  },
}
