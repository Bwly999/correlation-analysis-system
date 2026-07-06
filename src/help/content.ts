import type { HelpCenterContent } from './types'

export const helpCenterContent: HelpCenterContent = {
  quickStart: [
    {
      step: 1,
      title: '第 1 步：导入数据',
      goal: '将原始数据引入工作流，这是所有分析的起点。',
      recommendedNodes: ['file-import', 'manual-json-import', 'neighbor-system'],
      pitfalls: ['上传文件后，悬停节点点击“预览”图标，确认字段是否正确识别。'],
    },
    {
      step: 2,
      title: '第 2 步：数据清洗',
      goal: '剔除脏数据，处理缺失值和异常值，提升分析结果的可靠性。',
      recommendedNodes: ['data-dedup', 'data-missing-outlier', 'data-encoding-scaling', 'data-filter'],
      pitfalls: ['对于多因子分析，建议先使用“异常值处理”节点剔除偏离严重的离群点。'],
    },
    {
      step: 3,
      title: '第 3 步：执行分析',
      goal: '选择算法模型，一键生成可视化分析报告。',
      recommendedNodes: [
        'correlation-analysis',
        'xgboost-shap',
        'random-forest-feature-importance',
        'multiple-linear-regression',
      ],
      pitfalls: [
        '初次尝试建议先使用“相关性分析”查看全局趋势，再用“XGBoost”探查深度影响。',
      ],
    },
  ],
  faqs: [
    {
      question: '为什么节点之间连不上？',
      answer: '系统有严格的连接规则：Trigger 只能连 Action/Terminal，Action 只能连 Action/Terminal，而 Terminal 是终点，不能再向外连线。同时请检查目标节点的输入槽位是否已满。',
    },
    {
      question: '什么时候该用 Pearson 还是 Spearman？',
      answer:
        '如果因子和目标是线性相关的，优先用 Pearson；如果因子和目标是单调但不一定线性的（如等级、排序），请改用 Spearman 或 Kendall。',
    },
    {
      question: '分析结果中的 SHAP 值代表什么？',
      answer:
        'SHAP 值量化了每个特征对模型预测结果的贡献。正值表示该因子倾向于提高目标 Y，负值则倾向于降低目标 Y。SHAP 依赖图能揭示这种影响在不同数值区间的动态变化。',
    },
    {
      question: '我的数据散落在两个表里，怎么合并？',
      answer:
        '分别使用两个 Trigger 节点导入，然后连入“数据合并 (data-merge)”节点。选择“横向关联”模式，并指定关联字段（如 SN 条码）即可。',
    },
  ],
  advancedTips: [
    {
      title: '单节点快速调试',
      content: '修改参数后，右键点击节点并选择“调试当前节点”。系统会复用上游已有缓存，秒级呈现调整后的结果，无需重跑整条链路。',
      tag: '提效',
    },
    {
      title: '共线性检测 (VIF)',
      content: '在进行回归建模（如多元线性回归）前，建议先连入“VIF 共线性检测”节点。若 VIF 值过高，说明因子间存在冗余，建议精简变量后再分析。',
      tag: '进阶',
    },
    {
      title: '非线性相关探查',
      content: '简单相关系数只能捕捉线性关系。若怀疑因子对 Y 的影响是“U型”或更复杂的曲线，请使用“XGBoost + SHAP”节点，它的依赖图能揭示任何形式的非线性趋势。',
      tag: '算法',
    },
    {
      title: '版本历史与回退',
      content: '工作流左侧提供“版本历史”舱，记录了每一次保存和运行。如果您对当前的修改不满意，可以随时一键回滚到之前的任意快照状态。',
      tag: '稳健',
    },
  ],
  categories: [
    {
      id: 'trigger',
      title: '数据接入 / Triggers',
      description: '负责引入原始数据或宿主系统数据，是所有分析流程的起点。',
    },
    {
      id: 'action',
      title: '数据处理 / Actions',
      description: '负责清洗、筛选、聚合、合并和转换，为算法提供干净、规整的输入。',
    },
    {
      id: 'terminal',
      title: '分析输出 / Terminals',
      description: '执行核心统计、机器学习算法，生成报告、图表或导出最终文件。',
    },
  ],
}
