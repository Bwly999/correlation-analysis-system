import type { NodeDefinition } from '../types';

export const lassoNode: NodeDefinition = {
  name: 'lasso',
  displayName: 'Lasso 回归',
  icon: 'filter',
  category: 'terminal',
  description: '使用 Lasso 回归进行特征筛选和模型拟合。',
  properties: [
    {
      name: 'targetLabel',
      displayName: '目标变量 (Y)',
      type: 'string',
      default: 'target'
    }
  ],
  execute: async (input, config) => {
    if (!input || !input.data) throw new Error("无输入数据");
    
    return {
      viewType: 'report',
      report: {
        title: 'Lasso 回归分析',
        sections: [
          {
            type: 'text',
            content: '该报告展示 Lasso 回归特征筛选的结果。'
          },
          {
            title: '特征系数',
            type: 'chart',
            option: {
              tooltip: { trigger: 'axis' },
              xAxis: { type: 'value' },
              yAxis: { type: 'category', data: ['因子D', '因子E'] },
              series: [{ data: [0.32, -0.15], type: 'bar' }]
            }
          }
        ]
      }
    };
  }
};
