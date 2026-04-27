<script setup lang="ts">
import { computed, markRaw, ref, shallowRef, watch } from 'vue'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { BoxplotChart, LineChart } from 'echarts/charts'
import {
  DataZoomComponent,
  DatasetComponent,
  GridComponent,
  LegendComponent,
  TitleComponent,
  TooltipComponent,
  TransformComponent,
} from 'echarts/components'
import InputNumber from 'primevue/inputnumber'
import Select from 'primevue/select'
import {
  Check,
  Bookmark,
  BoxSelect,
  Layers,
  LineChart as LineChartIcon,
  ListChecks,
  PanelRightClose,
  PanelRightOpen,
  Scale,
  Settings2,
  Trash2,
} from 'lucide-vue-next'
import { calculateBoxValues } from '@/utils/stats'
import { useScopedResultPreviewStorage } from './useScopedResultPreviewStorage'
import { useWorkflowOverlayHost } from './workflowOverlayHost'
import SearchAppendMultiSelect from './common/SearchAppendMultiSelect.vue'
import {
  buildNormalizationStats,
  isFiniteNumber,
  normalizeChartRows,
  normalizeSeriesValue,
  type ChartRow,
  type NormalizationMethod,
} from './dataChartNormalization'
import { getCommonNumericFieldsFromGroups } from './groupedResultSchema'
import { inferSchemaFromRows } from '@/nodes/result'
import { getResultGroups, getResultRows, getResultSchemaFields } from './resultView'

use([
  CanvasRenderer,
  LineChart,
  BoxplotChart,
  GridComponent,
  TooltipComponent,
  TitleComponent,
  LegendComponent,
  DataZoomComponent,
  DatasetComponent,
  TransformComponent,
])

type ChartGroup = {
  name: string
  data: ChartRow[]
}

type ChartFilterPreset = {
  id: string
  name: string
  lowerBound: number | null
  upperBound: number | null
  updatedAt: number
}

const LINE_CHART_RENDER_LIMIT = 1200
const BOX_PLOT_COLORS = ['#2563eb', '#10b981', '#f59e0b', '#f43f5e', '#06b6d4', '#475569']

const props = defineProps<{
  data: unknown
  storageScopeKey?: string
}>()
const { overlayAppendTo } = useWorkflowOverlayHost()

const chartType = useScopedResultPreviewStorage(props.storageScopeKey, 'chart-type', 'line')
const maxPoints = useScopedResultPreviewStorage(props.storageScopeKey, 'chart-max-points', 5000)
const selectedKeys = useScopedResultPreviewStorage<string[]>(props.storageScopeKey, 'chart-selected-keys', [])
const lowerBound = useScopedResultPreviewStorage<number | null>(props.storageScopeKey, 'chart-lower-bound', null)
const upperBound = useScopedResultPreviewStorage<number | null>(props.storageScopeKey, 'chart-upper-bound', null)
const viewMode = useScopedResultPreviewStorage<'raw' | 'normalized'>(props.storageScopeKey, 'chart-view-mode', 'raw')
const normalizationMethod = useScopedResultPreviewStorage<NormalizationMethod>(
  props.storageScopeKey,
  'chart-normalization-method',
  'min-max',
)
const isPresetPanelOpen = ref(false)
const presetNameInput = ref('')
const selectedPresetId = useScopedResultPreviewStorage<string | null>(props.storageScopeKey, 'chart-selected-preset', null)
const savedPresets = useScopedResultPreviewStorage<ChartFilterPreset[]>(
  props.storageScopeKey,
  'chart-saved-presets',
  [],
)
const defaultPresetId = useScopedResultPreviewStorage<string | 'none' | null>(
  props.storageScopeKey,
  'chart-default-preset',
  null,
)
const chartRef = shallowRef<any>(null)

