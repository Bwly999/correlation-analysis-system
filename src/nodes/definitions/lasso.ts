import type { NodeDefinition } from '../types'
import { createReportResult, extractTableRows } from '../result'

export const lassoNode: NodeDefinition = {
  name: 'lasso',
  displayName: 'Lasso 回归',
  icon: 'filter',
  category: 'terminal',
  description: '使用 Lasso 回归进行特征筛选并输出简要的建模结果。',
  properties: [
    {
      name: 'targetField',
      displayName: '目标变量 (Y)',
      type: 'options',
      default: 'target',
      useUpstreamFactors: true,
      editable: true,
    },
  ],
  execute: async (input, config) => {
    const rows = extractTableRows(input)
    if (!rows || rows.length === 0) {
      throw new Error('无输入数据')
    }

    const targetField = config.targetField || 'target'

    return createReportResult(
      {
        title: 'Lasso 回归分析',
        sections: [
          {
            type: 'text',
            content: `该报告展示 Lasso 回归特征筛选的模拟结果。（目标字段：${targetField}，样本数：${rows.length}）`,
          },
          {
            title: '特征系数',
            type: 'chart',
            option: {
              tooltip: { trigger: 'axis' },
              xAxis: { type: 'value' },
              yAxis: { type: 'category', data: ['因子D', '因子E'] },
              series: [{ data: [0.32, -0.15], type: 'bar' }],
            },
          },
        ],
      },
      {
        meta: {
          sourceData: rows,
          metrics: {
            rowCount: rows.length,
            targetField,
          },
        },
      },
    )
  },
}
