export interface WorkflowTemplateNodeDraft {
  type: string
  label?: string
  position: { x: number; y: number }
  config?: Record<string, unknown>
}

export interface WorkflowTemplateEdgeDraft {
  sourceIndex: number
  targetIndex: number
}

export interface WorkflowTemplateBuildResult {
  workflowName: string
  nodes: WorkflowTemplateNodeDraft[]
  edges: WorkflowTemplateEdgeDraft[]
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
  build: () => WorkflowTemplateBuildResult
}

const baseNodeX = 120
const baseNodeY = 180
const nodeGapX = 280

export const workflowTemplateDefinitions: WorkflowTemplateDefinition[] = [
  {
    id: 'correlation-analysis',
    name: '相关性排查模板',
    categoryLabel: '相关性诊断',
    outcomeTitle: '快速看出哪些指标最相关',
    outcomeSummary: '优先产出相关性排序、显著性判断和热力图线索，帮助你先完成第一轮排查。',
    description: '快速搭出导入数据、筛选字段并生成 Pearson 相关性报告的最小链路。',
    bestFor: '适合第一次先找变量关系、快速筛掉弱相关组合的场景。',
    keyResults: ['相关性排序', '显著性提示', '热力图线索'],
    keyNodes: ['文件导入', '字段筛选', 'Pearson 相关性'],
    theme: 'insight',
    recommendedNextStep: '补齐数值字段后先跑通一次相关性分析，再决定是否扩展到 Spearman 或 Kendall。',
    build: () => ({
      workflowName: '相关性排查模板',
      nodes: [
        { type: 'file-import', position: { x: baseNodeX, y: baseNodeY } },
        { type: 'field-selection', position: { x: baseNodeX + nodeGapX, y: baseNodeY } },
        { type: 'pearson', position: { x: baseNodeX + nodeGapX * 2, y: baseNodeY } },
      ],
      edges: [
        { sourceIndex: 0, targetIndex: 1 },
        { sourceIndex: 1, targetIndex: 2 },
      ],
    }),
  },
  {
    id: 'factor-screening',
    name: '关键因子筛选模板',
    categoryLabel: '因子筛选',
    outcomeTitle: '找出最值得优先关注的关键因子',
    outcomeSummary: '重点给出特征重要性排序，让你先知道哪些候选因子最值得继续分析和验证。',
    description: '从导入数据开始，快速进入特征重要性筛选流程。',
    bestFor: '适合候选字段较多、需要先压缩分析范围的场景。',
    keyResults: ['重要性排名', '高价值因子', '筛选优先级'],
    keyNodes: ['文件导入', '字段筛选', '随机森林重要性'],
    theme: 'ranking',
    recommendedNextStep: '先指定目标字段和候选因子，再查看重要性排序结果。',
    build: () => ({
      workflowName: '关键因子筛选模板',
      nodes: [
        { type: 'file-import', position: { x: baseNodeX, y: baseNodeY } },
        { type: 'field-selection', position: { x: baseNodeX + nodeGapX, y: baseNodeY } },
        {
          type: 'random-forest-feature-importance',
          position: { x: baseNodeX + nodeGapX * 2, y: baseNodeY },
        },
      ],
      edges: [
        { sourceIndex: 0, targetIndex: 1 },
        { sourceIndex: 1, targetIndex: 2 },
      ],
    }),
  },
  {
    id: 'variable-explanation',
    name: '变量解释分析模板',
    categoryLabel: '变量解释',
    outcomeTitle: '解释哪些变量在真正推动结果变化',
    outcomeSummary: '优先输出变量贡献解释和方向判断，帮助你把“结果出现了”说清楚。',
    description: '帮助你快速进入 SHAP 变量解释分析链路。',
    bestFor: '适合已经有明确目标指标，想进一步解释模型判断依据的场景。',
    keyResults: ['变量贡献解释', '影响方向', '重点解释报告'],
    keyNodes: ['文件导入', '字段筛选', 'XGBoost SHAP'],
    theme: 'explanation',
    recommendedNextStep: '优先补齐目标字段与候选特征，再查看变量贡献解释。',
    build: () => ({
      workflowName: '变量解释分析模板',
      nodes: [
        { type: 'file-import', position: { x: baseNodeX, y: baseNodeY } },
        { type: 'field-selection', position: { x: baseNodeX + nodeGapX, y: baseNodeY } },
        { type: 'xgboost-shap', position: { x: baseNodeX + nodeGapX * 2, y: baseNodeY } },
      ],
      edges: [
        { sourceIndex: 0, targetIndex: 1 },
        { sourceIndex: 1, targetIndex: 2 },
      ],
    }),
  },
  {
    id: 'dashboard-comparison',
    name: '看板数据对比分析模板',
    categoryLabel: '对比展示',
    outcomeTitle: '把关键指标差异直接变成对比图',
    outcomeSummary: '先产出聚合后的对比视图，让不同时间、分组或维度的变化一眼可见。',
    description: '用最小链路先完成数据聚合与图表展示，快速形成对比视图。',
    bestFor: '适合要先给业务看趋势差异、结构差异和看板结论的场景。',
    keyResults: ['分组对比图', '聚合结果', '趋势变化'],
    keyNodes: ['文件导入', '数据聚合', '图表展示'],
    theme: 'comparison',
    recommendedNextStep: '先确认聚合维度和指标字段，再调整图表类型与展示方式。',
    build: () => ({
      workflowName: '看板数据对比分析模板',
      nodes: [
        { type: 'file-import', position: { x: baseNodeX, y: baseNodeY } },
        { type: 'data-aggregation', position: { x: baseNodeX + nodeGapX, y: baseNodeY } },
        { type: 'chart-display', position: { x: baseNodeX + nodeGapX * 2, y: baseNodeY } },
      ],
      edges: [
        { sourceIndex: 0, targetIndex: 1 },
        { sourceIndex: 1, targetIndex: 2 },
      ],
    }),
  },
]

export const getWorkflowTemplateDefinition = (templateId: string) =>
  workflowTemplateDefinitions.find((template) => template.id === templateId) ?? null
