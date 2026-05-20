import type { EChartsOption } from 'echarts'
import { markRaw } from 'vue'
import { calculateBoxplotStats } from '@/utils/stats'
import {
  BOX_PLOT_COLORS,
  LINE_CHART_RENDER_LIMIT,
  LINE_TOOLTIP_MAX_ROWS,
  NORMAL_DISTRIBUTION_BIN_COUNT,
  NORMAL_DISTRIBUTION_COLUMNS,
  NORMAL_DISTRIBUTION_CURVE_POINTS,
} from '../constants'
import type { ChartContext, ChartGroup, ChartNumericExtent, ChartRow, ProcessedChartData } from '../types'
import { downsampleLineRows } from '../tools/sampling'
import { filterInvalidLineRows } from '../tools/outlierHandling'
import { isFiniteNumber, normalizeChartRows, normalizeSeriesValue } from '../tools/normalization'

export const getRowIndexValue = (index: number) => index + 1

export const getChartXAxisValue = (row: ChartRow, index: number, field: string | null) => {
  if (!field) return getRowIndexValue(index)
  return row[field]
}

export const getFiniteRowValue = (row: ChartRow, key: string) => {
  const value = row[key]
  return isFiniteNumber(value) ? value : null
}

export const toRgba = (hexColor: string, alpha: number) => {
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

const escapeTooltipHtml = (value: unknown) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

export const buildProcessedChartData = (context: ChartContext): ProcessedChartData => {
  const sourceData = context.filteredData.value || []
  const keys = context.normalizedKeys.value
  const primaryKey = keys[0] ?? ''
  const xField = context.state.xField.value

  const filteredRows = context.source.isGroupedData.value ? [] : (sourceData as ChartRow[])
  const filteredGroups = context.source.isGroupedData.value ? (sourceData as ChartGroup[]) : []
  const normalizedRows = context.isNormalizedView.value
    ? normalizeChartRows(filteredRows, keys, context.normalizationStats.value, context.state.normalizationMethod.value)
    : filteredRows
  const normalizedGroups = context.isNormalizedView.value
    ? filteredGroups.map((group) => ({
        ...group,
        data: normalizeChartRows(group.data ?? [], keys, context.normalizationStats.value, context.state.normalizationMethod.value),
      }))
    : filteredGroups
  const lineRows = context.state.skipInvalidRows.value
    ? filterInvalidLineRows(filteredRows, keys)
    : filteredRows
  const sampledRows = downsampleLineRows(
    lineRows.slice(0, context.state.maxPoints.value),
    keys,
    Math.min(context.state.maxPoints.value, LINE_CHART_RENDER_LIMIT),
  )

  return {
    keys,
    primaryKey,
    xField,
    filteredRows,
    filteredGroups,
    normalizedRows,
    normalizedGroups,
    lineRows,
    sampledRows,
  }
}

export const createBaseOption = (): Record<string, any> => ({
  animation: false,
  useDirtyRect: true,
  backgroundColor: 'transparent',
  hoverLayer: true,
  color: ['#2563eb', '#10b981', '#f59e0b', '#f43f5e', '#06b6d4', '#475569', '#ef4444', '#14b8a6'],
  tooltip: {
    trigger: 'item',
    confine: true,
    transitionDuration: 0,
    extraCssText: 'box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1); border-radius: 12px;',
  },
  legend: {
    show: true,
    top: 0,
    icon: 'roundRect',
    textStyle: { color: '#64748b', fontSize: 11, fontWeight: '600' },
  },
  grid: { left: '3%', right: '8%', top: '15%', bottom: '20%', containLabel: true },
  dataZoom: [
    { type: 'inside', xAxisIndex: [0] },
    {
      type: 'slider',
      xAxisIndex: [0],
      bottom: 10,
      height: 20,
      borderColor: 'transparent',
      backgroundColor: '#f8fafc',
      fillerColor: 'rgba(79, 70, 229, 0.1)',
      handleStyle: { color: '#4f46e5' },
      textStyle: { color: '#94a3b8', fontSize: 10 },
    },
  ],
  xAxis: {
    type: 'category',
    data: [],
    axisLabel: { fontSize: 11, color: '#64748b', fontWeight: '500' },
    axisLine: { lineStyle: { color: '#e2e8f0' } },
  },
  yAxis: {
    type: 'value',
    scale: true,
    boundaryGap: ['15%', '15%'],
    axisLabel: { fontSize: 10, color: '#94a3b8' },
    splitLine: { lineStyle: { color: '#f1f5f9', type: 'dashed' } },
  },
  series: [],
})

export const applyNativeVerticalDataZoom = (
  option: Record<string, any>,
  start: number,
  end: number,
  sliderOverrides: Record<string, unknown> = {},
) => {
  option.dataZoom = [
    ...(option.dataZoom ?? []),
    {
      type: 'inside',
      yAxisIndex: [0],
      start,
      end,
      filterMode: 'empty',
      zoomOnMouseWheel: false,
      moveOnMouseWheel: false,
      moveOnMouseMove: false,
    },
    {
      type: 'slider',
      yAxisIndex: [0],
      start,
      end,
      filterMode: 'empty',
      right: 6,
      width: 16,
      top: 48,
      bottom: 36,
      borderColor: 'transparent',
      backgroundColor: '#f8fafc',
      fillerColor: 'rgba(79, 70, 229, 0.1)',
      handleStyle: { color: '#4f46e5' },
      textStyle: { color: '#94a3b8', fontSize: 10 },
      ...sliderOverrides,
    },
  ]
}

export const applyNormalizationAxis = (axis: Record<string, any>, context: ChartContext) => {
  if (!context.isNormalizedView.value) {
    axis.name = undefined
    axis.min = undefined
    axis.max = undefined
    return
  }

  axis.name = context.state.normalizationMethod.value === 'min-max' ? '归一化值' : '标准分值'
  axis.min = context.state.normalizationMethod.value === 'min-max' ? 0 : undefined
  axis.max = context.state.normalizationMethod.value === 'min-max' ? 1 : undefined
}

export const createLineTooltipFormatter = (
  sampledRows: ChartRow[],
  context: ChartContext,
  trendLineFormulaByName: Map<string, string> = new Map(),
) => {
  let lastCacheKey: string | null = null
  let lastTooltipHtml = ''

  return (params: Array<Record<string, unknown>> | Record<string, unknown>) => {
    const paramList = Array.isArray(params) ? params : [params]
    const firstItem = paramList[0] ?? {}
    const dataIndex = Number(firstItem.dataIndex ?? -1)
    const axisValue = firstItem.axisValueLabel ?? firstItem.axisValue ?? ''
    const cacheKey = `${dataIndex}|${String(axisValue)}|${paramList.length}|${context.isNormalizedView.value ? 'normalized' : 'raw'}`

    if (cacheKey === lastCacheKey) return lastTooltipHtml

    const rawRow = sampledRows[dataIndex] ?? null
    const normalizationLabel = context.state.normalizationMethod.value === 'min-max' ? '归一化值' : '标准分值'
    const isNormalized = context.isNormalizedView.value
    const headerCells = isNormalized
      ? [
          `<th style="padding:0 0 8px;text-align:left;font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#94a3b8;border-bottom:1px solid #e2e8f0;">字段</th>`,
          `<th style="padding:0 0 8px;text-align:right;font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#94a3b8;border-bottom:1px solid #e2e8f0;">原始值</th>`,
          `<th style="padding:0 0 8px;text-align:right;font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#94a3b8;border-bottom:1px solid #e2e8f0;">${normalizationLabel}</th>`,
        ].join('')
      : [
          `<th style="padding:0 0 8px;text-align:left;font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#94a3b8;border-bottom:1px solid #e2e8f0;">字段</th>`,
          `<th style="padding:0 0 8px;text-align:right;font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#94a3b8;border-bottom:1px solid #e2e8f0;">数值</th>`,
        ].join('')

    const visibleItems = paramList.slice(0, LINE_TOOLTIP_MAX_ROWS)
    const hiddenFieldCount = Math.max(0, paramList.length - visibleItems.length)

    const rowsHtml = visibleItems.map((item, index) => {
      const seriesName = String(item.seriesName ?? '')
      const rawValue = rawRow?.[seriesName]
      const rawValueLabel = formatBoxValue(rawValue)
      const displayValueLabel = formatBoxValue(item.data)
      const marker = String(item.marker ?? '')
      const backgroundColor = index % 2 === 0 ? 'rgba(248, 250, 252, 0.9)' : '#ffffff'
      const seriesCell = [
        `<td style="padding:9px 0 9px 10px;background:${backgroundColor};border-bottom:1px solid #f1f5f9;">`,
        `<div style="display:flex;align-items:center;gap:8px;min-width:0;">`,
        `<span style="flex:none;">${marker}</span>`,
        `<span style="font-size:12px;font-weight:600;color:#0f172a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeTooltipHtml(seriesName)}</span>`,
        `</div>`,
        `</td>`,
      ].join('')

      if (isNormalized) {
        return [
          `<tr>`,
          seriesCell,
          `<td style="padding:9px 0 9px 12px;text-align:right;font-size:12px;font-variant-numeric:tabular-nums;color:#475569;background:${backgroundColor};border-bottom:1px solid #f1f5f9;">${rawValueLabel}</td>`,
          `<td style="padding:9px 10px 9px 12px;text-align:right;font-size:12px;font-weight:700;font-variant-numeric:tabular-nums;color:#2563eb;background:${backgroundColor};border-bottom:1px solid #f1f5f9;">${displayValueLabel}</td>`,
          `</tr>`,
        ].join('')
      }

      return [
        `<tr>`,
        seriesCell,
        `<td style="padding:9px 10px 9px 12px;text-align:right;font-size:12px;font-weight:700;font-variant-numeric:tabular-nums;color:#0f172a;background:${backgroundColor};border-bottom:1px solid #f1f5f9;">${displayValueLabel}</td>`,
        `</tr>`,
      ].join('')
    }).join('')

    const summaryRow = hiddenFieldCount > 0
      ? isNormalized
        ? `<tr><td colspan="3" style="padding:10px 12px;text-align:center;font-size:11px;font-weight:600;color:#475569;background:#f8fafc;">还有 ${hiddenFieldCount} 个字段，继续拖动或筛选后查看</td></tr>`
        : `<tr><td colspan="2" style="padding:10px 12px;text-align:center;font-size:11px;font-weight:600;color:#475569;background:#f8fafc;">还有 ${hiddenFieldCount} 个字段，继续拖动或筛选后查看</td></tr>`
      : ''
    const trendLineEntries = Array.from(trendLineFormulaByName.entries())
    const trendLineHtml =
      trendLineEntries.length > 0
        ? [
            `<div style="margin-top:12px;padding-top:10px;border-top:1px solid #e2e8f0;">`,
            `<div style="margin-bottom:6px;font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#94a3b8;">趋势线公式</div>`,
            ...trendLineEntries.map(
              ([seriesName, formula]) =>
                `<div style="display:flex;justify-content:space-between;gap:16px;font-size:11px;color:#475569;"><span>${escapeTooltipHtml(seriesName)}</span><span style="font-weight:700;color:#0f172a;">${escapeTooltipHtml(formula)}</span></div>`,
            ),
            `</div>`,
          ].join('')
        : ''

    lastCacheKey = cacheKey
    lastTooltipHtml = [
      `<div style="min-width:280px;max-width:420px;padding:2px 0;">`,
      `<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:10px;">`,
      `<div>`,
      `<div style="font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#94a3b8;">结果定位</div>`,
      `<div style="margin-top:4px;font-size:14px;font-weight:700;color:#0f172a;">样本 ${escapeTooltipHtml(axisValue)}</div>`,
      `</div>`,
      `<div style="flex:none;border:1px solid #dbeafe;background:#eff6ff;color:#1d4ed8;border-radius:999px;padding:3px 8px;font-size:10px;font-weight:700;">${paramList.length} 列</div>`,
      `</div>`,
      `<div style="max-height:240px;overflow:auto;border:1px solid #e2e8f0;border-radius:14px;background:linear-gradient(180deg,#ffffff 0%,#f8fafc 100%);">`,
      `<table style="width:100%;border-collapse:separate;border-spacing:0;table-layout:auto;">`,
      `<thead><tr>${headerCells}</tr></thead>`,
      `<tbody>${rowsHtml}${summaryRow}</tbody>`,
      `</table>`,
      `</div>`,
      trendLineHtml,
      `</div>`,
    ].join('')

    return lastTooltipHtml
  }
}

const createBoxplotTooltipFormatter = (whiskerModeLabel: string) => (params: Record<string, unknown>) => {
  const dataSource = Array.isArray(params.data)
    ? params.data
    : Array.isArray((params.data as { value?: unknown } | undefined)?.value)
      ? ((params.data as { value: unknown[] }).value ?? [])
      : Array.isArray(params.value)
        ? params.value
        : []
  const rawData = Array.isArray(dataSource) ? dataSource : []
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
    `<span>箱须口径</span><span style="color:#0f172a;text-align:right;font-weight:600;">${whiskerModeLabel}</span>`,
    `<span>最大值</span><span style="color:#0f172a;text-align:right;font-weight:600;">${formatBoxValue(max)}</span>`,
    `<span>上四分位</span><span style="color:#0f172a;text-align:right;font-weight:600;">${formatBoxValue(q3)}</span>`,
    `<span>中位数</span><span style="color:#0f172a;text-align:right;font-weight:600;">${formatBoxValue(median)}</span>`,
    `<span>下四分位</span><span style="color:#0f172a;text-align:right;font-weight:600;">${formatBoxValue(q1)}</span>`,
    `<span>最小值</span><span style="color:#0f172a;text-align:right;font-weight:600;">${formatBoxValue(min)}</span>`,
    `</div>`,
    `</div>`,
  ].join('')
}

