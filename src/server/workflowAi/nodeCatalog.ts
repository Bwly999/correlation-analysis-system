import type { WorkflowAiNodeCatalogItem } from '../../ai/types.js'
import { CONNECTION_RULES } from '../../workflow/connectionRules.js'

type NodeCategory = 'trigger' | 'action' | 'terminal'
type NodeInputMode = WorkflowAiNodeCatalogItem['inputMode']
type NodeProperty = WorkflowAiNodeCatalogItem['properties'][number]
type NodePropertyOption = {
  value: string
  label: string
  description?: string
}
type NodePropertyOptionsResolver = (
  input: {
    config: Record<string, unknown>
    upstreamSample?: unknown
  },
) => NodePropertyOption[] | Promise<NodePropertyOption[]>
type ServerNodeProperty = NodeProperty & {
  options?: NodePropertyOption[]
  dependsOn?: string[]
  visibleWhen?: (config: Record<string, unknown>) => boolean
  resolveOptions?: NodePropertyOptionsResolver
}
type ServerNodeCatalogItem = Omit<WorkflowAiNodeCatalogItem, 'properties'> & {
  properties: ServerNodeProperty[]
}

type NodeCatalogSeed = {
  name: string
  displayName: string
  category: NodeCategory
  description: string
  inputMode?: NodeInputMode
  minInputs?: number
  maxInputs?: number | null
  properties?: ServerNodeProperty[]
  assistantHints?: {
    keywords?: string[]
    useCases?: string[]
  } | null
}

type CreatePropertyOptions = Partial<
  Omit<NodeProperty, 'name' | 'displayName' | 'type'>
