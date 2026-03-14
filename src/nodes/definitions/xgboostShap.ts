import type { NodeDefinition } from '../types'

export const xgboostShapNode: NodeDefinition = {
  name: 'xgboost-shap',
  displayName: 'Xgboost + SHAP',
  icon: 'brain',
  category: 'terminal',
  description: '使用 Xgboost 结合 SHAP 值方法分析各个因子对目标变量的贡献程度和影响趋势。',
  properties: [
    {
      name: 'targetField',
      displayName: '目标变量 (Y)',
      type: 'options',
      default: 'target',
      useUpstreamFactors: true,
      editable: true,
      description: '选择回归/分类的目标字段名（支持从上游自动获取或手动输入）',
    },
    {
      name: 'factorNames',
      displayName: '影响因子 (X)',
      type: 'tags',
      useUpstreamFactors: true,
      description: '选择参与分析的因子列表。留空则默认使用除目标变量外的所有数值字段。',
    },
  ],
  execute: async (input, config) => {
    if (!input || !input.data) throw new Error('无输入数据')

    // 尝试调用后端 Python 服务
    const response = await fetch('http://localhost:8000/analyze/xgboost-shap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        data: input.data,
        target: config.targetField || 'target',
        config: config,
      }),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ detail: '后端服务响应异常' }))
      throw new Error(errorData.detail || `后端请求失败: ${response.statusText}`)
    }

    const result = await response.json()
    const {
      r2,
      mae,
      importance,
      beeswarm_image,
      dependence_images,
      raw_dependence_data,
      full_report_image,
    } = result.results

    const barChartOption = {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
      xAxis: { type: 'value', name: '平均绝对贡献度' },
      yAxis: {
        type: 'category',
        data: importance
          .slice(0, 15)
          .map((i: any) => i.name)
          .reverse(),
      },
      series: [
        {
          name: 'Mean |SHAP Value|',
          type: 'bar',
          data: importance
            .slice(0, 15)
            .map((i: any) => i.value)
            .reverse(),
          itemStyle: {
            color: '#ff0052', // SHAP 默认玫红色 (Rose-500 style)
            borderRadius: [0, 4, 4, 0],
          },
        },
      ],
    }

    const separatedSections: any[] = [
      {
        type: 'text',
        content: `### 模型评估结果\n- **R² (拟合优度)**: ${r2}\n- **MAE (平均绝对误差)**: ${mae}\n\n该分析基于 XGBoost 回归模型及 SHAP 归因理论。`,
      },
      {
        title: '特征重要性排行 (SHAP Importance)',
        type: 'chart',
        option: barChartOption,
      },
    ]

    if (beeswarm_image) {
      separatedSections.push({
        title: '因子影响分布 (SHAP Beeswarm Plot)',
        type: 'image',
        url: `data:image/png;base64,${beeswarm_image}`,
        alt: 'SHAP Beeswarm Plot',
      })
    }

    // 优先使用原始数据渲染前端 ECharts 依赖图
    if (raw_dependence_data && raw_dependence_data.length > 0) {
      raw_dependence_data.forEach((dep: any) => {
        const scatterOption = {
          title: { text: `影响曲线: ${dep.feature}`, textStyle: { fontSize: 14 } },
          tooltip: { trigger: 'item', formatter: '{b}: ({c})' },
          xAxis: { type: 'value', name: dep.feature, nameLocation: 'middle', nameGap: 25 },
          yAxis: { type: 'value', name: 'SHAP Value' },
          series: [
            {
              symbolSize: 6,
              data: dep.x.map((xVal: number, i: number) => [xVal, dep.shap[i]]),
              type: 'scatter',
              itemStyle: { color: '#2563eb', opacity: 0.6 },
            },
          ],
        }
        separatedSections.push({
          title: `因子影响趋势 (前端渲染): ${dep.feature}`,
          type: 'chart',
          option: scatterOption,
        })
      })
    } else if (dependence_images && dependence_images.length > 0) {
      // 兜底使用后端生成的图片
      dependence_images.forEach((dep: any) => {
        separatedSections.push({
          title: `因子影响趋势: ${dep.feature}`,
          type: 'image',
          url: `data:image/png;base64,${dep.image}`,
          alt: `SHAP Dependence Plot for ${dep.feature}`,
        })
      })
    }

    const integratedSections: any[] = []
    if (full_report_image) {
      integratedSections.push({
        type: 'image',
        url: `data:image/png;base64,${full_report_image}`,
        alt: 'Integrated SHAP Analysis Report',
      })
    }

    return {
      viewType: 'report',
      report: {
        title: 'Xgboost + SHAP 因子贡献度分析报告',
        tabs: [
          {
            name: '多维图表展示 (前端分图)',
            sections: separatedSections,
          },
          {
            name: '归因分析大图 (后端全量)',
            sections: integratedSections,
          },
        ],
      },
    }
  },
}
