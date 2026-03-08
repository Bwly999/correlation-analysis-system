import type { NodeDefinition } from '../types'

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
      placeholder: '请输入回归/分类的目标字段名',
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
        target: config.targetLabel,
        config: config,
      }),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ detail: '后端服务响应异常' }))
      throw new Error(errorData.detail || `后端请求失败: ${response.statusText}`)
    }

    const result = await response.json()
    const { r2, mae, importance, beeswarm, dependence } = result.results

    const sections: any[] = [
      {
        type: 'text',
        content: `### 模型评估结果\n- **R² (拟合优度)**: ${r2}\n- **MAE (平均绝对误差)**: ${mae}\n\n该分析基于 XGBoost 回归模型及 SHAP (SHapley Additive exPlanations) 归因理论。`,
      },
      {
        title: '特征重要性排行 (SHAP Summary)',
        type: 'chart',
        option: {
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
                color: {
                  type: 'linear',
                  x: 0,
                  y: 0,
                  x2: 1,
                  y2: 0,
                  colorStops: [
                    { offset: 0, color: '#818cf8' },
                    { offset: 1, color: '#4f46e5' },
                  ],
                },
                borderRadius: [0, 4, 4, 0],
              },
            },
          ],
        },
      },
    ]

    // 1. 添加蜂群图 (Beeswarm) - 使用散点图模拟
    if (beeswarm) {
      const beeswarmSeries: any[] = []
      const yAxisData: string[] = []

      importance.slice(0, 10).forEach((imp: any, idx: number) => {
        const featName = imp.name
        const data = beeswarm[featName]
        if (!data) return

        yAxisData.push(featName)
        const seriesData = data.shap_values.map((sv: number, i: number) => {
          // Y轴坐标为 idx + 随机抖动
          const jitter = (Math.random() - 0.5) * 0.6
          return [sv, idx + jitter, data.values[i], data.norm_values[i]]
        })

        beeswarmSeries.push({
          name: featName,
          type: 'scatter',
          symbolSize: 6,
          data: seriesData,
          large: true,
          dimensions: ['shap', 'y', 'value', 'norm'],
          encode: { x: 0, y: 1 },
          itemStyle: {
            opacity: 0.6,
            color: (params: any) => {
              const norm = params.data[3]
              // 颜色映射：从蓝色(低)到红色(高)
              const r = Math.floor(255 * norm)
              const b = Math.floor(255 * (1 - norm))
              return `rgb(${r}, 50, ${b})`
            },
          },
        })
      })

      sections.push({
        title: '因子影响分布 (Beeswarm Plot)',
        type: 'chart',
        option: {
          tooltip: {
            formatter: (params: any) => {
              return `${params.seriesName}<br/>SHAP: ${params.data[0].toFixed(4)}<br/>原始值: ${params.data[2].toFixed(4)}`
            },
          },
          xAxis: {
            type: 'value',
            name: 'SHAP Value (影响值)',
            splitLine: { show: true, lineStyle: { type: 'dashed' } },
          },
          yAxis: {
            type: 'value',
            show: true,
            axisLabel: {
              formatter: (val: number) => yAxisData[Math.round(val)] || '',
            },
            interval: 1,
            min: -0.5,
            max: yAxisData.length - 0.5,
            splitLine: { show: false },
          },
          visualMap: {
            show: true,
            min: 0,
            max: 1,
            text: ['高', '低'],
            calculable: true,
            orient: 'horizontal',
            left: 'center',
            bottom: 0,
            inRange: { color: ['#3b82f6', '#ef4444'] },
            dimension: 3,
            label: { formatter: '特征值' },
          },
          series: beeswarmSeries,
        },
      })
    }

    // 2. 添加依赖图 (Dependence Plots)
    if (dependence && dependence.length > 0) {
      dependence.forEach((dep: any) => {
        sections.push({
          title: `影响趋势: ${dep.feature}`,
          type: 'chart',
          option: {
            tooltip: { trigger: 'axis' },
            xAxis: { type: 'value', name: dep.feature, scale: true },
            yAxis: { type: 'value', name: 'SHAP Value', scale: true },
            series: [
              {
                name: '贡献趋势',
                type: 'scatter',
                data: dep.x.map((x: number, i: number) => [x, dep.shap[i]]),
                symbolSize: 5,
                itemStyle: { color: '#6366f1', opacity: 0.5 },
              },
            ],
          },
        })
      })
    }

    return {
      viewType: 'report',
      report: {
        title: 'Xgboost + SHAP 因子贡献度分析报告',
        sections: sections,
      },
    }
  },
}
