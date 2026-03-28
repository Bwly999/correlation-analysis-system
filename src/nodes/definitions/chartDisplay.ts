import { markRaw } from 'vue'
import type { NodeDefinition } from '../types'
import { calculateBoxValues } from '../../utils/stats'
import {
  createChartResult,
  extractTableCollectionGroups,
  extractTableRows,
} from '../result'

const isNumericColumn = (rows: Array<Record<string, unknown>>, key: string) =>
  rows.some((row) => typeof row[key] === 'number' && Number.isFinite(row[key] as number))

const resolveRows = (input: unknown) => extractTableRows(input)

const resolveGroups = (input: unknown) => extractTableCollectionGroups(input)

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

const formatIntervalValue = (value: number) => {
  if (!Number.isFinite(value)) return ''
  if (Number.isInteger(value)) return String(value)
  return value.toFixed(2).replace(/\.?0+$/, '')
}

const buildHistogramSeries = (rows: Array<Record<string, unknown>>, key: string) => {
  const values = rows
    .map((row) => row[key])
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))

  if (values.length === 0) {
    throw new Error(`字段 ${key} 中没有可用于绘制分布图的数值数据`)
  }

  const min = Math.min(...values)
  const max = Math.max(...values)

  if (min === max) {
    const label = `${formatIntervalValue(min)}`
    return {
      binCount: 1,
      categories: [label],
      seriesData: [
        {
          value: values.length,
          intervalStart: min,
          intervalEnd: max,
          percentage: 1,
          label,
        },
      ],
    }
  }

  const binCount = clamp(Math.round(Math.sqrt(values.length)), 5, 16)
  const binWidth = (max - min) / binCount
  const counts = Array.from({ length: binCount }, () => 0)

  values.forEach((value) => {
    const rawIndex = Math.floor((value - min) / binWidth)
    const index = Math.min(binCount - 1, Math.max(0, rawIndex))
    counts[index] = (counts[index] ?? 0) + 1
  })

  const categories: string[] = []
  const seriesData = counts.map((count, index) => {
    const intervalStart = min + index * binWidth
    const intervalEnd = index === binCount - 1 ? max : min + (index + 1) * binWidth
    const label = `${formatIntervalValue(intervalStart)} - ${formatIntervalValue(intervalEnd)}`
    categories.push(label)

    return {
      value: count,
      intervalStart,
      intervalEnd,
      percentage: count / values.length,
      label,
    }
  })

  return {
    binCount,
    categories,
    seriesData,
  }
}