export const createBoxplotOutlierTooltipFormatter = (whiskerModeLabel: string) => (params: Record<string, unknown>) => {
  const data = (params.data as { value?: [number, number]; factorName?: string; groupName?: string } | undefined) ?? {}
  const pointValue = Array.isArray(data.value) ? data.value[1] : Array.isArray(params.value) ? params.value[1] : undefined
  const factorName = String(data.factorName ?? params.name ?? '')
  const groupName = String(data.groupName ?? '')
  const title = groupName ? `${factorName} / ${groupName}` : factorName
  const marker = String(params.marker ?? '')

  return [
    `<div style="padding: 4px 2px;">`,
    `<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;color:#0f172a;font-size:13px;font-weight:700;">${marker}<span>${title}</span></div>`,
    `<div style="display:grid;grid-template-columns:auto auto;gap:4px 16px;font-size:11px;color:#475569;">`,
    `<span>类型</span><span style="color:#0f172a;text-align:right;font-weight:600;">离群点</span>`,
    `<span>箱须口径</span><span style="color:#0f172a;text-align:right;font-weight:600;">${whiskerModeLabel}</span>`,
    `<span>数值</span><span style="color:#0f172a;text-align:right;font-weight:600;">${formatBoxValue(pointValue)}</span>`,
    `</div>`,
    `</div>`,
  ].join('')
}

