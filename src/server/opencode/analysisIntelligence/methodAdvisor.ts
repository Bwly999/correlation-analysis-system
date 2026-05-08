import type { AgenticDataProfile } from './dataProfile.js'

export type AgenticMethodRecommendation = {
  method: string
  nodeTypes: string[]
  reason: string
  priority: 'primary' | 'secondary'
}

export type AgenticMethodAdvice = {
  recommended: AgenticMethodRecommendation[]
  risks: string[]
  preprocessingSuggestions: string[]
}

const findField = (profile: AgenticDataProfile, name: string) =>
  profile.fields.find((field) => field.name === name)

const hasNumericFeatures = (profile: AgenticDataProfile) =>
  profile.candidateFeatureColumns.some((name) => findField(profile, name)?.type === 'numeric')

export const recommendAnalysisMethods = (profile: AgenticDataProfile): AgenticMethodAdvice => {
  const targetName = profile.candidateTargetColumns[0]
  const targetField = targetName ? findField(profile, targetName) : null
  const recommended: AgenticMethodRecommendation[] = []
  const risks: string[] = []
  const preprocessingSuggestions: string[] = []

  if (profile.rowCount < 30) {
    risks.push('样本量偏少，统计结论稳定性较弱')
  }

  for (const field of profile.fields) {
    if (field.missingRate >= 0.3) {
      preprocessingSuggestions.push(`字段 ${field.name} 缺失率较高，建议先进行缺失值处理`)
    }
  }

  if (targetField?.type === 'numeric' && hasNumericFeatures(profile)) {
    recommended.push(
      {
        method: 'Pearson 相关系数',
        nodeTypes: ['pearson'],
        reason: '目标字段和候选因子均包含数值字段，适合先检查线性相关强度。',
        priority: 'primary',
      },
      {
        method: 'Spearman 相关系数',
        nodeTypes: ['spearman'],
        reason: '可补充识别单调但非线性的相关关系。',
        priority: 'secondary',
      },
      {
        method: '多元线性回归',
        nodeTypes: ['multiple-linear-regression'],
        reason: '适合量化多个因子对数值目标的方向和幅度。',
        priority: 'primary',
      },
      {
        method: '随机森林特征重要度',
        nodeTypes: ['random-forest-feature-importance'],
        reason: '适合补充识别非线性影响和变量重要性排序。',
        priority: 'secondary',
      },
    )
  } else if (targetField?.type === 'categorical') {
    recommended.push(
      {
        method: '逻辑回归分类',
        nodeTypes: ['logistic-regression-classification'],
        reason: '目标字段为分类变量，适合判断候选因子对分类结果的影响。',
        priority: 'primary',
      },
      {
        method: '分组对比',
        nodeTypes: ['group-by-summary'],
        reason: '可先按分类目标对数值因子做描述性对比。',
        priority: 'secondary',
      },
    )
  }

  if (!recommended.length) {
    risks.push('暂未识别到足够清晰的目标字段和候选因子，需要用户补充分析口径')
  }

  return {
    recommended,
    risks,
    preprocessingSuggestions,
  }
}
