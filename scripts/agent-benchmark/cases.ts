export interface BenchmarkCase {
  id: string
  name: string
  description: string
  prompt: string
  expectedNodeTypes: string[]
  maxIterations: number
  assertPlanValid: boolean
  assertConclusionPresent: boolean
  /** 结论摘要中应包含的关键词（至少匹配一个） */
  expectedConclusionKeywords?: string[]
  /** 期望至少执行的节点数 */
  minExecutionCount: number
  timeoutMs: number
}

export const BENCHMARK_CASES: BenchmarkCase[] = [
  {
    id: 'quick-pearson-demo',
    name: '快速 Pearson 相关分析',
    description: '最小可运行 Pearson 相关分析，使用内置 JSON 数据',
    prompt: '帮我分析以下数据的相关性：[{"x1":1,"x2":2,"y":3},{"x1":2,"x2":4,"y":6},{"x1":3,"x2":6,"y":9},{"x1":4,"x2":8,"y":12},{"x1":5,"x2":10,"y":15}]',
    expectedNodeTypes: ['manual-json-import', 'pearson'],
    maxIterations: 1,
    assertPlanValid: true,
    assertConclusionPresent: true,
    expectedConclusionKeywords: ['相关', '分析'],
    minExecutionCount: 1,
    timeoutMs: 120_000,
  },
  {
    id: 'data-profiling-flow',
    name: '数据体检流程',
    description: '对数据进行基本的体检分析',
    prompt: '请对以下数据进行体检分析：[{"age":25,"income":5000,"score":80},{"age":30,"income":6000,"score":85},{"age":35,"income":7000,"score":90},{"age":40,"income":8000,"score":75}]',
    expectedNodeTypes: ['manual-json-import'],
    maxIterations: 1,
    assertPlanValid: true,
    assertConclusionPresent: true,
    expectedConclusionKeywords: ['体检', '数据', '字段'],
    minExecutionCount: 1,
    timeoutMs: 120_000,
  },
  {
    id: 'multi-step-analysis',
    name: '多步分析循环',
    description: '先做数据导入和相关性分析，需要 Agent Loop 判断是否继续',
    prompt: '分析以下销售数据中各变量之间的相关性，并根据结果给出进一步建议：[{"month":1,"sales":100,"ad_budget":10,"traffic":500},{"month":2,"sales":120,"ad_budget":15,"traffic":600},{"month":3,"sales":115,"ad_budget":12,"traffic":550},{"month":4,"sales":140,"ad_budget":20,"traffic":700},{"month":5,"sales":130,"ad_budget":18,"traffic":650}]',
    expectedNodeTypes: ['manual-json-import'],
    maxIterations: 2,
    assertPlanValid: true,
    assertConclusionPresent: true,
    expectedConclusionKeywords: ['相关', '建议', '分析'],
    minExecutionCount: 1,
    timeoutMs: 180_000,
  },
  {
    id: 'simple-filter-pearson',
    name: '筛选后相关分析',
    description: '先筛选数据再做相关性分析，测试多节点执行',
    prompt: '请先筛选出score大于80的记录，然后分析这些记录中各变量的相关性：[{"score":70,"x":1,"y":2},{"score":85,"x":2,"y":4},{"score":90,"x":3,"y":7},{"score":60,"x":4,"y":10},{"score":95,"x":5,"y":13}]',
    expectedNodeTypes: ['manual-json-import'],
    maxIterations: 1,
    assertPlanValid: true,
    assertConclusionPresent: true,
    minExecutionCount: 1,
    timeoutMs: 120_000,
  },
  {
    id: 'field-selection-flow',
    name: '字段选择流程',
    description: '从多个字段中选择需要的字段进行分析',
    prompt: '从以下数据中只保留 a 和 b 字段进行分析：[{"a":1,"b":2,"c":3,"d":4},{"a":5,"b":6,"c":7,"d":8},{"a":9,"b":10,"c":11,"d":12}]',
    expectedNodeTypes: ['manual-json-import'],
    maxIterations: 1,
    assertPlanValid: true,
    assertConclusionPresent: true,
    minExecutionCount: 1,
    timeoutMs: 120_000,
  },
]
