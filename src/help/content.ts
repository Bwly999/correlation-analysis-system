import type { HelpCenterContent } from './types'

export const helpCenterContent: HelpCenterContent = {
  quickStart: [
    {
      step: 1,
      title: '导入数据',
      goal: '先得到一份可以继续处理的表格数据。',
      recommendedNodes: ['file-import', 'manual-json-import', 'neighbor-system'],
      pitfalls: ['导入后先确认字段是否齐全、格式是否正确，再进入分析。'],
    },
    {
      step: 2,
      title: '数据准备',
      goal: '完成清洗、筛选、聚合或多源合并，让输入更适合分析。',
      recommendedNodes: ['data-cleaning', 'data-filter', 'data-aggregation', 'data-merge'],
      pitfalls: ['多源数据进入分析前，先确认字段对齐方式和关联键是否正确。'],
    },
    {
      step: 3,
      title: '分析输出',
      goal: '生成相关性报告、图表或导出文件，作为最终结果输出。',
      recommendedNodes: [
        'pearson',
        'spearman',
        'kendall',
        'lasso',
        'xgboost-shap',
        'chart-display',
        'data-export',
      ],
      pitfalls: ['终端节点前尽量保证输入是清晰、可解释的表格数据。'],
    },
  ],
  faqs: [
    {
      question: '为什么节点连不上？',
      answer: '先确认节点类别是否允许连接，再检查目标节点是否已达到输入数量上限。',
    },
    {
      question: '为什么节点没有输出？',
      answer: '先看输入区是否已有有效数据，再检查必填参数和运行时输入是否补齐。',
    },
    {
      question: '什么时候用 Pearson / Spearman / Kendall？',
      answer:
        '线性关系优先用 Pearson；只关心单调关系时用 Spearman；样本较小或排序关系更重要时可用 Kendall。',
    },
    {
      question: '什么时候需要先做数据清洗？',
      answer: '存在缺失值、异常值、非数值字段或量纲差异明显时，建议先经过数据清洗。',
    },
    {
      question: '什么时候需要数据合并？',
      answer: '当你需要把多个数据源纵向追加、横向关联或按组并行对比时，应先使用数据合并节点。',
    },
  ],
  categories: [
    {
      id: 'trigger',
      title: '数据接入',
      description: '负责引入原始数据或宿主系统数据，是工作流的起点。',
    },
    {
      id: 'action',
      title: '数据准备',
      description: '负责清洗、筛选、聚合、合并和体检，帮助你整理可分析输入。',
    },
    {
      id: 'terminal',
      title: '分析输出',
      description: '负责生成报告、图表或导出文件，是工作流的终点输出。',
    },
  ],
}