export const chartDisplayNode: NodeDefinition = {
  name: 'chart-display',
  displayName: '图表展示',
  icon: 'pie-chart',
  category: 'terminal',
  description: '将输入数据转换为可视化图表，支持散点图、柱状图、分布图和箱线图。',
  properties: [
    {
      name: 'chartType',
      displayName: '图表类型',
      type: 'options',
      default: 'scatter',
      options: [
        { name: '散点图（双变量关系）', value: 'scatter' },
        { name: '柱状图（分类对比）', value: 'bar' },
        { name: '分布图（直方图）', value: 'histogram' },
        { name: '箱线图（分布对比）', value: 'boxplot' },
      ],
    },
    {
      name: 'xAxis',
      displayName: 'X 轴字段',
      type: 'string',
      default: '',
      placeholder: '请输入 X 轴对应的字段名',
      displayIf: (config) => !['boxplot', 'histogram'].includes(config.chartType),
    },
    {
      name: 'yAxis',
      displayName: 'Y 轴字段',
      type: 'string',
      default: '',
      placeholder: '请输入用于展示的数值字段名',
    },
  ],
  execute: async (input, config) => {
    const groupedData = resolveGroups(input)
    const yKey = typeof config.yAxis === 'string' ? config.yAxis.trim() : ''

    if (groupedData && groupedData.length > 0) {
      const validGroups = groupedData.filter((group) => Array.isArray(group.data) && group.data.length > 0)
      if (validGroups.length === 0) {
        throw new Error('分组集合中没有可用于绘图的数据')
      }

      if (config.chartType === 'histogram') {
        throw new Error('分布图当前仅支持单表数据，请先选择单表输入再绘制')
      }

      const firstGroup = validGroups[0]!
      const fallbackKeys = Object.keys(firstGroup.data[0] ?? {}).filter((key: string) =>
        isNumericColumn(firstGroup.data, key),
      )
      const targetKeys = yKey
        ? yKey
            .split(',')
            .map((key: string) => key.trim())
            .filter((key: string): key is string => Boolean(key))
        : fallbackKeys.slice(0, 1)

      if (targetKeys.length === 0) {
        throw new Error('未找到可用于绘图的数值字段')
      }

      if (config.chartType === 'boxplot') {
        const option = {
          title: { text: '多组数据分布对比', left: 'center' },
          tooltip: { trigger: 'item', axisPointer: { type: 'shadow' } },
          legend: { show: true, top: 25 },
          grid: { top: '15%', bottom: '15%', left: '5%', right: '5%', containLabel: true },
          xAxis: { type: 'category', data: targetKeys, boundaryGap: true },
          yAxis: {
            type: 'value',
            scale: true,
            boundaryGap: ['15%', '15%'],
            splitArea: { show: true },
          },
          series: validGroups.map((group) => ({
            name: group.name,
            type: 'boxplot',
            data: targetKeys.map((key: string) => calculateBoxValues(group.data, key)),
            itemStyle: { borderWidth: 1.5 },
          })),
        }

        return createChartResult(markRaw(option), {
          meta: {
            chartType: 'boxplot',
            sourceKind: 'tableCollection',
            groupCount: validGroups.length,
            targetKeys,
          },
        })
      }

      const fallbackRows = firstGroup.data
      const xKey =
        (typeof config.xAxis === 'string' && config.xAxis.trim()) || Object.keys(fallbackRows[0] ?? {})[0] || ''
      const targetYKey = targetKeys[0]!
      const option =
        config.chartType === 'bar'
          ? {
              title: { text: `${targetYKey} 分布`, left: 'center' },
              tooltip: { trigger: 'axis' },
              legend: { show: true, top: 25 },
              grid: { top: '18%', bottom: '15%', left: '10%', right: '10%', containLabel: true },
              xAxis: { type: 'category', data: validGroups.map((group) => group.name), boundaryGap: true },
              yAxis: { type: 'value', boundaryGap: ['0%', '15%'] },
              series: [
                {
                  name: targetYKey,
                  type: 'bar',
                  data: validGroups.map((group) => group.data[0]?.[targetYKey] ?? null),
                },
              ],
            }
          : {
              title: { text: `${xKey} vs ${targetYKey} 分组散点图`, left: 'center' },
              tooltip: { trigger: 'item' },
              legend: { show: true, top: 25 },
              grid: { top: '18%', bottom: '15%', left: '10%', right: '10%', containLabel: true },
              xAxis: { type: 'value', name: xKey, boundaryGap: ['5%', '5%'] },
              yAxis: { type: 'value', name: targetYKey, scale: true, boundaryGap: ['15%', '15%'] },
              series: validGroups.map((group) => ({
                name: group.name,
                type: 'scatter',
                symbolSize: 8,
                data: group.data.map((row) => [row[xKey], row[targetYKey]]),
              })),
            }

      return createChartResult(markRaw(option), {
        meta: {
          chartType: config.chartType === 'bar' ? 'bar' : 'scatter',
          sourceKind: 'tableCollection',
          groupCount: validGroups.length,
          xAxis: xKey,
          yAxis: targetYKey,
        },
      })
    }

    const rows = resolveRows(input)
    if (!rows || rows.length === 0) {
      throw new Error('无输入数据')
    }

    const xKey =
      (typeof config.xAxis === 'string' && config.xAxis.trim()) || Object.keys(rows[0] ?? {})[0] || ''
    const targetYKey =
      yKey || Object.keys(rows[0] ?? {}).find((key) => key !== xKey) || Object.keys(rows[0] ?? {})[1] || ''

    if (!targetYKey) {
      throw new Error('未找到可用于绘图的字段')
    }

    let option: Record<string, unknown>

    if (config.chartType === 'histogram') {
      const { binCount, categories, seriesData } = buildHistogramSeries(rows, targetYKey)
      option = {
        title: { text: `${targetYKey} 分布图`, left: 'center' },
        tooltip: {
          trigger: 'item',
          formatter: (params: { data?: Record<string, unknown> }) => {
            const data = params?.data ?? {}
            const label = String(data.label ?? '')
            const count = Number(data.value ?? 0)
            const percentage = Number(data.percentage ?? 0)
            return `${label}<br/>样本数：${count}<br/>占比：${(percentage * 100).toFixed(1)}%`
          },
        },
        grid: { top: '15%', bottom: '15%', left: '10%', right: '10%', containLabel: true },
        xAxis: {
          type: 'category',
          name: `${targetYKey} 分箱区间`,
          data: categories,
          boundaryGap: true,
        },
        yAxis: {
          type: 'value',
          name: '样本数',
          minInterval: 1,
        },
        series: [
          {
            name: `${targetYKey} 分布`,
            type: 'bar',
            data: seriesData,
            barMaxWidth: 44,
            itemStyle: { color: '#2563eb' },
          },
        ],
      }

      return createChartResult(markRaw(option), {
        meta: {
          chartType: 'histogram',
          sourceKind: 'table',
          rowCount: rows.length,
          yAxis: targetYKey,
          binCount,
        },
      })
    }

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
            data: rows.map((row) => [row[xKey], row[targetYKey]]),
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
        xAxis: { type: 'category', data: rows.map((row) => row[xKey]), boundaryGap: true },
        yAxis: { type: 'value', boundaryGap: ['0%', '15%'] },
        series: [{ data: rows.map((row) => row[targetYKey]), type: 'bar' }],
      }
    } else {
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

    return createChartResult(markRaw(option), {
      meta: {
        chartType: config.chartType || 'scatter',
        sourceKind: 'table',
        rowCount: rows.length,
        xAxis: xKey,
        yAxis: targetYKey,
      },
    })
  },
}
