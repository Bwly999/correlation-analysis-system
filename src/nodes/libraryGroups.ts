export const NODE_LIBRARY_GROUPS = [
  {
    id: 'import-data',
    label: '导入数据',
    categories: ['trigger'],
  },
  {
    id: 'clean-filter',
    label: '清洗与筛选',
    categories: ['action'],
  },
  {
    id: 'field-shaping',
    label: '字段与结构处理',
    categories: ['action'],
  },
  {
    id: 'merge-aggregate',
    label: '合并与聚合',
    categories: ['action'],
  },
  {
    id: 'stat-analysis',
    label: '统计分析',
    categories: ['terminal'],
  },
  {
    id: 'model-analysis',
    label: '模型分析',
    categories: ['terminal'],
  },
  {
    id: 'result-output',
    label: '结果展示与导出',
    categories: ['terminal'],
  },
] as const

export type NodeLibraryGroupId = (typeof NODE_LIBRARY_GROUPS)[number]['id']