const createDefaultPresetName = () => {
  const now = new Date()
  const pad = (value: number) => String(value).padStart(2, '0')
  return `过滤条件 ${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
}

const persistDefaultPreset = () => {
  if (defaultPresetId.value === null) {
    return
  }
}

const applyPreset = (preset: ChartFilterPreset | null) => {
  lowerBound.value = preset?.lowerBound ?? null
  upperBound.value = preset?.upperBound ?? null
  selectedPresetId.value = preset?.id ?? null
  presetNameInput.value = preset?.name ?? ''
}

const applyDefaultPreset = () => {
  if (defaultPresetId.value === 'none') {
    applyPreset(null)
    return
  }

  const preset = savedPresets.value.find((item) => item.id === defaultPresetId.value) ?? null
  if (!preset) {
    defaultPresetId.value = null
    persistDefaultPreset()
    applyPreset(null)
    return
  }

  applyPreset(preset)
}

const rowMatchesBounds = (row: ChartRow, keys: string[]) => {
  if (keys.length === 0) return true

  return keys.every((key) => {
    const value = row[key]
    if (!isFiniteNumber(value)) return false
    if (lowerBound.value !== null && value < lowerBound.value) return false
    if (upperBound.value !== null && value > upperBound.value) return false
    return true
  })
}

const downsampleLineRows = (rows: ChartRow[], keys: string[], limit: number) => {
  if (rows.length <= limit || limit <= 2) return rows

  const primaryKey = keys[0]
  if (!primaryKey) return rows.slice(0, limit)

  const bucketSize = Math.max(1, Math.ceil(rows.length / Math.max(2, Math.floor(limit / 2))))
  const sampled: ChartRow[] = []

  for (let start = 0; start < rows.length; start += bucketSize) {
    const bucket = rows.slice(start, start + bucketSize)
    if (bucket.length === 0) continue

    const first = bucket[0]
    const last = bucket[bucket.length - 1]
    let minRow = first
    let maxRow = first

    for (const row of bucket) {
      const currentValue = row[primaryKey]
      const minValue = minRow?.[primaryKey]
      const maxValue = maxRow?.[primaryKey]

      if (isFiniteNumber(currentValue) && isFiniteNumber(minValue) && currentValue < minValue) {
        minRow = row
      }
      if (isFiniteNumber(currentValue) && isFiniteNumber(maxValue) && currentValue > maxValue) {
        maxRow = row
      }
    }

    const candidates = [first, minRow, maxRow, last].filter(
      (row, index, list): row is ChartRow => Boolean(row) && list.indexOf(row) === index,
    )
    sampled.push(...candidates)
  }

  return sampled.slice(0, limit)
}

const isGroupedData = computed(() => {
  return groupedData.value.length > 0
})

const groupedData = computed<ChartGroup[]>(() => getResultGroups(props.data) as ChartGroup[])

const tableRows = computed<ChartRow[]>(() => getResultRows(props.data) as ChartRow[])

const hasRenderableData = computed(() => groupedData.value.length > 0 || tableRows.value.length > 0)

const chartTypes = computed(() => {
  if (isGroupedData.value) {
    return [{ label: '多组因子对比', value: 'boxplot', icon: markRaw(Layers) }]
  }
  return [
    { label: '折线云图', value: 'line', icon: markRaw(LineChartIcon) },
    { label: '箱线分布', value: 'boxplot', icon: markRaw(BoxSelect) },
  ]
})

watch(
  isGroupedData,
  (grouped) => {
    if (grouped) chartType.value = 'boxplot'
  },
  { immediate: true },
)

const availableKeys = computed(() => {
  if (!hasRenderableData.value) return []

  if (isGroupedData.value) {
    return getCommonNumericFieldsFromGroups(groupedData.value)
  }

  const schemaFields = getResultSchemaFields(props.data)
  const fields = schemaFields.length > 0 ? schemaFields : (inferSchemaFromRows(tableRows.value).fields ?? [])

  return fields
    .filter((field) => field.type === 'number')
    .map((field) => field.name)
})

watch(
  availableKeys,
  (newKeys) => {
    const nextSelectedKeys = selectedKeys.value.filter((key) => newKeys.includes(key))

    if (nextSelectedKeys.length > 0) {
      selectedKeys.value = nextSelectedKeys
      return
    }

    if (newKeys.length > 0) selectedKeys.value = [newKeys[0]!]
  },
  { immediate: true },
)

watch(
  () => [lowerBound.value, upperBound.value] as const,
  () => {
    if (!selectedPresetId.value) return
    const selectedPreset = savedPresets.value.find((item) => item.id === selectedPresetId.value)
    if (!selectedPreset) {
      selectedPresetId.value = null
      return
    }

    const unchanged =
      selectedPreset.lowerBound === lowerBound.value && selectedPreset.upperBound === upperBound.value

    if (!unchanged) {
      selectedPresetId.value = null
    }
  },
)

const normalizedKeys = computed(() =>
  selectedKeys.value.length > 0 ? selectedKeys.value : availableKeys.value.slice(0, 1),
)

const normalizationSourceRows = computed(() => {
  if (isGroupedData.value) {
    return (filteredData.value as ChartGroup[]).flatMap((group) => group.data ?? [])
  }

  return filteredData.value as ChartRow[]
})

const supportsNormalization = computed(() => normalizedKeys.value.length > 0)

const normalizationStats = computed(() => {
  if (!supportsNormalization.value) return buildNormalizationStats([], [])
  return buildNormalizationStats(normalizationSourceRows.value, normalizedKeys.value)
})

const isNormalizedView = computed(
  () => supportsNormalization.value && viewMode.value === 'normalized',
)

const chartViewModes = [
  { label: '原始值', value: 'raw' as const },
  { label: '归一化', value: 'normalized' as const },
]

const normalizationMethodOptions = [
  { label: 'Min-Max 0~1', value: 'min-max' as const },
  { label: 'Z-Score', value: 'z-score' as const },
]

const filteredData = computed(() => {
  const sourceData = isGroupedData.value ? groupedData.value : tableRows.value
  const keys = normalizedKeys.value

  if (lowerBound.value === null && upperBound.value === null) {
    return sourceData
  }

  if (isGroupedData.value) {
    return (sourceData as ChartGroup[]).map((group) => ({
      ...group,
      data: Array.isArray(group.data) ? group.data.filter((row) => rowMatchesBounds(row, keys)) : [],
    }))
  }

  return (sourceData as ChartRow[]).filter((row) => rowMatchesBounds(row, keys))
})

const filteredSummary = computed(() => {
  if (isGroupedData.value) {
    return (filteredData.value as ChartGroup[]).reduce((sum, group) => sum + group.data.length, 0)
  }

  return Array.isArray(filteredData.value) ? (filteredData.value as ChartRow[]).length : 0
})

const sortedPresets = computed(() =>
  [...savedPresets.value].sort((left, right) => right.updatedAt - left.updatedAt),
)

const selectedPreset = computed(
  () => savedPresets.value.find((item) => item.id === selectedPresetId.value) ?? null,
)

const presetTriggerIcon = computed(() => (isPresetPanelOpen.value ? PanelRightClose : PanelRightOpen))

const saveCurrentPreset = () => {
  const preset: ChartFilterPreset = {
    id: `chart_filter_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name: presetNameInput.value.trim() || createDefaultPresetName(),
    lowerBound: lowerBound.value,
    upperBound: upperBound.value,
    updatedAt: Date.now(),
  }

  savedPresets.value = [preset, ...savedPresets.value]
  selectedPresetId.value = preset.id
  presetNameInput.value = preset.name
}