export const createBoxplotBaseOption = (keys: string[], whiskerModeLabel: string): Record<string, any> => ({
  animation: false,
  useDirtyRect: true,
  backgroundColor: 'transparent',
  hoverLayer: true,
  tooltip: {
    trigger: 'item',
    confine: true,
    transitionDuration: 0,
    backgroundColor: '#ffffff',
    borderColor: '#e2e8f0',
    borderWidth: 1,
    padding: 12,
    textStyle: { color: '#475569' },
    extraCssText: 'box-shadow: 0 10px 15px -3px rgba(15, 23, 42, 0.12); border-radius: 12px;',
    formatter: createBoxplotTooltipFormatter(whiskerModeLabel),
  },
  legend: {
    show: true,
    left: 'center',
    top: 0,
    type: 'scroll',
    icon: 'rect',
    itemWidth: 14,
    itemHeight: 14,
    itemGap: 20,
    textStyle: { color: '#0f172a', fontSize: 12, fontWeight: 600 },
  },
  grid: { left: 0, right: 28, top: 56, bottom: 40, containLabel: true },
  dataZoom: [
    { type: 'inside', xAxisIndex: [0] },
    {
      show: true,
      type: 'slider',
      xAxisIndex: [0],
      bottom: 5,
      height: 12,
      borderColor: 'transparent',
      backgroundColor: '#f1f5f9',
      fillerColor: '#cbd5e1',
      handleStyle: { color: '#94a3b8', borderWidth: 0 },
      textStyle: { color: 'transparent' },
    },
  ],
  xAxis: {
    type: 'category',
    data: keys,
    axisLine: { lineStyle: { color: '#e2e8f0' } },
    axisTick: { show: false },
    axisLabel: { color: '#64748b', fontSize: 12, margin: 15, fontWeight: 500 },
    splitLine: { show: false },
  },
  yAxis: {
    type: 'value',
    scale: true,
    boundaryGap: ['15%', '15%'],
    axisLine: { show: false },
    axisLabel: { color: '#64748b', fontSize: 11 },
    splitLine: { lineStyle: { color: '#e2e8f0', type: 'dashed' } },
  },
  series: [] as Array<Record<string, unknown>>,
})

