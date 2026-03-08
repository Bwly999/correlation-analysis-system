import type { NodeDefinition } from '../types'

export const chartDisplayNode: NodeDefinition = {
  name: 'chart-display',
  displayName: '图表展示',
  icon: 'pie-chart',
  category: 'terminal',
  description: '将输入的数据以灵活的自定义图表进行展示。',
  properties: [
    {
      name: 'chartType',
      displayName: '图表类型',
      type: 'options',
      default: 'scatter',
      options: [
        { name: '散点图 (两变量关系)', value: 'scatter' },
        { name: '柱状图 (分类对比)', value: 'bar' },
      ],
    },
    {
      name: 'xAxis',
      displayName: 'X轴字段',
      type: 'string',
      default: '',
      placeholder: '请输入X轴对应的字段名',
    },
    {
      name: 'yAxis',
      displayName: 'Y轴字段',
      type: 'string',
      default: '',
      placeholder: '请输入Y轴对应的字段名',
    },
  ],
  execute: async (input, config) => {
    if (!input || !input.data) return { message: '无输入数据' }

    const rows = input.data
    const xKey = config.xAxis || Object.keys(rows[0] || {})[0]
    const yKey = config.yAxis || Object.keys(rows[0] || {})[1]

    let option: any

    if (config.chartType === 'scatter') {
      option = {
        title: { text: `${xKey} vs ${yKey} 散点分布`, left: 'center' },
        tooltip: { trigger: 'item' },
        xAxis: { type: 'value', name: xKey },
        yAxis: { type: 'value', name: yKey },
        series: [
          {
            symbolSize: 8,
            data: rows.map((r: any) => [r[xKey], r[yKey]]),
            type: 'scatter',
            itemStyle: { color: '#0ea5e9' },
          },
        ],
      }
    } else {
      option = {
        title: { text: `${yKey} 在 ${xKey} 下的分布`, left: 'center' },
        tooltip: { trigger: 'axis' },
        xAxis: { type: 'category', data: rows.map((r: any) => r[xKey]), name: xKey },
        yAxis: { type: 'value', name: yKey },
        series: [
          {
            data: rows.map((r: any) => r[yKey]),
            type: 'bar',
            itemStyle: { color: '#8b5cf6' },
          },
        ],
      }
    }

    return {
      viewType: 'chart',
      chartOption: option,
    }
  },
}