> & {
  options?: NodePropertyOption[]
  dependsOn?: string[]
  visibleWhen?: (config: Record<string, unknown>) => boolean
  resolveOptions?: NodePropertyOptionsResolver
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const extractSampleRows = (value: unknown): Array<Record<string, unknown>> => {
  if (Array.isArray(value)) {
    return value.filter(isPlainObject)
  }
  if (isPlainObject(value)) {
    const normalized = value as { kind?: string; payload?: unknown }
    if (normalized.kind === 'table' && Array.isArray(normalized.payload)) {
      return normalized.payload.filter(isPlainObject)
    }
  }
  return []
}

const collectFieldOptions = (upstreamSample?: unknown): NodePropertyOption[] => {
  const rows = extractSampleRows(upstreamSample)
  if (!rows.length) return []

  return [...new Set(rows.flatMap((row) => Object.keys(row)))].map((field) => ({
    value: field,
    label: field,
  }))
}

const createProperty = (
  name: string,
  displayName: string,
  type: string,
  options: CreatePropertyOptions = {},
): ServerNodeProperty => ({
  name,
  displayName,
  type,
  required: false,
  isRuntimeInput: false,
  defaultValue: null,
  description: '',
  ...options,
})

const createCatalogItem = (seed: NodeCatalogSeed): ServerNodeCatalogItem => {
  const inputMode = seed.inputMode ?? 'single'
  const minInputs =
    seed.minInputs
    ?? (seed.category === 'trigger' ? 0 : 1)
  const maxInputs =
    seed.maxInputs
    ?? (inputMode === 'multiple' ? null : 1)

  return {
    name: seed.name,
    displayName: seed.displayName,
    category: seed.category,
    description: seed.description,
    inputMode,
    minInputs,
    maxInputs,
    allowedNextCategories: CONNECTION_RULES[seed.category] ?? [],
    properties: seed.properties ?? [],
    help: null,
    assistantHints: seed.assistantHints ?? null,
  }
}

const SERVER_SAFE_NODE_CATALOG: WorkflowAiNodeCatalogItem[] = [
  createCatalogItem({
    name: 'file-import',
    displayName: '本地文件导入',
    category: 'trigger',
    description: '从 CSV、JSON、Excel 等本地文件读取原始因子数据。',
    properties: [
      createProperty('fileData', '选择数据文件', 'file', {
        required: true,
        isRuntimeInput: true,
        description: '运行时上传需要分析的原始数据文件。',
      }),
      createProperty('format', '文件格式', 'options', {
        defaultValue: 'auto',
        description: '通常保持自动识别，只有识别失败时再手动指定格式。',
        options: [
          { value: 'auto', label: '自动识别' },
          { value: 'csv', label: 'CSV' },
          { value: 'xlsx', label: 'Excel' },
          { value: 'json', label: 'JSON' },
        ],
      }),
      createProperty('autoClean', '自动转换数字', 'boolean', {
        defaultValue: true,
        description: '自动把数字字符串转成数值，并处理常见空值占位符。',
      }),
      createProperty('excludeFields', '排除字段', 'tags', {
        defaultValue: [],
        description: '这些字段保持原始字符串格式，不参与自动数值转换。',
        dependsOn: ['autoClean'],
        visibleWhen: (config) => config.autoClean !== false,
      }),
    ],
    assistantHints: {
      keywords: ['文件导入', '上传数据', 'Excel', 'CSV', 'JSON 文件'],
      useCases: ['导入本地 Excel', '导入 CSV 数据', '读取 JSON 文件'],
    },
  }),
  createCatalogItem({
    name: 'manual-json-import',
    displayName: '手动输入数据',
    category: 'trigger',
    description: '手动输入 JSON 格式的原始数据集，适合快速调试和最小示例。',
    properties: [
      createProperty('jsonData', 'JSON 数据内容', 'json', {
        required: true,
        defaultValue:
          '[\n  { "f1": 10, "f2": 20, "target": 1 },\n  { "f1": 12, "f2": 18, "target": 0 }\n]',
        description: '直接输入合法 JSON；优先使用对象数组，便于后续节点直接分析。',
      }),
      createProperty('autoClean', '自动转换数字', 'boolean', {
        defaultValue: true,
        description: '自动把数字字符串转成数值，并处理 N/A、null 等空值字符串。',
      }),
      createProperty('excludeFields', '排除字段', 'tags', {
        defaultValue: [],
        description: '这些字段保持原始字符串格式，不参与自动数值转换。',
      }),
    ],
    assistantHints: {
      keywords: ['JSON', '手动输入', '样例数据', '快速调试'],
      useCases: ['手工录入样例数据', '快速调试工作流', '构造测试输入'],
    },
  }),
  createCatalogItem({
    name: 'data-cleaning',
    displayName: '数据清洗',
    category: 'action',
    description: '处理缺失值、重复记录、异常值和缩放编码，为后续分析做好准备。',
    properties: [
      createProperty('deduplicationMode', '去重方式', 'options', {
        defaultValue: 'none',
        description: '可选 none、full_row、by_fields；处理重复记录时优先配置。',
      }),
      createProperty('deduplicationFields', '去重字段', 'tags', {
        defaultValue: [],
        description: '仅在按指定字段去重时生效。',
      }),
      createProperty('missingValueStrategy', '缺失值处理', 'options', {
        defaultValue: 'none',
        description: '可选 mean、median、zero、drop、none；处理空值时优先配置。',
      }),
      createProperty('targetColumns', '目标字段', 'tags', {
        defaultValue: [],
        description: '留空时自动选择可识别的数值字段。',
      }),
      createProperty('scaling', '特征缩放', 'options', {
        defaultValue: 'none',
        description: '可选 none、minmax、zscore；建模前可视情况启用。',
      }),
      createProperty('encoding', '分类变量处理', 'options', {
        defaultValue: 'none',
        description: '可选 none、label；需要把类别字段编码为数值时使用。',
      }),
    ],
    assistantHints: {
      keywords: ['数据清洗', '去重', '缺失值', '异常值', '标准化'],
      useCases: ['处理重复记录', '处理缺失值', '做异常值清理'],
    },
  }),
  createCatalogItem({
    name: 'data-profiling',
    displayName: '数据体检',
    category: 'action',
    description: '识别字段类型、缺失风险和疑似异常字段，输出数据画像报告。',
    properties: [
      createProperty('targetField', '目标变量', 'options', {
        defaultValue: '',
        description: '可选；填写后会重点提示目标字段的可用性和风险。',
      }),
      createProperty('topFields', '重点展示字段数', 'number', {
        defaultValue: 8,
        description: '按风险优先级展示前 N 个字段。',
      }),
    ],
    assistantHints: {
      keywords: ['数据体检', '字段画像', '风险', '缺失率'],
      useCases: ['做数据体检', '检查字段风险', '判断目标字段是否适合分析'],
    },
  }),
  createCatalogItem({
    name: 'data-aggregation',
    displayName: '数据聚合',
    category: 'action',
    description: '支持行内合并、分组统计、移动窗口和时间窗口聚合，便于构造新特征。',
    properties: [
      createProperty('mode', '聚合模式', 'select-button', {
        defaultValue: 'row_combine',
        description: '可选 row_combine、group_by、rolling、time_window。',
      }),
      createProperty('aggregationGroups', '任务配置', 'collection', {
        defaultValue: [],
        description: '行内多列合并时定义新字段名称、聚合算法和参与字段。',
      }),
      createProperty('groupByField', '分组字段', 'options', {
        defaultValue: '',
        description: '分组统计模式下按该字段拆分数据。',
      }),
      createProperty('groupByMethods', '统计指标', 'multi-options', {
        defaultValue: ['mean'],
        description: '分组统计时可选 mean、sum、count、std、median。',
        options: [
          { value: 'mean', label: 'mean' },
          { value: 'sum', label: 'sum' },
          { value: 'count', label: 'count' },
          { value: 'std', label: 'std' },
          { value: 'median', label: 'median' },
        ],
      }),
      createProperty('windowSize', '窗口长度', 'number', {
        defaultValue: 5,
        description: '移动窗口模式下包含当前行在内的前 N 行。',
      }),
      createProperty('timeField', '时间字段', 'options', {
        defaultValue: '',
        description: '时间窗口模式下用于分桶的时间字段。',
      }),
      createProperty('timeWindowSize', '时间窗口长度', 'number', {
        defaultValue: 1,
        description: '每个时间桶覆盖的固定窗口长度。',
      }),
      createProperty('timeWindowUnit', '时间单位', 'options', {
        defaultValue: 'hour',
        description: '可选 minute、hour、day。',
        options: [
          { value: 'minute', label: 'minute' },
          { value: 'hour', label: 'hour' },
          { value: 'day', label: 'day' },
        ],
      }),
      createProperty('timeWindowMethods', '窗口统计指标', 'multi-options', {
        defaultValue: ['mean'],
        description: '时间窗口模式下要计算的统计指标。',
        options: [
          { value: 'mean', label: 'mean' },
          { value: 'sum', label: 'sum' },
          { value: 'count', label: 'count' },
          { value: 'std', label: 'std' },
          { value: 'median', label: 'median' },
        ],
      }),
      createProperty('rollingMethod', '窗口算法', 'options', {
        defaultValue: 'mean',
        description: '移动窗口模式下可选 mean、sum、max、min。',
        options: [
          { value: 'mean', label: 'mean' },
          { value: 'sum', label: 'sum' },
          { value: 'max', label: 'max' },
          { value: 'min', label: 'min' },
        ],
      }),
      createProperty('targetColumns', '目标处理字段', 'tags', {
        defaultValue: [],
        description: '留空时自动选择全部数值字段。',
      }),
    ],
    assistantHints: {
      keywords: ['聚合', '汇总', '分组统计', '滚动窗口', '时间窗口'],
      useCases: ['构造综合特征', '按分组做统计汇总', '生成滚动窗口特征'],
    },
  }),
  createCatalogItem({
    name: 'data-merge',
    displayName: '数据合并',
    category: 'action',
    description: '支持多输入纵向追加、横向关联或分组集合，适合把多个上游数据集汇总成一个结果。',
    inputMode: 'multiple',
    minInputs: 2,
    maxInputs: null,
    properties: [
      createProperty('mergeMode', '合并模式', 'options', {
        defaultValue: 'append',
        description: '可选 append、join、collection；join 适合按来源键字段做横向关联。',
        options: [
          { value: 'append', label: '纵向追加' },
          { value: 'join', label: '横向关联' },
          { value: 'collection', label: '分组集合' },
        ],
      }),
      createProperty('alignFieldsMode', '字段对齐方式', 'options', {
        defaultValue: 'union',
        description: 'append 模式下控制采用字段并集还是交集。',
        options: [
          { value: 'union', label: '字段并集' },
          { value: 'intersection', label: '字段交集' },
        ],
        visibleWhen: (config) => (config.mergeMode ?? 'append') === 'append',
        dependsOn: ['mergeMode'],
      }),
      createProperty('fillMissingValue', '缺失值填充', 'options', {
        defaultValue: 'null',
        description: 'append 模式下控制缺失字段填充值。',
        options: [
          { value: 'null', label: '填充 null' },
          { value: 'empty_string', label: '空字符串' },
        ],
        visibleWhen: (config) => (config.mergeMode ?? 'append') === 'append',
        dependsOn: ['mergeMode'],
      }),
      createProperty('addSourceTag', '添加来源标记', 'boolean', {
        defaultValue: false,
        description: 'append 模式下给每行补来源标记。',
        visibleWhen: (config) => (config.mergeMode ?? 'append') === 'append',
        dependsOn: ['mergeMode'],
      }),
      createProperty('sourceTagName', '来源字段名', 'string', {
        defaultValue: '__source',
        description: 'append 且启用来源标记时使用的字段名。',
        visibleWhen: (config) => (config.mergeMode ?? 'append') === 'append' && config.addSourceTag === true,
        dependsOn: ['mergeMode', 'addSourceTag'],
      }),
      createProperty('unifiedKeyName', '统一键名称', 'string', {
        defaultValue: '合并键',
        description: 'join 模式下输出结果中统一保留的主键字段名称。',
        visibleWhen: (config) => config.mergeMode === 'join',
        dependsOn: ['mergeMode'],
      }),
      createProperty('keyMappings', '来源键配置', 'collection', {
        defaultValue: [],
        description: 'join 模式下为每个上游来源单独指定来源节点与 mergeKey 字段。',
        visibleWhen: (config) => config.mergeMode === 'join',
        dependsOn: ['mergeMode'],
      }),
    ],
    assistantHints: {
      keywords: ['数据合并', '多输入', 'append', 'join', 'collection', '多表关联'],
      useCases: ['纵向追加多个数据源', '按来源键字段做 join', '并行保留多个上游结果'],
    },
  }),
  createCatalogItem({
    name: 'data-filter',
    displayName: '数据筛选',
    category: 'action',
    description: '按多个条件筛选数据行，支持数值比较、文本包含和空值判断。',
    properties: [
      createProperty('matchMode', '条件关系', 'options', {
        defaultValue: 'all',
        description: '可选 all 或 any，控制多个条件之间是且还是或。',
        options: [
          { value: 'all', label: '全部满足' },
          { value: 'any', label: '任一满足' },
        ],
      }),
      createProperty('conditions', '筛选条件', 'collection', {
        defaultValue: [],
        description: '每项通常包含 field、operator、value 三个字段。',
      }),
    ],
    assistantHints: {
      keywords: ['筛选', '过滤', '条件', '包含', '为空'],
      useCases: ['筛选高分样本', '过滤空值', '保留指定范围记录'],
    },
  }),
  createCatalogItem({
    name: 'js-transform',
    displayName: 'JS代码执行',
    category: 'action',
    description: '使用同步 JS 代码灵活转换上游表格数据，并输出新的表格结果。',
    properties: [
      createProperty('code', '转换代码', 'json', {
        required: true,
        defaultValue: 'return rows.map((row) => ({ ...row }))',
        description: '只允许同步 JS；必须显式 return 数组对象列表；可用变量只有 rows。',
      }),
    ],
    assistantHints: {
      keywords: ['JS', 'JavaScript', '代码执行', '数据转换'],
      useCases: ['字段重命名', '派生新字段', '复杂表格映射'],
    },
  }),
  createCatalogItem({
    name: 'field-selection',
    displayName: '字段选择',
    category: 'action',
    description: '在进入算法或图表前保留或排除指定字段。',
    properties: [
      createProperty('mode', '选择模式', 'options', {
        defaultValue: 'include',
        description: '可选 include 或 exclude，决定保留还是排除选中字段。',
        options: [
          { value: 'include', label: '包含' },
          { value: 'exclude', label: '不包含' },
        ],
      }),
      createProperty('fields', '目标字段', 'multi-options', {
        defaultValue: [],
        description: '填写需要保留或排除的字段名，可来自上游表头。',
        resolveOptions: ({ upstreamSample }) => collectFieldOptions(upstreamSample),
      }),
    ],
    assistantHints: {
      keywords: ['字段选择', '列筛选', '字段裁剪'],
      useCases: ['为算法保留关键字段', '图表前裁剪字段', '按字段名做列级筛选'],
    },
  }),
  createCatalogItem({
    name: 'sort',
    displayName: '排序',
    category: 'action',
    description: '按多个优先级规则对表格行排序。',
    properties: [
      createProperty('sortRules', '排序规则', 'collection', {
        defaultValue: [],
        description: '每项通常包含 field 和 direction；越靠前优先级越高。',
      }),
    ],
    assistantHints: {
      keywords: ['排序', '升序', '倒序', '多字段排序'],
      useCases: ['按分数排序', '按时间排序', '结果展示前整理顺序'],
    },
  }),
  createCatalogItem({
    name: 'data-limit',
    displayName: '数据量限制',
    category: 'action',
    description: '按前 n 条或后 n 条截断表格数据。',
    properties: [
      createProperty('mode', '保留方式', 'options', {
        defaultValue: 'head',
        description: '可选 head 或 tail，分别表示保留前 n 条或后 n 条。',
        options: [
          { value: 'head', label: '前 N 条' },
          { value: 'tail', label: '后 N 条' },
        ],
      }),
      createProperty('limit', '保留数量', 'number', {
        defaultValue: 100,
        description: '超过总行数时会直接返回全部数据。',
      }),
    ],
    assistantHints: {
      keywords: ['限制数据量', '截断', '前 n 条', '后 n 条'],
      useCases: ['保留头部样本', '保留尾部样本', '缩小预览数据规模'],
    },
  }),
  createCatalogItem({
    name: 'pearson',
    displayName: 'Pearson 相关系数',
    category: 'terminal',
    description: '计算数值字段之间以及目标变量与因子之间的 Pearson 相关性，并给出显著性摘要。',
    properties: [
      createProperty('xFields', 'X 字段', 'multi-options', {
        required: true,
        defaultValue: [],
        description: '选择参与相关性计算的 X 字段集合。',
      }),
      createProperty('yFields', 'Y 字段', 'multi-options', {
        required: true,
        defaultValue: [],
        description: '选择参与相关性计算的 Y 字段集合。',
      }),
      createProperty('heatmapTopN', '热力图显示因子数', 'number', {
        defaultValue: 8,
        description: '热力图按因子在任一 Y 字段上的最大绝对相关值排序后展示前 N 个 X 字段。',
      }),
      createProperty('rankingTopN', '排行图显示因子数', 'number', {
        defaultValue: 8,
        description: '每个 Y 字段按相关绝对值筛选重点因子后展示前 N 个 X 字段。',
      }),
    ],
    assistantHints: {
      keywords: ['Pearson', '相关系数', '线性相关', '热力图'],
      useCases: ['线性相关分析', '目标因子排序', '相关矩阵分析'],
    },
  }),
  createCatalogItem({
    name: 'spearman',
    displayName: 'Spearman 秩相关系数',
    category: 'terminal',
    description: '计算数值字段之间以及目标变量与因子之间的 Spearman 秩相关性，并给出显著性摘要。',
    properties: [
      createProperty('xFields', 'X 字段', 'multi-options', {
        required: true,
        defaultValue: [],
        description: '选择参与相关性计算的 X 字段集合。',
      }),
      createProperty('yFields', 'Y 字段', 'multi-options', {
        required: true,
        defaultValue: [],
        description: '选择参与相关性计算的 Y 字段集合。',
      }),
      createProperty('heatmapTopN', '热力图显示因子数', 'number', {
        defaultValue: 8,
        description: '热力图按因子在任一 Y 字段上的最大绝对相关值排序后展示前 N 个 X 字段。',
      }),
      createProperty('rankingTopN', '排行图显示因子数', 'number', {
        defaultValue: 8,
        description: '每个 Y 字段按相关绝对值筛选重点因子后展示前 N 个 X 字段。',
      }),
    ],
    assistantHints: {
      keywords: ['Spearman', '秩相关', '单调关系'],
      useCases: ['单调关系分析', '非线性相关探索'],
    },
  }),
  createCatalogItem({
    name: 'kendall',
    displayName: 'Kendall 秩相关系数',
    category: 'terminal',
    description: '计算数值字段之间以及目标变量与因子之间的 Kendall 秩相关性，并给出显著性摘要。',
    properties: [
      createProperty('xFields', 'X 字段', 'multi-options', {
        required: true,
        defaultValue: [],
        description: '选择参与相关性计算的 X 字段集合。',
      }),
      createProperty('yFields', 'Y 字段', 'multi-options', {
        required: true,
        defaultValue: [],
        description: '选择参与相关性计算的 Y 字段集合。',
      }),
      createProperty('heatmapTopN', '热力图显示因子数', 'number', {
        defaultValue: 8,
        description: '热力图按因子在任一 Y 字段上的最大绝对相关值排序后展示前 N 个 X 字段。',
      }),
      createProperty('rankingTopN', '排行图显示因子数', 'number', {
        defaultValue: 8,
        description: '每个 Y 字段按相关绝对值筛选重点因子后展示前 N 个 X 字段。',
      }),
    ],
    assistantHints: {
      keywords: ['Kendall', '秩相关', '排序一致性'],
      useCases: ['小样本秩相关分析', '排序一致性验证'],
    },
  }),
  createCatalogItem({
    name: 'chart-display',
    displayName: '图表展示',
    category: 'terminal',
    description: '将输入数据转换为可视化图表，支持散点图、柱状图、分布图和箱线图。',
    properties: [
      createProperty('chartType', '图表类型', 'options', {
        defaultValue: 'scatter',
        description: '可选 scatter、bar、histogram、boxplot。',
        options: [
          { value: 'scatter', label: 'scatter' },
          { value: 'bar', label: 'bar' },
          { value: 'histogram', label: 'histogram' },
          { value: 'boxplot', label: 'boxplot' },
        ],
      }),
      createProperty('xAxis', 'X 轴字段', 'string', {
        defaultValue: '',
        description: '散点图和柱状图常用的横轴字段名。',
      }),
      createProperty('yAxis', 'Y 轴字段', 'string', {
        defaultValue: '',
        description: '用于展示的数值字段名；可按图表类型填写。',
      }),
    ],
    assistantHints: {
      keywords: ['图表', '可视化', '散点图', '柱状图', '直方图'],
      useCases: ['相关结果可视化', '样本分布展示', '分组对比展示'],
    },
  }),
]

export const buildServerWorkflowAiNodeCatalog = (): WorkflowAiNodeCatalogItem[] =>
  SERVER_SAFE_NODE_CATALOG.map((item) => ({
    ...item,
    properties: item.properties.map((property) => ({
      name: property.name,
      displayName: property.displayName,
      type: property.type,
      required: property.required,
      isRuntimeInput: property.isRuntimeInput,
      defaultValue: property.defaultValue,
      description: property.description,
    })),
    assistantHints: item.assistantHints
      ? {
          ...(item.assistantHints as Record<string, unknown>),
        }
      : null,
  }))

export const getServerNodeCatalogItem = (nodeType: string): ServerNodeCatalogItem | null =>
  SERVER_SAFE_NODE_CATALOG.find((item) => item.name === nodeType) ?? null

export const resolveServerNodePropertyOptions = async (
  nodeType: string,
  propertyName: string,
  config: Record<string, unknown> = {},
  upstreamSample?: unknown,
) => {
  const item = getServerNodeCatalogItem(nodeType)
  if (!item) {
    return {
      found: false,
      propertyName,
      visible: false,
      options: [],
      message: `未找到节点定义: ${nodeType}`,
    }
  }

  const property = item.properties.find((candidate) => candidate.name === propertyName)
  if (!property) {
    return {
      found: false,
      propertyName,
      visible: false,
      options: [],
      message: `未找到属性 ${propertyName}`,
    }
  }

  const visible = !property.visibleWhen || property.visibleWhen(config)
  const options = property.resolveOptions
    ? await property.resolveOptions({ config, upstreamSample })
    : property.options ?? []

  return {
    found: true,
    propertyName,
    visible,
    dependsOn: property.dependsOn ?? [],
    options,
  }
}