const calculateMean = (values: number[]) =>
  values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1)

const calculateStandardDeviation = (values: number[], mean: number) => {
  if (values.length === 0) return 0
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length
  return Math.sqrt(variance)
}

const createNormalDistributionSeriesData = (values: number[]) => {
  const safeValues = values.length > 0 ? values : [0]
  const rawMin = Math.min(...safeValues)
  const rawMax = Math.max(...safeValues)
  const rawMean = calculateMean(safeValues)
  const rawStd = calculateStandardDeviation(safeValues, rawMean)
  const rangePadding = rawMin === rawMax ? Math.max(Math.abs(rawMean) * 0.2, 1) : (rawMax - rawMin) * 0.08
  const min = rawMin - rangePadding
  const max = rawMax + rangePadding
  const range = Math.max(max - min, 1)
  const binWidth = range / NORMAL_DISTRIBUTION_BIN_COUNT
  const std = rawStd > 0 ? rawStd : Math.max(binWidth, 1)
  const histogram = Array.from({ length: NORMAL_DISTRIBUTION_BIN_COUNT }, (_, index) => {
    const center = min + binWidth * (index + 0.5)
    return [center, 0] as [number, number]
  })

  safeValues.forEach((value) => {
    const rawIndex = Math.floor((value - min) / binWidth)
    const binIndex = Math.min(NORMAL_DISTRIBUTION_BIN_COUNT - 1, Math.max(0, rawIndex))
    histogram[binIndex]![1] += 1
  })

  const normalScale = safeValues.length * binWidth
  const curve = Array.from({ length: NORMAL_DISTRIBUTION_CURVE_POINTS }, (_, index) => {
    const ratio = index / (NORMAL_DISTRIBUTION_CURVE_POINTS - 1)
    const x = min + range * ratio
    const density =
      (1 / (std * Math.sqrt(2 * Math.PI))) * Math.exp(-0.5 * ((x - rawMean) / std) ** 2)
    return [x, density * normalScale] as [number, number]
  })

  return { histogram, curve, min, max }
}

