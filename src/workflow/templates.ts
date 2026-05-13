import type { Edge } from '@vue-flow/core'
import correlationAnalysisWorkflow from './template-configs/correlation-analysis.json'
import dashboardComparisonWorkflow from './template-configs/dashboard-comparison.json'
import factorScreeningWorkflow from './template-configs/factor-screening.json'
import variableExplanationWorkflow from './template-configs/variable-explanation.json'
import type { WorkflowNodeSnapshot } from '@/utils/storage'

export interface WorkflowTemplateJsonDefinition {
  name: string
  nodes: WorkflowNodeSnapshot[]
  edges: Edge[]
}

export interface WorkflowTemplateDefinition {
  id: string
  name: string
  categoryLabel: string
  outcomeTitle: string
  outcomeSummary: string
  description: string
  bestFor: string
  keyResults: string[]
  keyNodes: string[]
  theme: 'insight' | 'ranking' | 'explanation' | 'comparison'
  recommendedNextStep: string
  dataSourceHint: string
  workflow: WorkflowTemplateJsonDefinition
}

const manualJsonSourceHint =
  '默认先用手动 JSON 输入保障可直接运行；手动 JSON 输入可随时替换为文件导入或看板数据获取节点。'

const cloneTemplateWorkflow = (
  workflow: WorkflowTemplateJsonDefinition,
): WorkflowTemplateJsonDefinition => JSON.parse(JSON.stringify(workflow)) as WorkflowTemplateJsonDefinition

export const workflowTemplateDefinitions: WorkflowTemplateDefinition[] = [
  {
    id: 'correlation-analysis',
    name: '相关性排查模板',
    categoryLabel: '相关性诊断',
    outcomeTitle: '快速看出哪些指标最相关',
    outcomeSummary: '优先产出相关性排序、显著性判断和热力图线索，帮助你先完成第一轮排查。',
    description: '使用手动样例数据、字段筛选和 Pearson 相关性节点，开箱即可跑通第一轮相关性分析。',
    bestFor: '适合第一次先找变量关系、快速筛掉弱相关组合的场景。',
    keyResults: ['相关性排序', '显著性提示', '热力图线索'],
    keyNodes: ['手动输入数据', '字段筛选', 'Pearson 相关性'],
    theme: 'insight',
    recommendedNextStep: '先直接运行看默认结果，再把手动 JSON 输入替换成你的真实数据源。',
    dataSourceHint: manualJsonSourceHint,
    workflow: cloneTemplateWorkflow(correlationAnalysisWorkflow as WorkflowTemplateJsonDefinition),
  },
  {
    id: 'factor-screening',
    name: '关键因子筛选模板',
    categoryLabel: '因子筛选',
    outcomeTitle: '找出最值得优先关注的关键因子',
    outcomeSummary: '重点给出特征重要性排序，让你先知道哪些候选因子最值得继续分析和验证。',
    description: '使用手动样例数据快速进入随机森林特征重要性分析，便于先验证目标字段和候选因子配置。',
    bestFor: '适合候选字段较多、需要先压缩分析范围的场景。',
    keyResults: ['重要性排名', '高价值因子', '筛选优先级'],
    keyNodes: ['手动输入数据', '字段筛选', '随机森林重要性'],
    theme: 'ranking',
    recommendedNextStep: '先直接跑通默认样例，再替换为真实数据并确认目标字段和候选因子。',
    dataSourceHint: manualJsonSourceHint,
    workflow: cloneTemplateWorkflow(factorScreeningWorkflow as WorkflowTemplateJsonDefinition),
  },
  {
    id: 'variable-explanation',
    name: '变量解释分析模板',
    categoryLabel: '变量解释',
    outcomeTitle: '解释哪些变量在真正推动结果变化',
    outcomeSummary: '优先输出变量贡献解释和方向判断，帮助你把“结果出现了”说清楚。',
    description: '使用手动样例数据和 Xgboost + SHAP，先把变量解释链路跑通，再切换到真实业务数据。',
    bestFor: '适合已经有明确目标指标，想进一步解释模型判断依据的场景。',
    keyResults: ['变量贡献解释', '影响方向', '重点解释报告'],
    keyNodes: ['手动输入数据', '字段筛选', 'XGBoost SHAP'],
    theme: 'explanation',
    recommendedNextStep: '先验证默认样例输出，再替换目标字段和样本数据，观察因子贡献是否符合预期。',
    dataSourceHint: manualJsonSourceHint,
    workflow: cloneTemplateWorkflow(variableExplanationWorkflow as WorkflowTemplateJsonDefinition),
  },
  {
    id: 'dashboard-comparison',
    name: '看板数据对比分析模板',
    categoryLabel: '对比展示',
    outcomeTitle: '把关键指标差异直接变成对比图',
    outcomeSummary: '先产出聚合后的对比结果，再直接在结果预览里查看默认对比图，让不同分组的变化一眼可见。',
    description: '使用手动样例数据完成分组聚合，适合先验证对比链路，并通过结果预览直接查看默认图表。',
    bestFor: '适合要先给业务看趋势差异、结构差异和看板结论的场景。',
    keyResults: ['分组对比图', '聚合结果', '趋势变化'],
    keyNodes: ['手动输入数据', '数据聚合', '结果预览图表'],
    theme: 'comparison',
    recommendedNextStep: '先运行默认分组聚合结果，再在结果预览里查看对比图，随后把手动 JSON 输入替换成真实数据源。',
    dataSourceHint: manualJsonSourceHint,
    workflow: cloneTemplateWorkflow(dashboardComparisonWorkflow as WorkflowTemplateJsonDefinition),
  },
]

export const getWorkflowTemplateDefinition = (templateId: string) =>
  workflowTemplateDefinitions.find((template) => template.id === templateId) ?? null
