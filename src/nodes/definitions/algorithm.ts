import type { NodeDefinition } from '../types';

export const algorithmNode: NodeDefinition = {
  name: 'algorithm',
  displayName: '算法模型',
  icon: 'bar-chart-3',
  category: 'model',
  description: '对处理后的多因子数据进行建模分析。',
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
    
    // 模拟算法结果
    if (config.modelType === 'xgboost_shap') {
      return {
        model: 'Xgboost + SHAP',
        featureImportance: [
          { name: '因子A', value: 0.85 },
          { name: '因子B', value: 0.62 },
          { name: '因子C', value: 0.45 }
        ],
        impactCurves: {
          '因子A': [ { x: 0, y: 10 }, { x: 50, y: 25 }, { x: 100, y: 60 } ]
        },
        summary: "因子A对目标变量具有显著的正向线性影响。"
      };
    } else if (config.modelType === 'pearson') {
      return {
        model: 'Pearson Correlation',
        matrix: [
          [1.0, 0.8, 0.2],
          [0.8, 1.0, 0.1],
          [0.2, 0.1, 1.0]
        ],
        labels: ['因子A', '因子B', '目标']
      };
    }

    return { 
      result: "Analysis completed",
      model: config.modelType
    };
  }
};