export const createNormalDistributionOption = (rows: ChartRow[], keys: string[], xAxisName: string): EChartsOption => {
  const rowCount = Math.max(1, Math.ceil(keys.length / NORMAL_DISTRIBUTION_COLUMNS))
  const rowHeight = 82 / rowCount

  return {
    animation: false,
    useDirtyRect: true,
    backgroundColor: 'transparent',
    hoverLayer: true,
    color: ['#2563eb', '#0f172a', '#10b981', '#475569'],
    tooltip: {
      trigger: 'item',
      confine: true,
      transitionDuration: 0,
      extraCssText: 'box-shadow: 0 10px 15px -3px rgba(15, 23, 42, 0.12); border-radius: 12px;',
      formatter: (params: Record<string, any>) => {
        const marker = String(params.marker ?? '')
        const seriesName = String(params.seriesName ?? '')
        if (!seriesName.includes('频数')) return ''
        const value = Array.isArray(params.data) ? params.data : []
        const binCenter = typeof value[0] === 'number' ? formatBoxValue(value[0]) : '--'
        const frequency = typeof value[1] === 'number' ? formatBoxValue(value[1]) : '--'

        return [
          `<div style="padding: 4px 2px;">`,
          `<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;color:#0f172a;font-size:13px;font-weight:700;">${marker}<span>${seriesName}</span></div>`,
          `<div style="display:grid;grid-template-columns:auto auto;gap:4px 16px;font-size:11px;color:#475569;">`,
          `<span>区间中心</span><span style="color:#0f172a;text-align:right;font-weight:600;">${binCenter}</span>`,
          `<span>频数</span><span style="color:#0f172a;text-align:right;font-weight:600;">${frequency}</span>`,
          `</div>`,
          `</div>`,
        ].join('')
      },
    },
    legend: {
      show: true,
      top: 0,
      left: 'center',
      icon: 'roundRect',
      textStyle: { color: '#64748b', fontSize: 11, fontWeight: 600 },
    },
    grid: keys.map((_, index) => {
      const columnIndex = index % NORMAL_DISTRIBUTION_COLUMNS
      const rowIndex = Math.floor(index / NORMAL_DISTRIBUTION_COLUMNS)
      return {
        left: columnIndex === 0 ? '6%' : '56%',
        width: '38%',
        top: `${10 + rowHeight * rowIndex}%`,
        height: `${Math.max(10, rowHeight - 15)}%`,
        containLabel: true,
      }
    }),
    xAxis: keys.map((key, index) => {
      const values = rows.map((row) => row[key]).filter(isFiniteNumber)
      const { min, max } = createNormalDistributionSeriesData(values)
      return {
        type: 'value',
        gridIndex: index,
        min,
        max,
        name: xAxisName,
        nameTextStyle: { color: '#64748b', fontSize: 10, fontWeight: 600 },
        axisLabel: { color: '#64748b', fontSize: 10 },
        axisLine: { lineStyle: { color: '#e2e8f0' } },
        splitLine: { lineStyle: { color: '#f1f5f9', type: 'dashed' } },
      }
    }),
    yAxis: keys.map((_, index) => ({
      type: 'value',
      name: '频数',
      gridIndex: index,
      min: 0,
      axisLabel: { color: '#64748b', fontSize: 10 },
      axisLine: { show: false },
      splitLine: { lineStyle: { color: '#e2e8f0', type: 'dashed' } },
    })),
    series: keys.flatMap((key, index) => {
      const values = rows.map((row) => row[key]).filter(isFiniteNumber)
      const { histogram, curve } = createNormalDistributionSeriesData(values)

      return [
        {
          name: `${key} 频数`,
          type: 'bar',
          xAxisIndex: index,
          yAxisIndex: index,
          data: histogram,
          tooltip: { show: true },
          barWidth: '100%',
          barGap: '0%',
          barCategoryGap: '0%',
          emphasis: {
            itemStyle: {
              color: toRgba(BOX_PLOT_COLORS[index % BOX_PLOT_COLORS.length]!, 0.65),
              borderColor: BOX_PLOT_COLORS[index % BOX_PLOT_COLORS.length],
              borderWidth: 2,
            },
            scale: 1.04,
          },
          itemStyle: {
            color: toRgba(BOX_PLOT_COLORS[index % BOX_PLOT_COLORS.length]!, 0.35),
            borderColor: BOX_PLOT_COLORS[index % BOX_PLOT_COLORS.length],
            borderWidth: 1,
          },
        },
        {
          name: `${key} 正态拟合`,
          type: 'line',
          xAxisIndex: index,
          yAxisIndex: index,
          data: curve,
          silent: true,
          tooltip: { show: false },
          showSymbol: false,
          smooth: true,
          emphasis: {
            showSymbol: true,
            symbol: 'circle',
            symbolSize: 6,
            itemStyle: { color: '#0f172a', borderColor: '#ffffff', borderWidth: 2 },
            lineStyle: { width: 3 },
          },
          lineStyle: { width: 2.4, color: '#0f172a' },
        },
      ]
    }),
  }
}

