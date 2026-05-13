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
const BOX_PLOT_COLORS = ['#2563eb', '#10b981', '#f59e0b', '#f43f5e', '#06b6d4', '#475569']

const formatIntervalValue = (value: number) => {
  if (!Number.isFinite(value)) return ''
  if (Number.isInteger(value)) return String(value)
  return value.toFixed(2).replace(/\.?0+$/, '')
}

const toRgba = (hexColor: string, alpha: number) => {
  const normalized = hexColor.replace('#', '')
  const sanitized =
    normalized.length === 3
      ? normalized
          .split('')
          .map((char) => char + char)
          .join('')
      : normalized

  const red = Number.parseInt(sanitized.slice(0, 2), 16)
  const green = Number.parseInt(sanitized.slice(2, 4), 16)
  const blue = Number.parseInt(sanitized.slice(4, 6), 16)

  return `rgba(${red}, ${green}, ${blue}, ${alpha})`
}

const formatBoxValue = (value: unknown) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '--'
  if (Number.isInteger(value)) return String(value)
  return value.toFixed(2).replace(/\.?0+$/, '')
}

const createBoxplotTooltipFormatter = () => (params: Record<string, unknown>) => {
  const rawData = Array.isArray(params.data) ? params.data : []
  const stats = rawData.length >= 5 ? rawData.slice(-5) : []
  const [min, q1, median, q3, max] = stats
  const factorName = String(params.name ?? '')
  const seriesName = String(params.seriesName ?? '')
  const marker = String(params.marker ?? '')
  const title = seriesName ? `${factorName} / ${seriesName}` : factorName

  return [
    `<div style="padding: 4px 2px;">`,
    `<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;color:#0f172a;font-size:13px;font-weight:700;">${marker}<span>${title}</span></div>`,
    `<div style="display:grid;grid-template-columns:auto auto;gap:4px 16px;font-size:11px;color:#475569;">`,
    `<span>最大值</span><span style="color:#0f172a;text-align:right;font-weight:600;">${formatBoxValue(max)}</span>`,
    `<span>上四分位</span><span style="color:#0f172a;text-align:right;font-weight:600;">${formatBoxValue(q3)}</span>`,
    `<span>中位数</span><span style="color:#0f172a;text-align:right;font-weight:600;">${formatBoxValue(median)}</span>`,
    `<span>下四分位</span><span style="color:#0f172a;text-align:right;font-weight:600;">${formatBoxValue(q1)}</span>`,
    `<span>最小值</span><span style="color:#0f172a;text-align:right;font-weight:600;">${formatBoxValue(min)}</span>`,
    `</div>`,
    `</div>`,
  ].join('')
}

const createBoxplotBaseOption = (
  categories: string[],
  title: string,
): Record<string, any> => ({
  backgroundColor: 'transparent',
  title: { text: title, left: 'center' },
  tooltip: {
    trigger: 'item',
    confine: true,
    backgroundColor: '#ffffff',
    borderColor: '#e2e8f0',
    borderWidth: 1,
    padding: 12,
    textStyle: { color: '#475569' },
    extraCssText: 'box-shadow: 0 10px 15px -3px rgba(15, 23, 42, 0.12); border-radius: 12px;',
    formatter: createBoxplotTooltipFormatter(),
  },
  legend: {
    show: true,
    left: 'center',
    top: 25,
    type: 'scroll',
    itemWidth: 14,
    itemHeight: 14,
    itemGap: 20,
    textStyle: { color: '#0f172a', fontSize: 12, fontWeight: 600 },
    icon: 'rect',
  },
  grid: { top: '18%', bottom: 40, left: 0, right: 0, containLabel: true },
  xAxis: {
    type: 'category',
    data: categories,
    boundaryGap: true,
    axisLine: { lineStyle: { color: '#e2e8f0' } },
    axisTick: { show: false },
    axisLabel: { color: '#64748b', fontSize: 12, margin: 15 },
    splitLine: { show: false },
  },
  yAxis: {
    type: 'value',
    scale: true,
    boundaryGap: ['15%', '15%'],
    axisLine: { show: false },
    axisLabel: { color: '#64748b' },
    splitLine: { lineStyle: { color: '#e2e8f0', type: 'dashed' } },
  },
  dataZoom: [
    { type: 'inside' },
    {
      show: true,
      type: 'slider',
      height: 12,
      bottom: 5,
      borderColor: 'transparent',
      backgroundColor: '#f1f5f9',
      fillerColor: '#cbd5e1',
      handleStyle: { color: '#94a3b8', borderWidth: 0 },
      textStyle: { color: 'transparent' },
    },
  ],
  series: [] as Array<Record<string, unknown>>,
})

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
  availability: 'legacy',
  isLegacy: true,
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
      type: 'options',
      default: '',
      useUpstreamFactors: true,
      editable: true,
      forceInput: true,
      placeholder: '请输入 X 轴对应的字段名',
      displayIf: (config) => !['boxplot', 'histogram'].includes(config.chartType),
    },
    {
      name: 'yAxis',
      displayName: 'Y 轴字段',
      type: 'options',
      default: '',
      useUpstreamFactors: true,
      editable: true,
      forceInput: true,
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
        const option = createBoxplotBaseOption(targetKeys, '多组数据分布对比')
        option.series = validGroups.map((group, index) => {
          const color = BOX_PLOT_COLORS[index % BOX_PLOT_COLORS.length]!

          return {
            name: group.name,
            type: 'boxplot',
            data: targetKeys.map((key: string) => calculateBoxValues(group.data, key)),
            itemStyle: {
              color: toRgba(color, 0.2),
              borderColor: color,
              borderWidth: 1.5,
            },
            emphasis: {
              focus: 'series',
              itemStyle: { borderWidth: 2.5 },
            },
          }
        })

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
      option = createBoxplotBaseOption([targetYKey], `${targetYKey} 分布`)
      option.series = [
        {
          name: '数据分布',
          type: 'boxplot',
          data: [calculateBoxValues(rows, targetYKey)],
          itemStyle: {
            color: toRgba(BOX_PLOT_COLORS[0]!, 0.18),
            borderColor: BOX_PLOT_COLORS[0],
            borderWidth: 1.5,
          },
          emphasis: {
            focus: 'series',
            itemStyle: { borderWidth: 2.5 },
          },
        },
      ]
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
