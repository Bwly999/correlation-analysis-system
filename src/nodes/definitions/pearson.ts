import type { NodeDefinition } from '../types';

export const pearsonNode: NodeDefinition = {
  name: 'pearson',
  displayName: 'Pearson 相关系数',
  icon: 'grid',
  category: 'terminal',
  description: '展示各因子之间以及因子与目标变量之间的线性相关性矩阵。',
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
        title: 'Pearson 相关系数矩阵分析',
        sections: [
          {
            type: 'text',
            content: '展示各因子之间以及因子与目标变量之间的线性相关性。'
          },
          {
            title: '相关性热力图',
            type: 'chart',
            option: {
              tooltip: { position: 'top' },
              visualMap: { min: -1, max: 1, calculable: true, orient: 'horizontal', left: 'center', bottom: '0%' },
              xAxis: { type: 'category', data: ['因子A', '因子B', '目标'] },
              yAxis: { type: 'category', data: ['因子A', '因子B', '目标'] },
              series: [{
                name: 'Correlation',
                type: 'heatmap',
                data: [
                  [0, 0, 1.0], [0, 1, 0.8], [0, 2, 0.2],
                  [1, 0, 0.8], [1, 1, 1.0], [1, 2, 0.1],
                  [2, 0, 0.2], [2, 1, 0.1], [2, 2, 1.0]
                ],
                label: { show: true }
              }]
            }
          }
        ]
      }
    };
  }
};
