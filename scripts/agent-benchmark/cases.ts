export type BenchmarkSuite = 'base' | 'adversarial'

export interface BenchmarkCase {
  id: string
  suite: BenchmarkSuite
  name: string
  description: string
  prompt: string
  expectedNodeTypes: string[]
  /** 生成这些节点则判失败，用于验证模型不会盲目选择不适合的分析节点 */
  forbiddenNodeTypes?: string[]
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
    suite: 'base',
    name: '快速 Pearson 相关分析',
    description: '最小可运行 Pearson 相关分析，使用内置 JSON 数据',
    prompt: '帮我分析以下数据的相关性：[{"x1":1,"x2":2,"y":3},{"x1":2,"x2":4,"y":6},{"x1":3,"x2":6,"y":9},{"x1":4,"x2":8,"y":12},{"x1":5,"x2":10,"y":15}]',
    expectedNodeTypes: ['manual-json-import', 'pearson'],
    maxIterations: 1,
    assertPlanValid: true,
    assertConclusionPresent: true,
    expectedConclusionKeywords: ['相关', '分析'],
    minExecutionCount: 1,
    timeoutMs: 180_000,
  },
  {
    id: 'data-profiling-flow',
    suite: 'base',
    name: '数据体检流程',
    description: '对数据进行基本的体检分析',
    prompt: '请对以下数据进行体检分析：[{"age":25,"income":5000,"score":80},{"age":30,"income":6000,"score":85},{"age":35,"income":7000,"score":90},{"age":40,"income":8000,"score":75}]',
    expectedNodeTypes: ['manual-json-import'],
    maxIterations: 1,
    assertPlanValid: true,
    assertConclusionPresent: true,
    expectedConclusionKeywords: ['字段', '数据', '样本', '数值', '分布', '建议', '预处理'],
    minExecutionCount: 1,
    timeoutMs: 180_000,
  },
  {
    id: 'multi-step-analysis',
    suite: 'base',
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
    suite: 'base',
    name: '筛选后相关分析',
    description: '先筛选数据再做相关性分析，测试多节点执行',
    prompt: '请先筛选出score大于80的记录，然后分析这些记录中各变量的相关性：[{"score":70,"x":1,"y":2},{"score":85,"x":2,"y":4},{"score":90,"x":3,"y":7},{"score":60,"x":4,"y":10},{"score":95,"x":5,"y":13}]',
    expectedNodeTypes: ['manual-json-import'],
    maxIterations: 1,
    assertPlanValid: true,
    assertConclusionPresent: true,
    minExecutionCount: 1,
    timeoutMs: 180_000,
  },
  {
    id: 'field-selection-flow',
    suite: 'base',
    name: '字段选择流程',
    description: '从多个字段中选择需要的字段进行分析',
    prompt: '从以下数据中只保留 a 和 b 字段进行分析：[{"a":1,"b":2,"c":3,"d":4},{"a":5,"b":6,"c":7,"d":8},{"a":9,"b":10,"c":11,"d":12}]',
    expectedNodeTypes: ['manual-json-import'],
    maxIterations: 1,
    assertPlanValid: true,
    assertConclusionPresent: true,
    minExecutionCount: 1,
    timeoutMs: 180_000,
  },
  {
    id: 'json-import-routing',
    suite: 'adversarial',
    name: 'JSON 导入路由对抗',
    description: '显式给出 JSON 样例，验证 Agent 优先选择 manual-json-import 而不是 file-import',
    prompt: '这里不是本地文件上传，而是直接给你 JSON 样例。请用最小可运行流程分析相关性：[{"feature_a":1,"feature_b":2,"target":3},{"feature_a":2,"feature_b":3,"target":5},{"feature_a":3,"feature_b":4,"target":7}]',
    expectedNodeTypes: ['manual-json-import', 'pearson'],
    maxIterations: 1,
    assertPlanValid: true,
    assertConclusionPresent: true,
    minExecutionCount: 2,
    timeoutMs: 180_000,
  },
  {
    id: 'empty-result-stop',
    suite: 'adversarial',
    name: '空结果收敛',
    description: '先筛选出不存在的数据，再观察 Agent 是否能在空结果下收敛并输出谨慎结论',
    prompt: '先筛选出 score 大于 999 的记录，再说明还能做什么分析：[{"score":70,"x":1,"y":2},{"score":85,"x":2,"y":4},{"score":90,"x":3,"y":7}]',
    expectedNodeTypes: ['manual-json-import', 'data-filter'],
    maxIterations: 2,
    assertPlanValid: true,
    assertConclusionPresent: true,
    minExecutionCount: 2,
    timeoutMs: 180_000,
  },
  {
    id: 'non-numeric-profile-fallback',
    suite: 'adversarial',
    name: '非数值字段回退',
    description: '输入纯类别字段，验证 Agent 更倾向数据体检而不是盲目做相关性',
    prompt: '这些数据主要是类别字段，请先判断它们适不适合做相关性分析：[{"city":"上海","segment":"A","grade":"高"},{"city":"北京","segment":"B","grade":"中"},{"city":"深圳","segment":"A","grade":"低"}]',
    expectedNodeTypes: ['manual-json-import'],
    forbiddenNodeTypes: ['pearson', 'spearman', 'kendall', 'correlation-analysis'],
    maxIterations: 1,
    assertPlanValid: true,
    assertConclusionPresent: true,
    minExecutionCount: 1,
    timeoutMs: 180_000,
  },
  {
    id: 'field-selection-before-correlation',
    suite: 'adversarial',
    name: '字段裁剪后分析',
    description: '先保留关键字段，再避免把无关字段一起送入分析',
    prompt: '请只保留 a、b、target 三个字段，然后评估它们之间的关系：[{"a":1,"b":2,"c":"忽略","target":4},{"a":2,"b":3,"c":"忽略","target":6},{"a":3,"b":5,"c":"忽略","target":9}]',
    expectedNodeTypes: ['manual-json-import', 'field-selection'],
    maxIterations: 1,
    assertPlanValid: true,
    assertConclusionPresent: true,
    minExecutionCount: 2,
    timeoutMs: 180_000,
  },
  {
    id: 'sort-limit-preview',
    suite: 'adversarial',
    name: '排序截断预览',
    description: '先排序并只看头部样本，测试 Agent 是否会走最小链路而不是直接发散',
    prompt: '请按 score 倒序排列，只保留前 3 条记录，并说明这批头部样本的特征：[{"score":60,"region":"A","sales":100},{"score":92,"region":"B","sales":180},{"score":88,"region":"C","sales":160},{"score":95,"region":"A","sales":210},{"score":73,"region":"B","sales":120}]',
    expectedNodeTypes: ['manual-json-import', 'sort', 'data-limit'],
    maxIterations: 1,
    assertPlanValid: true,
    assertConclusionPresent: true,
    minExecutionCount: 3,
    timeoutMs: 180_000,
  },
  {
    id: 'clean-then-correlate',
    suite: 'adversarial',
    name: '清洗后相关分析',
    description: '存在重复行和缺失值，验证 Agent 先做清洗再进入分析',
    prompt: '请先处理重复记录和缺失值，再分析以下数据中各变量的相关性：[{"f1":1,"f2":2,"target":3},{"f1":1,"f2":2,"target":3},{"f1":2,"f2":"","target":5},{"f1":3,"f2":6,"target":9}]',
    expectedNodeTypes: ['manual-json-import', 'data-dedup', 'data-missing-outlier'],
    maxIterations: 2,
    assertPlanValid: true,
    assertConclusionPresent: true,
    minExecutionCount: 2,
    timeoutMs: 180_000,
  },
]