const markCurrentSelectionAsDefault = () => {
  if (!selectedPresetId.value) return
  defaultPresetId.value = selectedPresetId.value
  persistDefaultPreset()
}

const setNoFilterAsDefault = () => {
  defaultPresetId.value = 'none'
  persistDefaultPreset()
}

const deletePreset = (presetId: string) => {
  savedPresets.value = savedPresets.value.filter((item) => item.id !== presetId)
  if (selectedPresetId.value === presetId) selectedPresetId.value = null
  if (defaultPresetId.value === presetId) {
    defaultPresetId.value = null
    persistDefaultPreset()
  }
}

const selectAndApplyPreset = (preset: ChartFilterPreset) => {
  applyPreset(preset)
}

const presetSummaryText = (preset: ChartFilterPreset) => {
  const lower = preset.lowerBound === null ? '无下限' : `>= ${preset.lowerBound}`
  const upper = preset.upperBound === null ? '无上限' : `<= ${preset.upperBound}`
  return `${lower}，${upper}`
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

const createBoxplotBaseOption = (keys: string[]): Record<string, any> => ({
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
    formatter: createBoxplotTooltipFormatter(),
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
  grid: { left: 0, right: 0, top: 56, bottom: 40, containLabel: true },
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

const applyNormalizationAxis = (axis: Record<string, any>) => {
  if (!isNormalizedView.value) {
    axis.name = undefined
    axis.min = undefined
    axis.max = undefined
    return
  }

  axis.name = normalizationMethod.value === 'min-max' ? '归一化值' : '标准分值'
  axis.min = normalizationMethod.value === 'min-max' ? 0 : undefined
  axis.max = normalizationMethod.value === 'min-max' ? 1 : undefined
}

const chartOption = computed(() => {
  const sourceData = filteredData.value || []
  const keys = normalizedKeys.value
  if (keys.length === 0) return {}

  const option: any = {
    animation: false,
    useDirtyRect: true,
    backgroundColor: 'transparent',
    hoverLayer: true,
    color: ['#4f46e5', '#10b981', '#f59e0b', '#ec4899', '#06b6d4', '#8b5cf6', '#ef4444', '#14b8a6'],
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
    grid: { left: '3%', right: '3%', top: '15%', bottom: '20%', containLabel: true },
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
      data: keys,
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
  }

  if (isGroupedData.value) {
    Object.assign(option, createBoxplotBaseOption(keys))
    applyNormalizationAxis(option.yAxis)
    const normalizedGroups = isNormalizedView.value
      ? (sourceData as ChartGroup[]).map((group) => ({
          ...group,
          data: normalizeChartRows(group.data ?? [], keys, normalizationStats.value, normalizationMethod.value),
        }))
      : (sourceData as ChartGroup[])
    option.series = (sourceData as ChartGroup[]).map((group, index) => {
      const color = BOX_PLOT_COLORS[index % BOX_PLOT_COLORS.length]!
      const activeGroup = normalizedGroups[index] ?? group

      return {
        name: group.name,
        type: 'boxplot',
        data: keys.map((key) => calculateBoxValues(activeGroup.data || [], key)),
        itemStyle: {
          color: toRgba(color, 0.2),
          borderColor: color,
          borderWidth: 1.5,
        },
        emphasis: {
          focus: 'series',
          itemStyle: {
            borderWidth: 2.5,
          },
        },
      }
    })
  } else if (chartType.value === 'boxplot') {
    Object.assign(option, createBoxplotBaseOption(keys))
    applyNormalizationAxis(option.yAxis)
    const boxplotRows = isNormalizedView.value
      ? normalizeChartRows(sourceData as ChartRow[], keys, normalizationStats.value, normalizationMethod.value)
      : (sourceData as ChartRow[])
    option.series = [
      {
        name: '数据分布',
        type: 'boxplot',
        data: keys.map((key) => calculateBoxValues(boxplotRows, key)),
        itemStyle: {
          color: toRgba(BOX_PLOT_COLORS[0]!, 0.18),
          borderColor: BOX_PLOT_COLORS[0],
          borderWidth: 1.5,
        },
        emphasis: {
          focus: 'series',
          itemStyle: {
            borderWidth: 2.5,
          },
        },
      },
    ]
  } else {
    const rows = (sourceData as ChartRow[]).slice(0, maxPoints.value)
    const renderLimit = Math.min(maxPoints.value, LINE_CHART_RENDER_LIMIT)
    const sampledRows = downsampleLineRows(rows, keys, renderLimit)
    const sampledIndex = Array.from({ length: sampledRows.length }, (_, index) => index + 1)
    const activeNormalizationMethod = normalizationMethod.value

    option.tooltip.trigger = 'axis'
    option.tooltip.axisPointer = {
      type: 'line',
      animation: false,
      snap: false,
    }
    option.tooltip.triggerOn = 'mousemove'
    option.xAxis.data = sampledIndex
    option.tooltip.formatter = (params: Array<Record<string, unknown>> | Record<string, unknown>) => {
      const paramList = Array.isArray(params) ? params : [params]
      const axisValue = paramList[0]?.axisValueLabel ?? paramList[0]?.axisValue ?? ''
      const lines = [`样本 ${axisValue}`]

      paramList.forEach((item) => {
        const seriesName = String(item.seriesName ?? '')
        const seriesStats = normalizationStats.value.get(seriesName)
        const rawRow = sampledRows[Number(item.dataIndex ?? -1)] ?? null
        const rawValue = rawRow?.[seriesName]
        const displayValue = item.data

        if (isNormalizedView.value) {
          const normalizationLabel =
            activeNormalizationMethod === 'min-max' ? '归一化值' : '标准分值'
          lines.push(
            `${seriesName}<br/>原始值：${rawValue ?? '--'}<br/>${normalizationLabel}：${displayValue ?? '--'}`,
          )
          return
        }

        const statsLabel =
          seriesStats && activeNormalizationMethod === 'min-max'
            ? `最小值 ${seriesStats.min} / 最大值 ${seriesStats.max}`
            : undefined
        lines.push(statsLabel ? `${seriesName}：${displayValue}<br/>${statsLabel}` : `${seriesName}：${displayValue}`)
      })

      return lines.join('<br/>')
    }
    applyNormalizationAxis(option.yAxis)
    option.series = keys.map((key) => ({
      name: key,
      type: 'line',
      data: sampledRows.map((row) =>
        isNormalizedView.value
          ? normalizeSeriesValue(row[key], normalizationStats.value.get(key), activeNormalizationMethod)
          : typeof row[key] === 'number'
            ? row[key]
            : 0,
      ),
      showSymbol: false,
      lineStyle: { width: 2.5 },
      sampling: 'lttb',
      large: true,
      progressive: 800,
      progressiveThreshold: 1200,
      hoverAnimation: false,
      emphasis: {
        disabled: true,
      },
    }))
  }

  return markRaw(option)
})

watch(
  maxPoints,
  (value) => {
    const normalized = Number.isFinite(value) ? Math.min(50000, Math.max(100, Math.round(value))) : 5000
    if (normalized !== value) maxPoints.value = normalized
  },
  { immediate: true },
)

watch(
  viewMode,
  (value) => {
    if (value !== 'raw' && value !== 'normalized') viewMode.value = 'raw'
  },
  { immediate: true },
)

watch(
  normalizationMethod,
  (value) => {
    if (value !== 'min-max' && value !== 'z-score') normalizationMethod.value = 'min-max'
  },
  { immediate: true },
)

watch(
  savedPresets,
  (presets) => {
    const normalizedPresets = Array.isArray(presets)
      ? presets.filter((item): item is ChartFilterPreset => Boolean(item?.id))
      : []
    if (normalizedPresets.length !== presets.length) {
      savedPresets.value = normalizedPresets
    }
  },
  { immediate: true, deep: true },
)

watch(
  defaultPresetId,
  (value) => {
    if (value === 'none' || value === null) return
    if (!savedPresets.value.some((preset) => preset.id === value)) {
      defaultPresetId.value = null
    }
  },
  { immediate: true },
)

watch(
  selectedPresetId,
  (value) => {
    if (value === null) return
    if (!savedPresets.value.some((preset) => preset.id === value)) {
      selectedPresetId.value = null
    }
  },
  { immediate: true },
)

watch(
  availableKeys,
  () => {
    if (selectedKeys.value.length === 0) return
    const normalizedSelected = selectedKeys.value.filter((key) => availableKeys.value.includes(key))
    if (normalizedSelected.length !== selectedKeys.value.length) {
      selectedKeys.value = normalizedSelected
    }
  },
  { immediate: true },
)

applyDefaultPreset()
</script>

<template>
  <div class="flex flex-col h-full bg-white rounded-2xl overflow-hidden border border-slate-100 shadow-sm">
    <div class="flex items-center justify-between px-6 py-4 border-b border-slate-50 bg-slate-50/30">
      <div class="flex items-center gap-4 flex-wrap">
        <div class="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-100 rounded-lg shadow-sm">
          <ListChecks :size="14" class="text-indigo-500" />
          <span class="text-[10px] font-black text-slate-400 uppercase tracking-widest">分析因子</span>
          <SearchAppendMultiSelect
            v-model="selectedKeys"
            :options="availableKeys"
            :append-to="overlayAppendTo"
            placeholder="选择对比因子"
            select-class="property-select"
            select-test-id="chart-key-select"
            clear-button-test-id="chart-key-clear-all"
          />
        </div>

        <div
          v-if="!isGroupedData"
          class="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-100 rounded-lg shadow-sm"
        >
          <Settings2 :size="14" class="text-slate-400" />
          <span class="text-[10px] font-black text-slate-400 uppercase tracking-widest">采样</span>
          <InputNumber
            v-model="maxPoints"
            :min="100"
            :max="50000"
            class="filter-input w-20"
            :use-grouping="false"
          />
        </div>

        <div class="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-100 rounded-lg shadow-sm">
          <span class="text-[10px] font-black text-slate-400 uppercase tracking-widest">过滤</span>
          <InputNumber
            v-model="lowerBound"
            input-id="chart-lower-bound"
            class="filter-input w-24"
            :use-grouping="false"
            placeholder="下限"
          />
          <span class="text-xs font-bold text-slate-300">~</span>
          <InputNumber
            v-model="upperBound"
            input-id="chart-upper-bound"
            class="filter-input w-24"
            :use-grouping="false"
            placeholder="上限"
          />
          <span class="text-[10px] font-bold text-slate-400 whitespace-nowrap">{{ filteredSummary }} 条</span>
          <div class="relative flex items-center">
            <button
              data-test="chart-filter-presets-trigger"
              class="preset-trigger-button"
              :class="{ 'preset-trigger-button--active': isPresetPanelOpen }"
              :data-state="isPresetPanelOpen ? 'open' : 'closed'"
              type="button"
              @click="isPresetPanelOpen = !isPresetPanelOpen"
            >
              <component :is="presetTriggerIcon" :size="14" />
            </button>

            <aside
              v-if="isPresetPanelOpen"
              data-test="chart-preset-panel"
              class="chart-preset-popover absolute left-full top-0 z-20 ml-3 w-[320px] max-h-[min(75vh,640px)] bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden flex flex-col"
            >
              <div class="px-4 py-4 border-b border-slate-100">
                <div class="flex items-center gap-2 text-slate-700">
                  <Bookmark :size="15" />
                  <h3 class="text-sm font-black">过滤条件</h3>
                </div>
                <p class="mt-2 text-xs text-slate-500">保存、应用和设置默认过滤条件。默认也可以设为不过滤。</p>
              </div>

              <div class="px-4 py-4 border-b border-slate-100 space-y-3">
                <input
                  v-model="presetNameInput"
                  data-test="chart-preset-name"
                  type="text"
                  class="preset-name-input"
                  placeholder="输入名称，可留空自动生成"
                />

                <button
                  data-test="chart-preset-save"
                  class="preset-primary-button w-full"
                  type="button"
                  @click="saveCurrentPreset"
                >
                  保存当前条件
                </button>

                <div class="flex gap-2">
                  <button
                    data-test="chart-preset-mark-default"
                    class="preset-secondary-button flex-1"
                    :class="{ 'preset-secondary-button--active': defaultPresetId === selectedPresetId && selectedPresetId !== null }"
                    type="button"
                    :disabled="!selectedPresetId"
                    @click="markCurrentSelectionAsDefault"
                  >
                    默认应用当前条件
                  </button>
                  <button
                    data-test="chart-preset-set-no-default"
                    class="preset-secondary-button flex-1"
                    :class="{ 'preset-secondary-button--active': defaultPresetId === 'none' }"
                    type="button"
                    @click="setNoFilterAsDefault"
                  >
                    默认不过滤
                  </button>
                </div>
              </div>

              <div
                data-test="chart-preset-scroll"
                class="flex-1 min-h-0 overflow-y-auto preset-scroll px-4 py-4 space-y-3"
              >
                <div
                  v-for="preset in sortedPresets"
                  :key="preset.id"
                  class="preset-card"
                  :class="{ 'preset-card--active': defaultPresetId === preset.id }"
                >
                  <div class="flex items-start justify-between gap-3">
                    <div class="min-w-0">
                      <span class="text-sm font-bold text-slate-800 truncate block">{{ preset.name }}</span>
                      <p class="mt-1 text-xs text-slate-500">{{ presetSummaryText(preset) }}</p>
                    </div>

                    <div class="flex items-center gap-2 shrink-0">
                      <button
                        data-test="chart-preset-apply"
                        class="preset-action-button"
                        type="button"
                        @click="selectAndApplyPreset(preset)"
                      >
                        <Check :size="14" />
                      </button>
                      <button class="preset-action-button" type="button" @click.stop="deletePreset(preset.id)">
                        <Trash2 :size="14" />
                      </button>
                    </div>
                  </div>

                  <div
                    v-if="selectedPresetId === preset.id"
                    class="mt-3 text-[10px] font-bold text-blue-600 bg-blue-50 rounded-full px-2 py-1 inline-flex"
                  >
                    当前已应用
                  </div>
                </div>

                <div v-if="sortedPresets.length === 0" class="text-xs text-slate-400 leading-6">
                  还没有保存的过滤条件。设置好上下限后即可在这里保存。
                </div>
              </div>
            </aside>
          </div>
        </div>

        <div
          v-if="supportsNormalization"
          class="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-100 rounded-lg shadow-sm"
        >
          <Scale :size="14" class="text-blue-600" />
          <span class="text-[10px] font-black text-slate-400 uppercase tracking-widest">对比</span>
          <div class="segmented-toggle-group">
            <button
              v-for="modeOption in chartViewModes"
              :key="modeOption.value"
              :data-test="`chart-view-mode-${modeOption.value}`"
              class="segmented-toggle-button"
              :class="{ 'segmented-toggle-button--active': viewMode === modeOption.value }"
              :data-state="viewMode === modeOption.value ? 'active' : 'inactive'"
              type="button"
              @click="viewMode = modeOption.value"
            >
              {{ modeOption.label }}
            </button>
          </div>
        </div>

        <div
          v-if="supportsNormalization && isNormalizedView"
          class="flex items-center gap-2 px-3 py-1.5 bg-blue-50 border border-blue-100 rounded-lg shadow-sm"
        >
          <span class="text-[10px] font-black text-blue-600 uppercase tracking-widest">方式</span>
          <div class="segmented-toggle-group">
            <button
              v-for="methodOption in normalizationMethodOptions"
              :key="methodOption.value"
              :data-test="`chart-normalization-method-${methodOption.value}`"
              class="segmented-toggle-button segmented-toggle-button--compact"
              :class="{
                'segmented-toggle-button--active': normalizationMethod === methodOption.value,
              }"
              :data-state="normalizationMethod === methodOption.value ? 'active' : 'inactive'"
              type="button"
              @click="normalizationMethod = methodOption.value"
            >
              {{ methodOption.label }}
            </button>
          </div>
          <span class="text-[10px] font-bold text-blue-600/80 whitespace-nowrap">
            仅图表显示归一化，过滤仍按原始值生效
          </span>
        </div>
      </div>

      <Select
        v-model="chartType"
        :options="chartTypes"
        :append-to="overlayAppendTo"
        option-label="label"
        option-value="value"
        class="chart-type-select"
        :disabled="isGroupedData"
      >
        <template #value="slotProps">
          <div v-if="slotProps.value" class="flex items-center gap-2 text-slate-800">
            <component
              :is="chartTypes.find((item) => item.value === slotProps.value)?.icon"
              :size="14"
              :stroke-width="2.5"
            />
            <span>{{ chartTypes.find((item) => item.value === slotProps.value)?.label }}</span>
          </div>
        </template>
        <template #option="slotProps">
          <div class="flex items-center gap-2 font-bold text-[11px] uppercase tracking-widest text-slate-500 w-full">
            <component :is="slotProps.option.icon" :size="14" class="text-slate-700" />
            <span>{{ slotProps.option.label }}</span>
          </div>
        </template>
      </Select>
    </div>

    <div class="flex-1 p-4 relative min-h-0">
      <div class="h-full flex gap-4 min-h-0">
        <div class="flex-1 min-w-0">
          <div v-if="hasRenderableData" class="h-full w-full">
            <VChart ref="chartRef" :option="chartOption" autoresize />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.chart-preset-popover {
  margin-top: 2px;
}

:deep(.filter-input) {
  width: 88px;
}

:deep(.filter-input .p-inputnumber-input) {
  padding: 2px 8px;
  font-size: 11px;
  width: 60px;
  border: none;
  background: #f8fafc;
  border-radius: 4px;
  font-family: monospace;
}

:deep(.chart-type-select) {
  height: 32px;
  font-size: 11px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border: 1px solid #e2e8f0;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
  border-radius: 8px;
  background: #fdfdfe;
  transition: all 0.2s ease;
}

:deep(.chart-type-select:hover:not(.p-disabled)) {
  border-color: #94a3b8;
  background: #f8fafc;
}

:deep(.chart-type-select .p-select-label) {
  padding: 4px 12px;
  display: flex;
  align-items: center;
}

:deep(.chart-type-select .p-select-dropdown) {
  width: 28px;
  color: #94a3b8;
}

:deep(.property-select) {
  height: 28px;
  min-width: 160px;
  max-width: 300px;
  font-size: 11px;
  font-weight: 700;
  border-color: #f1f5f9;
  background: #f8fafc;
}

:deep(.property-select .p-multiselect-label) {
  padding: 2px 8px;
  display: flex;
  align-items: center;
}

.preset-trigger-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 1px solid #dbeafe;
  border-radius: 8px;
  background: #eff6ff;
  color: #2563eb;
  cursor: pointer;
  transition:
    color 0.2s ease,
    border-color 0.2s ease,
    background-color 0.2s ease,
    box-shadow 0.2s ease;
}

.preset-trigger-button--active {
  border-color: #1d4ed8;
  background: #2563eb;
  color: #ffffff;
  box-shadow: 0 8px 18px -12px rgba(37, 99, 235, 0.7);
}

.preset-name-input {
  width: 100%;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 9px 12px;
  font-size: 12px;
  color: #334155;
  background: #fff;
}

.preset-primary-button,
.preset-secondary-button {
  border-radius: 12px;
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
}

.preset-primary-button {
  border: 1px solid #2563eb;
  background: #2563eb;
  color: #fff;
  padding: 9px 12px;
}

.preset-secondary-button {
  border: 1px solid #cbd5e1;
  background: #fff;
  color: #475569;
  padding: 9px 12px;
}

.preset-secondary-button--active {
  border-color: #2563eb;
  background: #eff6ff;
  color: #2563eb;
}

.preset-secondary-button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.preset-scroll::-webkit-scrollbar {
  width: 6px;
}

.preset-scroll::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  border-radius: 999px;
}

.preset-card {
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  padding: 12px;
  background: #fff;
}

.preset-card--active {
  border-color: #2563eb;
  background: #eff6ff;
}

.preset-action-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  background: #fff;
  color: #94a3b8;
  cursor: pointer;
  transition:
    color 0.2s ease,
    border-color 0.2s ease,
    background-color 0.2s ease;
}

.preset-action-button:hover {
  color: #2563eb;
  border-color: #bfdbfe;
  background: #eff6ff;
}

.segmented-toggle-group {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px;
  border-radius: 10px;
  background: #f8fafc;
}

.segmented-toggle-button {
  border: none;
  border-radius: 8px;
  padding: 6px 10px;
  background: transparent;
  color: #64748b;
  font-size: 11px;
  font-weight: 800;
  cursor: pointer;
  transition:
    background-color 0.2s ease,
    color 0.2s ease,
    box-shadow 0.2s ease;
}

.segmented-toggle-button--compact {
  padding: 5px 8px;
}

.segmented-toggle-button--active {
  background: #2563eb;
  color: #ffffff;
  box-shadow: 0 6px 12px -10px rgba(37, 99, 235, 0.8);
}
</style>
