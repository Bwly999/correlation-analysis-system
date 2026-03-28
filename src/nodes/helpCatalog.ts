import type { NodeAssistantHints, NodeHelpDoc } from '@/help/types'
import type { NodeDefinition } from './types'

type NodeHelpCatalogEntry = {
  help: NodeHelpDoc
  assistantHints?: NodeAssistantHints
}

const createEntry = (
  help: NodeHelpDoc,
  assistantHints?: NodeAssistantHints,
): NodeHelpCatalogEntry => ({
  help,
  assistantHints,
})

export const nodeHelpCatalog: Record<string, NodeHelpCatalogEntry> = {
  'file-import': createEntry(
    {
      summary: '从本地 CSV、Excel 或 JSON 文件导入一份原始表格数据。',
      whenToUse: ['你已经有本地数据文件，需要把它作为工作流起点。'],
      inputGuide: ['该节点是起点节点，不需要上游输入。', '运行时必须重新选择要导入的数据文件。'],
      parameterGuide: [
        {
          property: 'format',
          title: '文件格式',
          content: '通常保持自动识别即可，只有识别失败时再手动指定格式。',
        },
        {
          property: 'autoClean',
          title: '自动转换数字',
          content: '建议开启，这样数字字符串会被转换为数值，便于后续统计分析。',
        },
      ],
      outputGuide: ['输出结果是表格数据，通常接数据清洗、数据筛选或分析节点。'],
      nextSteps: ['如果字段脏乱，先接数据清洗。', '如果只需部分记录，可先接数据筛选。'],
      commonIssues: [
        {
          title: '文件选择后仍无法运行',
          resolution: '刷新页面后文件对象可能失效，重新选择一次文件即可。',
        },
      ],
    },
    {
      useCases: ['导入本地 Excel', '导入 CSV 数据', '读取 JSON 文件'],
      keywords: ['文件导入', '上传数据', 'Excel', 'CSV', 'JSON'],
      workflowRoles: ['数据入口'],
      inputKinds: [],
      outputKinds: ['table'],
      requiredConfig: ['fileData'],
      recommendedConfigPatterns: ['默认自动识别格式并开启自动转换数字。'],
      commonMistakes: ['忘记重新选择文件导致运行时文件对象失效。'],
      recommendedNextNodes: ['data-cleaning', 'data-filter', 'data-profiling'],
    },
  ),
  'manual-json-import': createEntry(
    {
      summary: '手动粘贴 JSON 数据，适合快速调试和构造最小样例。',
      whenToUse: ['你还没有正式文件，想先用一小段样例数据验证流程。'],
      inputGuide: ['该节点是起点节点，不需要上游输入。', '输入内容必须是合法 JSON。'],
      parameterGuide: [
        {
          property: 'jsonData',
          title: 'JSON 数据内容',
          content: '可以输入数组，或包含 data 数组的对象。表格型数组最适合后续分析节点。',
        },
      ],
      outputGuide: ['对象数组会输出为表格；其他合法 JSON 会作为结构化 JSON 输出。'],
      nextSteps: ['如果要验证整条分析链路，通常下一步接数据清洗或相关性分析。'],
      commonIssues: [
        {
          title: 'JSON 解析失败',
          resolution: '先检查是否缺少逗号、引号或括号，确保整体是合法 JSON。',
        },
      ],
    },
    {
      useCases: ['手工录入样例数据', '快速调试工作流', '构造测试输入'],
      keywords: ['JSON', '手动输入', '样例数据', '调试'],
      workflowRoles: ['数据入口'],
      outputKinds: ['table', 'json'],
      requiredConfig: ['jsonData'],
      recommendedConfigPatterns: ['优先使用对象数组，便于后续节点直接消费。'],
      commonMistakes: ['输入非 JSON 文本导致解析失败。'],
      recommendedNextNodes: ['data-cleaning', 'data-filter', 'pearson'],
    },
  ),
  'neighbor-system': createEntry(
    {
      summary: '从宿主看板系统拉取业务数据，直接作为工作流输入。',
      whenToUse: ['数据不在本地文件里，而是需要从外部看板系统按条件查询。'],
      inputGuide: ['该节点是起点节点，不需要上游输入。', '必须先拿到宿主系统传入的访问凭证。'],
      parameterGuide: [
        {
          property: 'fetchMode',
          title: '启动方式',
          content: '决定你按时间、方案、SN 还是任务令去拉取数据，后面的运行时参数会跟着变化。',
        },
        {
          property: 'selectedProcesses',
          title: '工序',
          content: '四种启动方式都需要明确选择工序范围，系统会按你勾选的工序去查询 SN 和因子数据。',
        },
      ],
      outputGuide: ['输出结果是表格数据，适合继续做清洗、合并和分析。'],
      nextSteps: ['如果因子很多，建议先用数据体检或数据清洗确认字段质量。'],
      commonIssues: [
        {
          title: '无法获取数据',
          resolution: '先确认产品、因子和运行时条件都已选择，并检查宿主系统是否已传入 token。',
        },
      ],
    },
    {
      useCases: ['从看板系统获取因子数据', '按时间、方案、SN 或任务令拉取业务数据'],
      keywords: ['看板', '宿主系统', '相邻系统', 'SN', '任务令'],
      workflowRoles: ['数据入口'],
      outputKinds: ['table'],
      requiredConfig: ['productName', 'selectedFactors', 'fetchMode', 'selectedProcesses'],
      recommendedConfigPatterns: ['先选产品和因子，再补运行时查询条件。'],
      commonMistakes: ['未收到宿主系统 token。', '未选择任何因子。'],
      recommendedNextNodes: ['data-cleaning', 'data-merge', 'data-profiling'],
    },
  ),
  'data-cleaning': createEntry(
    {
      summary: '统一处理缺失值、去重、异常值、缩放和分类编码，让数据更适合分析。',
      whenToUse: ['原始数据存在重复记录、空值、异常值、字符型字段或量纲差异明显时。'],
      inputGuide: ['需要上游提供表格数据。', '留空目标字段时会自动处理可识别的数值字段。'],
      parameterGuide: [
        {
          property: 'deduplicationMode',
          title: '去重方式',
          content: '按当前数据顺序去重；如果想保留最早或最晚记录，请先用排序节点把顺序整理好。',
        },
        {
          property: 'missingValueStrategy',
          title: '缺失值处理',
          content: '优先决定空值如何补齐或删除，这是最常见的预处理步骤。',
        },
        {
          property: 'scaling',
          title: '特征缩放',
          content: '做回归或模型分析前，若字段量纲差异大，建议使用归一化或标准化。',
        },
      ],
      outputGuide: ['输出结果仍是表格数据，但会附带清洗统计信息。'],
      nextSteps: ['清洗后可继续筛选、聚合，或直接进入相关性/建模节点。'],
      commonIssues: [
        {
          title: '去重结果和预期不一致',
          resolution: '去重只识别当前表格顺序中的首条或末条记录；若要按时间先后保留，请先接排序节点。',
        },
        {
          title: '清洗后数据行数变少',
          resolution: '通常是因为缺失值处理选择了直接删除，或异常值处理剔除了样本。',
        },
      ],
    },
    {
      useCases: ['处理重复记录', '处理缺失值', '做异常值清理', '标准化特征', '编码类别字段'],
      keywords: ['数据清洗', '去重', '缺失值', '异常值', '标准化', '编码'],
      workflowRoles: ['数据准备'],
      inputKinds: ['table'],
      outputKinds: ['table'],
      recommendedPrevNodes: ['file-import', 'manual-json-import', 'neighbor-system'],
      recommendedNextNodes: ['data-filter', 'data-aggregation', 'pearson', 'xgboost-shap'],
    },
  ),
  'data-filter': createEntry(
    {
      summary: '按多个条件筛选数据行，快速保留你真正关心的样本。',
      whenToUse: ['你只想分析某些范围、某些标签或非空记录。'],
      inputGuide: ['需要上游提供表格数据。', '每个筛选条件都依赖具体字段名。'],
      parameterGuide: [
        {
          property: 'matchMode',
          title: '条件关系',
          content: '全部满足适合做精确筛选；任一满足适合做宽松召回。',
        },
      ],
      outputGuide: ['输出结果是过滤后的表格数据。'],
      nextSteps: ['筛选后可继续聚合、分析或导出。'],
      commonIssues: [
        {
          title: '筛选后没有数据',
          resolution: '先检查字段名是否正确，再确认比较值类型和条件关系是否过严。',
        },
      ],
    },
    {
      useCases: ['筛选指定城市数据', '筛选高分样本', '过滤空值'],
      keywords: ['筛选', '过滤', '条件', '包含', '为空'],
      workflowRoles: ['数据准备'],
      inputKinds: ['table'],
      outputKinds: ['table'],
      recommendedPrevNodes: ['data-cleaning', 'file-import'],
      recommendedNextNodes: ['data-aggregation', 'pearson', 'data-export'],
    },
  ),
  'js-transform': createEntry(
    {
      summary: '使用同步 JS 代码对上游表格数据做字段重组、派生和格式转换。',
      whenToUse: [
        '内置清洗、筛选、聚合节点还不够灵活时，可以用少量同步 JS 快速完成定制转换。',
      ],
      inputGuide: [
        '需要上游提供表格数据。',
        '代码里只有 rows 可用，rows 是数组对象列表。',
      ],
      parameterGuide: [
        {
          property: 'code',
          title: '转换代码',
          content:
            '必须显式 return 数组对象列表。只支持同步 JS，不要使用 async、await 或外部变量。',
        },
      ],
      outputGuide: ['固定输出表格结果，适合继续接字段选择、图表展示、相关性分析或导出节点。'],
      nextSteps: ['转换后可继续接字段选择、排序、图表展示、相关性分析或数据导出。'],
      commonIssues: [
        {
          title: '运行时报返回值错误',
          resolution: '请确认代码最后 return 的是数组，且数组里的每一项都是对象。',
        },
        {
          title: '代码里找不到变量',
          resolution: '当前节点只暴露 rows 一个变量，其他上下文对象不会传入执行环境。',
        },
      ],
    },
    {
      useCases: ['字段重命名', '派生新字段', '行级格式转换', '复杂表格映射'],
      keywords: ['JS', 'JavaScript', '代码执行', '数据转换', '字段映射'],
      workflowRoles: ['数据准备'],
      inputKinds: ['table'],
      outputKinds: ['table'],
      requiredConfig: ['code'],
      recommendedConfigPatterns: ['优先用 rows.map 或 rows.filter + rows.map，保持输出为数组对象列表。'],
      commonMistakes: ['返回普通对象而不是数组', '在代码里使用 async/await', '尝试访问 rows 之外的变量'],
      recommendedPrevNodes: ['file-import', 'manual-json-import', 'data-cleaning', 'data-filter'],
      recommendedNextNodes: ['field-selection', 'sort', 'chart-display', 'pearson', 'data-export'],
    },
  ),
  'data-aggregation': createEntry(
    {
      summary: '把多列值聚成新指标，或按分组、窗口生成统计特征。',
      whenToUse: ['需要构造综合指标、按维度汇总，或为时序数据做窗口特征。'],
      inputGuide: ['需要上游提供表格数据。', '聚合模式决定你是在行内合并、分组统计还是滑动窗口。'],
      parameterGuide: [
        {
          property: 'mode',
          title: '聚合模式',
          content: '先决定是生成新字段、做分组摘要，还是做滚动窗口统计。',
        },
      ],
      outputGuide: ['输出结果是新的表格数据，字段结构会按聚合模式变化。'],
      nextSteps: ['聚合后通常继续分析、绘图或导出。'],
      commonIssues: [
        {
          title: '聚合结果为空或字段不存在',
          resolution: '先确认参与聚合的字段名真实存在，且字段内容适合对应聚合算法。',
        },
      ],
    },
    {
      useCases: ['构造综合特征', '按分组做统计汇总', '生成滚动窗口特征'],
      keywords: ['聚合', '汇总', '分组统计', '滚动窗口'],
      workflowRoles: ['数据准备'],
      inputKinds: ['table'],
      outputKinds: ['table'],
      recommendedPrevNodes: ['data-cleaning', 'data-filter'],
      recommendedNextNodes: ['pearson', 'chart-display', 'data-export'],
    },
  ),
  'data-merge': createEntry(
    {
      summary: '把多个上游数据集纵向追加、横向关联，或组合成分组集合。',
      whenToUse: ['你需要合并多个来源的数据，或把多组数据并行送入后续分析。'],
      inputGuide: ['这是一个多输入节点，至少需要两个上游输入。', '不同合并模式对字段对齐和关联键要求不同。'],
      parameterGuide: [
        {
          property: 'mergeMode',
          title: '合并模式',
          content: '追加适合堆叠行，关联适合按键拼列，分组集合适合做多组对比。',
        },
        {
          property: 'keyMappings',
          title: '来源键配置',
          content: '横向关联时需要为每个来源分别指定来源键字段，系统会按所有键值并集做宽表合并。',
        },
        {
          property: 'unifiedKeyName',
          title: '统一键名称',
          content: '横向关联后只保留这一列作为统一主键，各来源原始键字段会从结果中移除。',
        },
      ],
      outputGuide: ['追加或关联会输出表格；分组集合会输出多组表格集合。'],
      nextSteps: ['合并后的表格可继续分析；分组集合适合接图表展示。'],
      commonIssues: [
        {
          title: '关联后大量空值',
          resolution: '通常是来源键字段选择错误，或不同来源的键值体系本身不一致。',
        },
      ],
    },
    {
      useCases: ['多表追加', '不同键名的宽表合并', '构造分组对比输入'],
      keywords: ['数据合并', 'join', 'append', '多输入', '分组集合', '字段合并'],
      workflowRoles: ['数据准备'],
      inputKinds: ['table'],
      outputKinds: ['table', 'tableCollection'],
      recommendedPrevNodes: ['file-import', 'neighbor-system', 'data-cleaning'],
      recommendedNextNodes: ['chart-display', 'pearson', 'data-profiling'],
    },
  ),
  'field-selection': createEntry(
    {
      summary: '在进入算法或图表前，按字段名保留或排除你真正需要的列。',
      whenToUse: ['上游表格字段很多，但下游算法或图表只需要其中一部分。'],
      inputGuide: ['需要上游提供表格数据。', '字段名来自上游结果，可通过搜索或正则快速筛选。'],
      parameterGuide: [
        {
          property: 'mode',
          title: '选择模式',
          content: '包含表示只保留选中字段，不包含表示从当前表格中删除选中字段。',
        },
      ],
      outputGuide: ['输出结果仍是表格数据，但字段集合会缩减。'],
      nextSteps: ['通常接相关性分析、图表展示或导出节点。'],
      commonIssues: [
        {
          title: '输出字段为空',
          resolution: '先确认字段选择模式是否正确，再检查搜索结果和已选字段是否匹配上游字段名。',
        },
      ],
    },
    {
      useCases: ['为算法保留关键字段', '图表前裁剪字段', '按字段名做列级筛选'],
      keywords: ['字段选择', '列筛选', '字段裁剪', '正则搜索'],
      workflowRoles: ['数据准备'],
      inputKinds: ['table'],
      outputKinds: ['table'],
      recommendedPrevNodes: ['file-import', 'data-cleaning', 'data-filter'],
      recommendedNextNodes: ['pearson', 'chart-display', 'data-export'],
    },
  ),
  sort: createEntry(
    {
      summary: '按多个优先级规则对数据行排序，支持升序和倒序组合。',
      whenToUse: ['你需要先按分数、时间或类别顺序整理数据，再送入后续节点。'],
      inputGuide: ['需要上游提供表格数据。', '排序规则的先后顺序就是优先级顺序。'],
      parameterGuide: [
        {
          property: 'sortRules',
          title: '排序规则',
          content: '越靠前的规则优先级越高，当前规则相同的记录才会继续比较下一条规则。',
        },
      ],
      outputGuide: ['输出结果是排序后的表格数据，字段结构保持不变。'],
      nextSteps: ['排序后可继续接数据量限制、图表展示或导出。'],
      commonIssues: [
        {
          title: '排序结果看起来不稳定',
          resolution: '建议补充更细的后续排序规则，避免大量记录在前几条规则上完全相同。',
        },
      ],
    },
    {
      useCases: ['按分数排序', '按多字段优先级排序', '结果展示前整理顺序'],
      keywords: ['排序', '升序', '倒序', '多字段排序'],
      workflowRoles: ['数据准备'],
      inputKinds: ['table'],
      outputKinds: ['table'],
      recommendedPrevNodes: ['data-filter', 'field-selection'],
      recommendedNextNodes: ['data-limit', 'chart-display', 'data-export'],
    },
  ),
  'data-limit': createEntry(
    {
      summary: '截断表格数据量，只保留最前面或最后面的 n 条记录。',
      whenToUse: ['你只想看头部样本、尾部样本，或在图表前控制数据规模。'],
      inputGuide: ['需要上游提供表格数据。', '保留数量超过总行数时会直接返回全部数据。'],
      parameterGuide: [
        {
          property: 'mode',
          title: '保留方式',
          content: '保留前 n 条适合看头部样本，保留后 n 条适合看尾部样本或最近记录。',
        },
      ],
      outputGuide: ['输出结果是截断后的表格数据。'],
      nextSteps: ['通常接图表展示、导出，或作为调试用的数据裁剪节点。'],
      commonIssues: [
        {
          title: '结果条数少于预期',
          resolution: '先检查上游是否已经筛选过数据，再确认保留数量是否设置正确。',
        },
      ],
    },
    {
      useCases: ['截断大表', '保留头部样本', '保留尾部样本'],
      keywords: ['限制数据量', '截断', '前 n 条', '后 n 条'],
      workflowRoles: ['数据准备'],
      inputKinds: ['table'],
      outputKinds: ['table'],
      recommendedPrevNodes: ['sort', 'data-filter'],
      recommendedNextNodes: ['chart-display', 'data-export'],
    },
  ),
  'data-profiling': createEntry(
    {
      summary: '自动识别字段类型和风险，快速看懂当前数据质量。',
      whenToUse: ['你想在正式分析前先检查缺失率、常量列、疑似 ID 和异常值风险。'],
      inputGuide: ['需要上游提供表格数据。', '可选目标字段后，报告会额外提示目标字段是否适合建模。'],
      outputGuide: ['输出结果是报告，包含摘要、风险字段和图表。'],
      nextSteps: ['如果发现风险字段，通常返回数据清洗；如果质量可用，可以进入分析节点。'],
      commonIssues: [
        {
          title: '报告里风险字段较多',
          resolution: '说明当前数据仍需整理，优先回到数据清洗或筛选节点做预处理。',
        },
      ],
    },
    {
      useCases: ['做数据体检', '检查字段风险', '判断目标字段是否可用'],
      keywords: ['数据体检', '字段画像', '风险', '缺失率'],
      workflowRoles: ['数据准备'],
      inputKinds: ['table'],
      outputKinds: ['report'],
      recommendedPrevNodes: ['file-import', 'neighbor-system', 'data-merge'],
      recommendedNextNodes: ['data-cleaning', 'pearson', 'xgboost-shap'],
    },
  ),
  pearson: createEntry(
    {
      summary: '计算指定 X / Y 数值字段之间的 Pearson 线性相关性，并支持按 Y 字段切换排行。',
      whenToUse: ['你关心线性相关强弱，希望比较多组 X 字段与一个或多个 Y 字段之间的关系。'],
      inputGuide: ['需要上游提供表格数据。', '输入字段最好已经清洗为数值型。', '节点只会计算已选择的 X / Y 字段交叉相关。'],
      parameterGuide: [
        {
          property: 'xFields',
          title: 'X 字段',
          content: '作为横轴因子集合参与计算。只会输出这些字段与 Y 字段之间的相关性结果。',
        },
        {
          property: 'yFields',
          title: 'Y 字段',
          content: '作为重点观察对象参与计算。结果区的排行图可以在这些 Y 字段之间切换查看。',
        },
      ],
      outputGuide: ['输出结果是相关性分析报告，含 X / Y 热力图、按 Y 切换的相关性排行和交叉明细。'],
      nextSteps: ['如果想看可视化对比，可继续接图表展示；若结果满意，也可直接导出。'],
      commonIssues: [
        {
          title: '运行后没有结果或字段很少',
          resolution: '先确认 X / Y 字段都已选择，且这些字段确实能被识别为数值型，必要时先做数据清洗。',
        },
      ],
    },
    {
      useCases: ['线性相关分析', '目标因子排序', '相关矩阵分析'],
      keywords: ['Pearson', '相关系数', '线性相关', '热力图'],
      workflowRoles: ['分析终点'],
      inputKinds: ['table'],
      outputKinds: ['report'],
      recommendedPrevNodes: ['data-cleaning', 'data-filter', 'data-aggregation'],
      recommendedNextNodes: ['chart-display', 'data-export'],
    },
  ),
  spearman: createEntry(
    {
      summary: '计算指定 X / Y 字段之间更稳健的 Spearman 秩相关性，适合非线性但单调的场景。',
      whenToUse: ['你怀疑字段之间不是线性关系，但排序趋势依然明显。'],
      inputGuide: ['需要上游提供表格数据。', '输入字段最好能转成数值。', '节点只计算已选择的 X / Y 交叉关系。'],
      outputGuide: ['输出结果是秩相关报告，适合与 Pearson 结果做对比，并支持切换不同 Y 字段排行。'],
      nextSteps: ['如需和其他方法对照，可并行跑 Pearson 或 Kendall。'],
      commonIssues: [
        {
          title: '结果与 Pearson 不一致',
          resolution: '这是正常现象，Spearman 更关注排序和单调趋势，不强调严格线性。',
        },
      ],
    },
    {
      useCases: ['单调关系分析', '非线性相关探索'],
      keywords: ['Spearman', '秩相关', '单调关系'],
      workflowRoles: ['分析终点'],
      inputKinds: ['table'],
      outputKinds: ['report'],
      recommendedPrevNodes: ['data-cleaning', 'data-filter'],
      recommendedNextNodes: ['data-export'],
    },
  ),
  kendall: createEntry(
    {
      summary: '计算指定 X / Y 字段之间的 Kendall 秩相关，适合样本较小或更重视排序一致性的分析。',
      whenToUse: ['你更关心秩次一致性，或想用更稳健的方法辅助判断。'],
      inputGuide: ['需要上游提供表格数据。', '输入字段最好已经清洗为数值字段。', '节点只计算已选择的 X / Y 交叉关系。'],
      outputGuide: ['输出结果是 Kendall 相关分析报告，包含热力图、Y 切换排行与交叉明细。'],
      nextSteps: ['常用于和 Pearson、Spearman 交叉验证结论。'],
      commonIssues: [
        {
          title: '数值字段太少无法运行',
          resolution: '先补充数值型因子，或对可编码字段先做数据清洗中的标签编码。',
        },
      ],
    },
    {
      useCases: ['小样本秩相关分析', '排序一致性验证'],
      keywords: ['Kendall', '秩相关', '排序一致性'],
      workflowRoles: ['分析终点'],
      inputKinds: ['table'],
      outputKinds: ['report'],
      recommendedPrevNodes: ['data-cleaning', 'data-filter'],
      recommendedNextNodes: ['data-export'],
    },
  ),
  lasso: createEntry(
    {
      summary: '用真实 Lasso 回归做特征筛选，查看系数排序、入选因子和正则路径。',
      whenToUse: ['你希望从多个候选因子中做一次简单的筛选排序。'],
      inputGuide: ['需要上游提供表格数据。', '输入字段应尽量为数值型，且指定目标变量。', '依赖本地 Python 后端分析服务。'],
      outputGuide: ['输出结果是回归分析报告，包含模型摘要、特征系数排序和正则路径。'],
      nextSteps: ['若想做更强解释，可进一步尝试 Xgboost + SHAP。'],
      commonIssues: [
        {
          title: '目标字段选择不正确',
          resolution: '先确认目标变量字段名来自上游真实字段，而不是手动输入错误名称。',
        },
      ],
    },
    {
      useCases: ['特征筛选', '回归预分析'],
      keywords: ['Lasso', '回归', '特征筛选'],
      workflowRoles: ['分析终点'],
      inputKinds: ['table'],
      outputKinds: ['report'],
      requiredConfig: ['targetField'],
      recommendedConfigPatterns: ['先选目标变量，再尽量只保留数值型候选因子进入分析。'],
      commonMistakes: ['把非数值字段直接送入回归', '目标字段没有有效波动仍尝试建模'],
      recommendedPrevNodes: ['data-cleaning', 'data-aggregation'],
      recommendedNextNodes: ['data-export'],
    },
  ),
  'multiple-linear-regression': createEntry(
    {
      summary: '对多个数值因子做多元线性回归，查看拟合质量、系数排序和残差表现。',
      whenToUse: ['你需要同时评估多个因子对目标字段的线性解释能力，而不是只看两两相关。'],
      inputGuide: ['需要上游提供表格数据。', '输入字段应尽量为数值型，并明确目标变量字段。', '依赖本地 Python 后端分析服务。'],
      parameterGuide: [
        {
          property: 'targetField',
          title: '目标变量',
          content: '选择要被解释的目标字段，通常是产出指标、评分或连续数值结果。',
        },
        {
          property: 'factorNames',
          title: '影响因子',
          content: '建议优先选择已完成清洗和缩放的数值字段，避免把明显无效字段直接送入回归。',
        },
      ],
      outputGuide: ['输出结果是回归分析报告，包含模型摘要、回归系数排序、预测值对比和残差分布。'],
      nextSteps: ['如果发现共线性明显，建议继续做 VIF 检测。', '如果想验证非线性关系，可继续尝试 Xgboost + SHAP。'],
      commonIssues: [
        {
          title: '模型无法运行或指标很差',
          resolution: '先检查目标字段是否有足够波动，再确认影响因子是否为数值字段，并尽量先做数据清洗。',
        },
      ],
    },
    {
      useCases: ['多因子线性解释', '回归基线分析', '多元线性建模'],
      keywords: ['多元线性回归', '线性回归', '回归系数', '残差'],
      workflowRoles: ['分析终点'],
      inputKinds: ['table'],
      outputKinds: ['report'],
      requiredConfig: ['targetField'],
      recommendedConfigPatterns: ['优先选择 2 个以上已清洗的数值因子，并明确单一目标字段。'],
      commonMistakes: ['把明显无关字段一起送入回归', '未先处理缺失值就直接建模'],
      recommendedPrevNodes: ['data-cleaning', 'field-selection', 'data-aggregation'],
      recommendedNextNodes: ['data-export'],
    },
  ),
  'random-forest-feature-importance': createEntry(
    {
      summary: '使用随机森林评估各因子对目标字段的相对重要性，快速识别头部关键因子。',
      whenToUse: ['你想在非线性关系场景下做一轮因子贡献排序，而不是只看线性回归系数。'],
      inputGuide: ['需要上游提供表格数据。', '输入字段应尽量为数值型，并明确目标变量字段。', '依赖本地 Python 后端分析服务。'],
      parameterGuide: [
        {
          property: 'targetField',
          title: '目标变量',
          content: '选择要解释或预测的核心目标字段，通常是连续数值指标。',
        },
        {
          property: 'factorNames',
          title: '影响因子',
          content: '建议只保留已清洗完成的候选因子，避免无关字段稀释重要性排序。',
        },
        {
          property: 'nEstimators',
          title: '树数量',
          content: '树越多结果通常越稳定，但计算也会更慢。P1 版本默认 200 棵树即可。',
        },
      ],
      outputGuide: ['输出结果是分析报告，包含特征重要性排行、累计重要性、预测值对比和结果解读提示。'],
      nextSteps: ['如果头部因子集中，可继续做多元线性回归或导出结果。', '如果重要性分布较平，建议先做字段筛选或结合业务规则再收敛。'],
      commonIssues: [
        {
          title: '结果排序不稳定',
          resolution: '先检查样本量和字段质量，再缩小候选因子范围，避免把大量弱相关字段同时送入模型。',
        },
      ],
    },
    {
      useCases: ['非线性因子排序', '关键特征筛选', '建模前重要性预分析'],
      keywords: ['随机森林', '特征重要性', '因子排序', '随机森林回归'],
      workflowRoles: ['分析终点'],
      inputKinds: ['table'],
      outputKinds: ['report'],
      requiredConfig: ['targetField'],
      recommendedConfigPatterns: ['先选目标变量，再控制候选因子范围；默认树数量和最大深度通常足够起步。'],
      commonMistakes: ['一次放入过多弱相关字段导致排序分散', '把类别文本字段直接当成数值特征使用'],
      recommendedPrevNodes: ['data-cleaning', 'field-selection', 'vif'],
      recommendedNextNodes: ['multiple-linear-regression', 'data-export'],
    },
  ),
  anova: createEntry(
    {
      summary: '通过单因素方差分析判断不同分组在数值目标字段上的均值差异是否显著。',
      whenToUse: ['你想比较不同批次、工艺段、实验条件或类别分组在某个数值指标上的差异。'],
      inputGuide: ['需要上游提供表格数据。', '目标字段应为数值型，分组字段应能区分出至少两个有效分组。'],
      parameterGuide: [
        {
          property: 'targetField',
          title: '目标字段',
          content: '选择要比较组间均值差异的数值字段，例如良率、评分、温度或时长。',
        },
        {
          property: 'groupField',
          title: '分组字段',
          content: '选择用于分组的类别字段，例如批次、配方、产线或实验组别。',
        },
      ],
      outputGuide: ['输出结果是方差分析报告，包含 F 值、P 值、分组均值对比、箱线图和分组明细。'],
      nextSteps: ['如果差异显著，可继续结合图表或导出结果做业务复盘。', '若组间样本量不均衡，建议先补看结果可信提示。'],
      commonIssues: [
        {
          title: '无法完成分析',
          resolution: '先确认目标字段是数值字段，且至少有两个有效分组，每组最好都有足够样本。',
        },
      ],
    },
    {
      useCases: ['比较不同分组的均值差异', '验证实验组与对照组差异', '分析批次或工艺段差异'],
      keywords: ['方差分析', 'ANOVA', '分组差异', '显著性'],
      workflowRoles: ['分析终点'],
      inputKinds: ['table'],
      outputKinds: ['report'],
      requiredConfig: ['targetField', 'groupField'],
      recommendedConfigPatterns: ['目标字段选连续数值，分组字段选类别字段，并保证至少两个有效分组。'],
      commonMistakes: ['把目标字段和分组字段选成同一个字段', '分组样本量过少仍直接解释显著性'],
      recommendedPrevNodes: ['data-cleaning', 'field-selection', 'data-filter'],
      recommendedNextNodes: ['chart-display', 'data-export'],
    },
  ),
  vif: createEntry(
    {
      summary: '检测多个数值字段之间的共线性风险，识别不适合一起进入回归的高冗余因子。',
      whenToUse: ['你已经挑出一批候选因子，想先判断它们之间是否高度重叠，再进入回归或特征筛选。'],
      inputGuide: ['需要上游提供表格数据。', '输入字段应尽量为数值型，且建议先完成缺失值处理。'],
      parameterGuide: [
        {
          property: 'factorNames',
          title: '检测字段',
          content: '建议只放真正准备一起进入模型的候选因子，避免把明显无关字段一起带入诊断。',
        },
      ],
      outputGuide: ['输出结果是诊断报告，包含 VIF 排序、风险提示和字段明细。'],
      nextSteps: ['若高 VIF 字段较多，建议先删减字段、做聚合，或继续尝试 PCA。'],
      commonIssues: [
        {
          title: '有效样本不足',
          resolution: 'VIF 依赖完整样本矩阵，若多个字段缺失较多，建议先做清洗或缩小检测字段范围。',
        },
      ],
    },
    {
      useCases: ['回归前共线性检查', '候选因子去冗余', '高相关字段诊断'],
      keywords: ['VIF', '共线性', '多重共线性', '诊断'],
      workflowRoles: ['分析终点'],
      inputKinds: ['table'],
      outputKinds: ['report'],
      recommendedConfigPatterns: ['只放准备一起进入模型的数值候选因子，字段数量先控制在可解释范围内。'],
      commonMistakes: ['把无关字段和目标字段一起混进 VIF 检测', '缺失较多的字段未处理就直接诊断'],
      recommendedPrevNodes: ['data-cleaning', 'field-selection', 'multiple-linear-regression'],
      recommendedNextNodes: ['multiple-linear-regression', 'data-export'],
    },
  ),
  pca: createEntry(
    {
      summary: '通过 PCA 主成分分析识别多因子中的主要方差方向，辅助做降维和字段压缩。',
      whenToUse: ['你发现候选因子较多、共线性较强，想先判断能否压缩成少量主成分再继续分析。'],
      inputGuide: ['需要上游提供表格数据。', '输入字段应为数值型，且建议先完成缺失值处理。'],
      parameterGuide: [
        {
          property: 'factorNames',
          title: '分析字段',
          content: '建议只放真正需要参与降维的候选因子，避免无关字段稀释主成分结构。',
        },
        {
          property: 'componentCount',
          title: '主成分数量',
          content: '通常先看前 2-3 个主成分即可，重点关注解释方差占比是否足够高。',
        },
      ],
      outputGuide: ['输出结果是 PCA 分析报告，包含解释方差、字段载荷热力图和载荷明细。'],
      nextSteps: ['若前几项解释方差较高，可考虑后续用更少的字段或主成分表达原始信息。'],
      commonIssues: [
        {
          title: '解释方差不集中',
          resolution: '说明当前字段结构较分散，PCA 未必适合直接做强压缩，建议结合业务分组重新建模。',
        },
      ],
    },
    {
      useCases: ['多因子降维', '共线性后的结构诊断', '字段压缩前分析'],
      keywords: ['PCA', '主成分分析', '降维', '载荷'],
      workflowRoles: ['分析终点'],
      inputKinds: ['table'],
      outputKinds: ['report'],
      recommendedConfigPatterns: ['优先选择数值型候选因子，并先看前 2-3 个主成分的解释方差是否集中。'],
      commonMistakes: ['把不相关字段一起纳入降维', '解释方差不集中时仍强行压成极少主成分'],
      recommendedPrevNodes: ['data-cleaning', 'field-selection', 'vif'],
      recommendedNextNodes: ['multiple-linear-regression', 'data-export'],
    },
  ),
  'xgboost-shap': createEntry(
    {
      summary: '通过 Xgboost 结合 SHAP 值解释模型，查看各因子对目标的贡献和趋势。',
      whenToUse: ['你希望得到更强的特征贡献解释，而不仅是简单相关性。'],
      inputGuide: ['需要上游提供表格数据。', '依赖本地后端分析服务，且输入应尽量为数值型。'],
      parameterGuide: [
        {
          property: 'targetField',
          title: '目标变量',
          content: '这是建模的核心配置，必须准确指向你要预测或解释的字段。',
        },
      ],
      outputGuide: ['输出结果是带图表和补充图片的分析报告。'],
      nextSteps: ['若结果需要归档或分享，可直接接数据导出。'],
      commonIssues: [
        {
          title: '后端请求失败',
          resolution: '先确认本地后端服务已经启动，并检查输入数据是否满足建模要求。',
        },
      ],
    },
    {
      useCases: ['特征贡献解释', '模型可解释性分析', 'SHAP 报告'],
      keywords: ['Xgboost', 'SHAP', '特征重要性', '模型解释'],
      workflowRoles: ['分析终点'],
      inputKinds: ['table'],
      outputKinds: ['report'],
      requiredConfig: ['targetField'],
      recommendedConfigPatterns: ['优先给目标字段和较干净的数值因子，先完成基础清洗再做 SHAP 解释。'],
      commonMistakes: ['后端服务未启动就直接运行', '把大量脏字段直接送入解释模型'],
      recommendedPrevNodes: ['data-cleaning', 'data-aggregation'],
      recommendedNextNodes: ['data-export'],
    },
  ),
  'chart-display': createEntry(
    {
      summary: '把表格或分组数据快速转换成散点图、柱状图或箱线图。',
      whenToUse: ['你想先看趋势和分布，而不是直接看文本报告。'],
      inputGuide: ['可接单表数据，也可接分组集合数据。', '图表类型不同，对字段要求也不同。'],
      parameterGuide: [
        {
          property: 'chartType',
          title: '图表类型',
          content: '散点图适合看双变量关系，柱状图适合分类对比，箱线图适合分布对比。',
        },
      ],
      outputGuide: ['输出结果是图表，可直接查看，也可作为结果展示节点。'],
      nextSteps: ['如果图表满意，可以接数据导出或保留为终端节点。'],
      commonIssues: [
        {
          title: '图表无法生成',
          resolution: '先确认所选 X/Y 字段存在，且用于数值轴的字段可以被识别为数值。',
        },
      ],
    },
    {
      useCases: ['快速画散点图', '做分类柱状图', '比较多组分布'],
      keywords: ['图表', '可视化', '散点图', '柱状图', '箱线图'],
      workflowRoles: ['分析终点'],
      inputKinds: ['table', 'tableCollection'],
      outputKinds: ['chart'],
      recommendedPrevNodes: ['data-merge', 'data-aggregation', 'data-filter'],
      recommendedNextNodes: ['data-export'],
    },
  ),
  'data-export': createEntry(
    {
      summary: '把当前表格结果导出成 CSV、Excel 或 JSON 文件。',
      whenToUse: ['你需要把工作流结果交给其他人，或保存到本地继续处理。'],
      inputGuide: ['需要上游提供表格数据。', '当前节点通常放在流程末尾作为导出终点。'],
      parameterGuide: [
        {
          property: 'format',
          title: '导出格式',
          content: 'CSV 适合轻量交换，Excel 适合业务查看，JSON 适合程序继续消费。',
        },
      ],
      outputGuide: ['输出结果是可下载文件信息，而不是继续流转的数据表。'],
      nextSteps: ['这是终端节点，通常作为流程最后一步。'],
      commonIssues: [
        {
          title: '没有可导出的内容',
          resolution: '说明上游没有产生表格数据，先返回检查输入和筛选结果。',
        },
      ],
    },
    {
      useCases: ['导出结果为 CSV', '导出 Excel 报表', '导出 JSON 数据'],
      keywords: ['导出', '下载', 'CSV', 'Excel', 'JSON'],
      workflowRoles: ['分析终点'],
      inputKinds: ['table'],
      outputKinds: ['file'],
      recommendedPrevNodes: ['pearson', 'chart-display', 'data-filter'],
    },
  ),
}

const fallbackHelpEntry = (definition: NodeDefinition): NodeHelpCatalogEntry => ({
  help: {
    summary: definition.description,
    whenToUse: ['该节点帮助正在补充中，请先结合节点名称和参数说明使用。'],
    inputGuide: ['请根据当前节点连接关系确认输入类型是否正确。'],
    outputGuide: ['请运行节点后在输出区查看实际结果。'],
  },
})

export const attachNodeHelp = <T extends NodeDefinition>(definition: T): T => {
  const entry = nodeHelpCatalog[definition.name] ?? fallbackHelpEntry(definition)
  return {
    ...definition,
    help: entry.help,
    assistantHints: entry.assistantHints ?? definition.assistantHints,
  }
}
