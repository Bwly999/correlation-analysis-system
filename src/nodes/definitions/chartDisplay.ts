import { markRaw } from 'vue'
import type { NodeDefinition } from '../types'
import { calculateBoxValues } from '../../utils/stats'

const isParallelCollection = (data: any) => {
  return (
    Array.isArray(data) &&
    data.length > 0 &&
    data[0] &&
    typeof data[0] === 'object' &&
    'name' in data[0] &&
    'data' in data[0]
  )
}

export const chartDisplayNode: NodeDefinition = {
  name: 'chart-display',
  displayName: '图表展示',
  icon: 'pie-chart',
  category: 'terminal',
  description: '将输入的数据以灵活的自定义图表进行展示。支持单数据集及多分组对比。',
  properties: [
    {
      name: 'chartType',
      displayName: '图表类型',
      type: 'options',
      default: 'scatter',
      options: [
        { name: '散点图 (两变量关系)', value: 'scatter' },
        { name: '柱状图 (分类对比)', value: 'bar' },
        { name: '多组箱线图 (分组对比)', value: 'boxplot' },
      ],
    },
    {
      name: 'xAxis',
      displayName: 'X轴字段',
      type: 'string',
      default: '',
      placeholder: '请输入X轴对应的字段名',
      displayIf: (config) => config.chartType !== 'boxplot',
    },
    {
      name: 'yAxis',
      displayName: '对比因子 / Y轴',
      type: 'string',
      default: '',
      placeholder: '请输入要分析的数值字段',
    },
  ],
  execute: async (input, config) => {
    if (!input || !input.data) return { message: '无输入数据' }

    const isGrouped = isParallelCollection(input.data)
    const yKey = config.yAxis || ''

    if (isGrouped) {
      const groups: Array<{ name: string; data: any[] }> = input.data
      const validGroups = groups.filter((g) => Array.isArray(g.data) && g.data.length > 0)
      if (validGroups.length === 0) return { message: '分组中无有效数据' }

      const targetKeys = yKey
        ? yKey.split(',').map((s) => s.trim())
        : [Object.keys(validGroups[0].data[0]).find((k) => typeof validGroups[0].data[0][k] === 'number') || '']

      if (config.chartType === 'boxplot') {
        const option = {
          title: { text: '多组数据分布对比', left: 'center' },
          tooltip: { trigger: 'item', axisPointer: { type: 'shadow' } },
          legend: { show: true, top: 25 },
          grid: { top: '15%', bottom: '15%', left: '5%', right: '5%', containLabel: true },
          xAxis: { type: 'category', data: targetKeys, boundaryGap: true },
          yAxis: { type: 'value', scale: true, boundaryGap: ['15%', '15%'], splitArea: { show: true } },
          series: validGroups.map((group) => ({
            name: group.name,
            type: 'boxplot',
            data: targetKeys.map((key) => calculateBoxValues(group.data, key)),
            itemStyle: { borderWidth: 1.5 },
          })),
        }

        return { viewType: 'chart', chartOption: markRaw(option) }
      }
      input.data = validGroups[0].data
    }

    // 标准单数据集逻辑
    const rows = input.data
    const xKey = config.xAxis || Object.keys(rows[0] || {})[0]
    const targetYKey = yKey || Object.keys(rows[0] || {})[1]
    let option: any

    if (config.chartType === 'scatter') {
      option = {
        title: { text: `${xKey} vs ${targetYKey} 散点分布`, left: 'center' },
        tooltip: { trigger: 'item' },
        grid: { top: '15%', bottom: '15%', left: '10%', right: '10%', containLabel: true },
        xAxis: { type: 'value', name: xKey, boundaryGap: ['5%', '5%'] },
        yAxis: { type: 'value', name: targetYKey, scale: true, boundaryGap: ['15%', '15%'] },
        series: [
          {
            symbolSize: 8,
            data: rows.map((r: any) => [r[xKey], r[targetYKey]]),
            type: 'scatter',
            itemStyle: { color: '#0ea5e9' },
          },
        ],
      }
    } else if (config.chartType === 'bar') {
      option = {
        title: { text: `${targetYKey} 分布`, left: 'center' },
        tooltip: { trigger: 'axis' },
        grid: { top: '15%', bottom: '15%', left: '10%', right: '10%', containLabel: true },
        xAxis: { type: 'category', data: rows.map((r: any) => r[xKey]), boundaryGap: true },
        yAxis: { type: 'value', boundaryGap: ['0%', '15%'] },
        series: [{ data: rows.map((r: any) => r[targetYKey]), type: 'bar' }],
      }
    } else if (config.chartType === 'boxplot') {
      option = {
        title: { text: `${targetYKey} 分布`, left: 'center' },
        grid: { top: '15%', bottom: '15%', left: '10%', right: '10%', containLabel: true },
        xAxis: { type: 'category', data: [targetYKey] },
        yAxis: { type: 'value', scale: true, boundaryGap: ['15%', '15%'] },
        series: [
          {
            name: '分布',
            type: 'boxplot',
            data: [calculateBoxValues(rows, targetYKey)],
          },
        ],
      }
    }

    return { viewType: 'chart', chartOption: markRaw(option) }
  },
}
