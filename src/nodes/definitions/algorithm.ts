import type { NodeDefinition } from '../types';

export const algorithmNode: NodeDefinition = {
  name: 'algorithm',
  displayName: '算法模型',
  icon: 'bar-chart-3',
  category: 'terminal',
  description: '对处理后的多因子数据进行建模分析，生成数据报告。',
  properties: [
    {
      name: 'modelType',
      displayName: '分析模型',
      type: 'options',
      default: 'xgboost_shap',
      options: [
        { name: 'Xgboost + SHAP (贡献度分析)', value: 'xgboost_shap' },
        { name: 'Lasso 回归 (特征筛选)', value: 'lasso' },
        { name: 'Pearson 相关系数矩阵', value: 'pearson' }
      ]
    },
    {
      name: 'targetLabel',
      displayName: '目标变量 (Y)',
      type: 'string',
      default: 'target',
      placeholder: '请输入回归/分类的目标字段名'
    }
  ],
  execute: async (input, config) => {
    if (!input || !input.data) return { message: "无输入数据" };
    console.log('Running algorithm:', config.modelType, 'on target:', config.targetLabel);
    
    // 模拟算法结果并构建报告
    if (config.modelType === 'xgboost_shap') {
      return {
        viewType: 'report',
        report: {
          title: 'Xgboost + SHAP 因子贡献度分析报告',
          sections: [
            {
              type: 'text',
              content: '该报告使用 Xgboost 结合 SHAP 值方法分析各个因子对目标变量的贡献程度和影响趋势。\n模型评估结果：R² = 0.82，RMSE = 1.25，模型拟合良好。'
            },
            {
              title: '特征重要性排行',
              type: 'chart',
              option: {
                tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
                grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
                xAxis: { type: 'value', name: 'SHAP 值' },
                yAxis: { type: 'category', data: ['因子C', '因子B', '因子A'] },
                series: [
                  {
                    name: '重要性',
                    type: 'bar',
                    data: [0.45, 0.62, 0.85],
                    itemStyle: { color: '#6366f1' }
                  }
                ]
              }
            },
            {
              type: 'text',
              content: '根据上方特征重要性图表，因子A对目标变量具有最显著的贡献。'
            },
            {
              title: '因子A影响趋势',
              type: 'chart',
              option: {
                tooltip: { trigger: 'axis' },
                xAxis: { type: 'category', data: ['低', '中', '高'] },
                yAxis: { type: 'value' },
                series: [{ data: [10, 25, 60], type: 'line', smooth: true, itemStyle: { color: '#ec4899' } }]
              }
            }
          ]
        }
      };
    } else if (config.modelType === 'pearson') {
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
                grid: { height: '50%', top: '10%' },
                xAxis: { type: 'category', data: ['因子A', '因子B', '目标'] },
                yAxis: { type: 'category', data: ['因子A', '因子B', '目标'] },
                visualMap: { min: -1, max: 1, calculable: true, orient: 'horizontal', left: 'center', bottom: '15%' },
                series: [{
                  name: 'Pearson Correlation',
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

    return { viewType: 'report', report: { title: '分析完成', sections: [] } };
  }
};