export const createBoxplotDataItem = (values: number[], color: string) => ({
  value: values,
  itemStyle: {
    color: toRgba(color, 0.18),
    borderColor: color,
    borderWidth: 1.5,
  },
  emphasis: {
    itemStyle: {
      borderWidth: 2.5,
    },
  },
})

export const buildMarkedRawOption = (option: Record<string, any>) => markRaw(option)

export const calculateLinearRegression = (
  points: Array<[number, number]>,
): { slope: number; intercept: number } | null => {
  const n = points.length
  if (n < 2) return null

  let sumX = 0
  let sumY = 0
  let sumXY = 0
  let sumX2 = 0
  for (const [x, y] of points) {
    sumX += x
    sumY += y
    sumXY += x * y
    sumX2 += x * x
  }

  const denominator = n * sumX2 - sumX * sumX
  if (denominator === 0) return null

  const slope = (n * sumXY - sumX * sumY) / denominator
  const intercept = (sumY - slope * sumX) / n

  return { slope, intercept }
}

const formatTrendLineNumber = (value: number) => {
  if (!Number.isFinite(value)) return '--'
  if (Math.abs(value) >= 1000 || (Math.abs(value) > 0 && Math.abs(value) < 0.001)) {
    return value.toExponential(2)
  }
  return value.toFixed(4).replace(/\.?0+$/, '')
}

