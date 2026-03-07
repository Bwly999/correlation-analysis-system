import type { NodeDefinition } from '../types';

export const xgboostShapNode: NodeDefinition = {
  name: 'xgboost-shap',
  displayName: 'Xgboost + SHAP',
  icon: 'bar-chart-3',
  category: 'terminal',
  description: '使用 Xgboost 结合 SHAP 值方法分析各个因子对目标变量的贡献程度和影响趋势。',
  properties: [
    {
      name: 'targetLabel',
      displayName: '目标变量 (Y)',
      type: 'string',
      default: 'target',
      placeholder: '请输入回归/分类的目标字段名'
    }
  ],
  execute: async (input, config) => {
    if (!input || !input.data) throw new Error("无输入数据");
    
    try {
      // 尝试调用后端 Python 服务
      const response = await fetch('http://localhost:8000/analyze/xgboost-shap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: input.data,
          target: config.targetLabel,
          config: config
        })
      });

      if (response.ok) {
        const result = await response.json();
        const { r2, mae, importance } = result.results;
        
        return {
          viewType: 'report',
          report: {
            title: 'Xgboost + SHAP 因子贡献度分析报告 (后端计算)',
            sections: [
              {
                type: 'text',
                content: `该报告由 Python 后端 RobustAnalyzerTool 计算得出。\n模型评估结果：R² = ${r2}，MAE = ${mae}。`
              },
              {
                title: '特征重要性排行 (SHAP)',
                type: 'chart',
                option: {
                  tooltip: { trigger: 'axis' },
                  xAxis: { type: 'value', name: 'SHAP 值' },
                  yAxis: { type: 'category', data: importance.map((i: any) => i.name).reverse() },
                  series: [{ 
                    name: '重要性', 
                    type: 'bar', 
                    data: importance.map((i: any) => i.value).reverse(), 
                    itemStyle: { color: '#6366f1' } 
                  }]
                }
              }
            ]
          }
        };
      }
    } catch (err) {
      console.warn('Backend unavailable, falling back to mock data', err);
    }

    // 回退到模拟数据 (Mock)
    return {
      viewType: 'report',
      report: {
        title: 'Xgboost + SHAP 因子贡献度分析报告 (Mock)',
        sections: [
          {
            type: 'text',
            content: '由于未检测到后端服务，当前显示模拟分析结果。\n模型评估结果：R² = 0.82，RMSE = 1.25。'
          },
          {
            title: '特征重要性排行',
            type: 'chart',
            option: {
              tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
              xAxis: { type: 'value', name: 'SHAP 值' },
              yAxis: { type: 'category', data: ['因子C', '因子B', '因子A'] },
              series: [{ name: '重要性', type: 'bar', data: [0.45, 0.62, 0.85], itemStyle: { color: '#6366f1' } }]
            }
          }
        ]
      }
    };
  }
};