export const formatTrendLineFormula = (slope: number, intercept: number) => {
  const slopeLabel = formatTrendLineNumber(slope)
  const interceptLabel = formatTrendLineNumber(Math.abs(intercept))
  const operator = intercept >= 0 ? '+' : '-'
  return `y = ${slopeLabel}x ${operator} ${interceptLabel}`
}

export const buildTrendLineSeries = (
  points: Array<[number, number]>,
  options: {
    name?: string
    coordinateMode?: 'category' | 'value'
    categoryXAxisValues?: number[]
  } = {},
): Record<string, any> | null => {
  const regression = calculateLinearRegression(points)
  if (!regression) return null
  const formula = formatTrendLineFormula(regression.slope, regression.intercept)
  const name = options.name ?? '趋势线'

  let xMin = Infinity
  let xMax = -Infinity
  for (const [x] of points) {
    if (x < xMin) xMin = x
    if (x > xMax) xMax = x
  }

  const data =
    options.coordinateMode === 'category'
      ? (options.categoryXAxisValues ?? []).map((xValue) => regression.slope * xValue + regression.intercept)
      : [
          [xMin, regression.slope * xMin + regression.intercept],
          [xMax, regression.slope * xMax + regression.intercept],
        ]

  return {
    name,
    type: 'line',
    data,
    silent: false,
    symbol: 'none',
    showSymbol: false,
    animation: false,
    lineStyle: { type: 'dashed', width: 2, opacity: 0.7, color: '#0f172a' },
    tooltip: {
      show: true,
      formatter: () =>
        `<div style="padding:4px 2px;"><div style="color:#0f172a;font-size:12px;font-weight:700;">${escapeTooltipHtml(name)}</div><div style="margin-top:6px;color:#475569;font-size:11px;">${escapeTooltipHtml(formula)}</div></div>`,
    },
    emphasis: { disabled: true },
    showInLegend: false,
    trendLineFormula: formula,
  }
}

export const buildScatterValueAxisRange = (values: number[]) => {
  const finiteValues = values.filter((value) => Number.isFinite(value))
  if (finiteValues.length === 0) return {}

  const rawMin = Math.min(...finiteValues)
  const rawMax = Math.max(...finiteValues)
  const range = rawMax - rawMin
  const relativePadding = range > 0 ? range * 0.05 : 0
  const fallbackPaddingBase = Math.max(Math.abs(rawMin), Math.abs(rawMax), 1)
  const fallbackPadding = fallbackPaddingBase * 0.01
  const padding = Math.max(relativePadding, fallbackPadding)

  return {
    min: rawMin - padding,
    max: rawMax + padding,
  }
}

export const buildGroupedScatterOffset = (index: number, total: number) =>
  [Math.round((index - (total - 1) / 2) * 16), 0]

export const buildBoxStatsByKey = (rows: ChartRow[], keys: string[], whiskerMode: 'iqr' | 'percentile') =>
  keys.map((key) => calculateBoxplotStats(rows, key, whiskerMode))
