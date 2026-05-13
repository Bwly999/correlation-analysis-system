<script setup lang="ts">
import { computed, markRaw, ref, shallowRef, watch } from 'vue'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { BarChart, BoxplotChart, LineChart, ScatterChart } from 'echarts/charts'
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
  HelpCircle,
  Layers,
  LineChart as LineChartIcon,
  ListChecks,
  PanelRightClose,
  PanelRightOpen,
  Scale,
  Settings2,
  Trash2,
} from 'lucide-vue-next'
import {
  calculateBoxplotStats,
  type BoxplotWhiskerMode,
} from '@/utils/stats'
import {
  buildScopedResultPreviewStorageKey,
  useScopedResultPreviewStorage,
} from './useScopedResultPreviewStorage'
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
import {
  filterRowsByRenderableKeys,
  getRenderableNumericFieldsFromRows,
} from './dataChartSeriesFiltering'
import { getCommonNumericFieldsFromGroups } from './groupedResultSchema'
import {
  getResultGroups,
  getResultPreviewChartDefaults,
  getResultRows,
  getResultSchemaFields,
} from './resultView'
import type { PreviewChartMode } from '@/nodes/result'

use([
  CanvasRenderer,
  LineChart,
  BarChart,
  BoxplotChart,
  ScatterChart,
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

type GroupedChartType = 'boxplot' | 'grouped-scatter' | 'grouped-bar'
type TableChartType = 'line' | 'scatter' | 'bar' | 'boxplot' | 'normal'
type ChartType = TableChartType | GroupedChartType

const LINE_CHART_RENDER_LIMIT = 1200
const NORMAL_DISTRIBUTION_BIN_COUNT = 20
const NORMAL_DISTRIBUTION_CURVE_POINTS = 80
const NORMAL_DISTRIBUTION_COLUMNS = 2
const BOX_PLOT_COLORS = ['#2563eb', '#10b981', '#f59e0b', '#f43f5e', '#06b6d4', '#475569']
const TABLE_CHART_TYPES: TableChartType[] = ['line', 'scatter', 'bar', 'boxplot', 'normal']
const GROUPED_CHART_TYPES: GroupedChartType[] = ['boxplot', 'grouped-scatter', 'grouped-bar']

const props = defineProps<{
  data: unknown
  storageScopeKey?: string
}>()
const { overlayAppendTo } = useWorkflowOverlayHost()

const hasStoredScopedSlice = (slice: string) => {
  const storageKey = buildScopedResultPreviewStorageKey(props.storageScopeKey, slice)
  if (!storageKey || typeof window === 'undefined') return false
  return window.localStorage.getItem(storageKey) !== null
}

const hadStoredChartTypeAtMount = hasStoredScopedSlice('chart-type')
const hadStoredSelectedKeysAtMount = hasStoredScopedSlice('chart-selected-keys')
const hadStoredXAxisFieldAtMount = hasStoredScopedSlice('chart-x-field')

const chartType = useScopedResultPreviewStorage<ChartType>(props.storageScopeKey, 'chart-type', 'line')
const maxPoints = useScopedResultPreviewStorage(props.storageScopeKey, 'chart-max-points', 5000)
const selectedKeys = useScopedResultPreviewStorage<string[]>(props.storageScopeKey, 'chart-selected-keys', [])
const xField = useScopedResultPreviewStorage<string | null>(props.storageScopeKey, 'chart-x-field', null)
const lowerBound = useScopedResultPreviewStorage<number | null>(props.storageScopeKey, 'chart-lower-bound', null)
const upperBound = useScopedResultPreviewStorage<number | null>(props.storageScopeKey, 'chart-upper-bound', null)
const viewMode = useScopedResultPreviewStorage<'raw' | 'normalized'>(props.storageScopeKey, 'chart-view-mode', 'raw')
const normalizationMethod = useScopedResultPreviewStorage<NormalizationMethod>(
  props.storageScopeKey,
  'chart-normalization-method',
  'min-max',
)
const skipInvalidRows = useScopedResultPreviewStorage(
  props.storageScopeKey,
  'chart-skip-invalid-rows',
  false,
)
const boxplotWhiskerMode = useScopedResultPreviewStorage<BoxplotWhiskerMode>(
  props.storageScopeKey,
  'chart-boxplot-whisker-mode',
  'iqr',
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
const chartUpdateOptions = markRaw({
  notMerge: true,
  lazyUpdate: true,
})
const hasAppliedInitialChartState = shallowRef(false)

const isGroupedChartType = (value: string): value is GroupedChartType =>
  GROUPED_CHART_TYPES.includes(value as GroupedChartType)

const isTableChartType = (value: string): value is TableChartType =>
  TABLE_CHART_TYPES.includes(value as TableChartType)

const normalizeLegacyTableChartType = (value: string): TableChartType | null => {
  if (value === 'histogram') return 'normal'
  return isTableChartType(value) ? value : null
}

const usesSampling = computed(() => chartType.value === 'line')
const supportsNormalizationForChartType = computed(() =>
  chartType.value === 'line' || chartType.value === 'boxplot' || chartType.value === 'normal',
)
const requiresXAxisField = computed(
  () =>
    chartType.value === 'scatter'
    || chartType.value === 'bar'
    || chartType.value === 'grouped-scatter',
)

const boxplotWhiskerModeOptions = [
  { label: '1.5 IQR', value: 'iqr' as const },
  { label: '2% / 98%', value: 'percentile' as const },
]

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
    return [
      { label: '多组因子对比', value: 'boxplot' as const, icon: markRaw(Layers) },
      { label: '多组散点图', value: 'grouped-scatter' as const, icon: markRaw(LineChartIcon) },
      { label: '多组柱状图', value: 'grouped-bar' as const, icon: markRaw(BoxSelect) },
    ]
  }
  return [
    { label: '折线云图', value: 'line' as const, icon: markRaw(LineChartIcon) },
    { label: '散点图', value: 'scatter' as const, icon: markRaw(LineChartIcon) },
    { label: '柱状图', value: 'bar' as const, icon: markRaw(BoxSelect) },
    { label: '箱线分布', value: 'boxplot' as const, icon: markRaw(BoxSelect) },
    { label: '正态分布', value: 'normal' as const, icon: markRaw(LineChartIcon) },
  ]
})

watch(
  isGroupedData,
  (grouped) => {
    if (grouped) {
      if (!isGroupedChartType(chartType.value)) chartType.value = 'boxplot'
      return
    }

    const normalizedChartType = normalizeLegacyTableChartType(String(chartType.value))
    if (normalizedChartType && normalizedChartType !== chartType.value) {
      chartType.value = normalizedChartType
      return
    }

    if (!isTableChartType(String(chartType.value))) chartType.value = 'line'
  },
  { immediate: true },
)

const availableKeys = computed(() => {
  if (!hasRenderableData.value) return []

  if (isGroupedData.value) {
    return getCommonNumericFieldsFromGroups(groupedData.value)
  }

  const schemaFields = getResultSchemaFields(props.data)
  return getRenderableNumericFieldsFromRows(tableRows.value, schemaFields)
})

const schemaFields = computed(() => getResultSchemaFields(props.data))

const allFieldNames = computed(() => {
  if (schemaFields.value.length > 0) {
    return schemaFields.value.map((field) => field.name)
  }

  const fieldNames = new Set<string>()
  tableRows.value.forEach((row) => {
    Object.keys(row).forEach((field) => fieldNames.add(field))
  })
  return [...fieldNames]
})

const categoricalFieldNames = computed(() => {
  if (schemaFields.value.length > 0) {
    return schemaFields.value
      .filter((field) => field.type !== 'number' && !availableKeys.value.includes(field.name))
      .map((field) => field.name)
  }

  return allFieldNames.value.filter((field) => !availableKeys.value.includes(field))
})

const availableXAxisOptions = computed(() => {
  if (isGroupedData.value) {
    if (chartType.value === 'grouped-scatter') return availableKeys.value
    return []
  }

  if (chartType.value === 'scatter') return availableKeys.value
  if (chartType.value === 'bar') return allFieldNames.value
  return []
})

const previewChartDefaults = computed(() => getResultPreviewChartDefaults(props.data))

const hasAnyStoredChartState = () =>
  hadStoredChartTypeAtMount || hadStoredSelectedKeysAtMount || hadStoredXAxisFieldAtMount

const resolveInitialChartState = () => {
  const numericKeys = availableKeys.value
  const firstNumericKey = numericKeys[0] ?? null
  const previewDefaults = previewChartDefaults.value

  if (previewDefaults) {
    if (isGroupedData.value) {
      const previewMode = previewDefaults.mode
      if (isGroupedChartType(previewMode)) {
        const resolvedYFields = (previewDefaults.yFields ?? []).filter((field) => numericKeys.includes(field))
        const resolvedSelectedKeys = resolvedYFields.length > 0
          ? [resolvedYFields[0]!]
          : firstNumericKey
            ? [firstNumericKey]
            : []
        const resolvedXAxis =
          typeof previewDefaults.xField === 'string' && previewDefaults.xField.length > 0
            ? previewDefaults.xField
            : null

        return {
          chartType: previewMode,
          selectedKeys: resolvedSelectedKeys,
          xField: resolvedXAxis,
        }
      }
    } else {
      const previewMode = normalizeLegacyTableChartType(previewDefaults.mode)
      if (previewMode) {
        const resolvedYFields = (previewDefaults.yFields ?? []).filter((field) => numericKeys.includes(field))
        const resolvedSelectedKeys =
          resolvedYFields.length > 0
            ? (previewMode === 'line' || previewMode === 'boxplot' || previewMode === 'normal'
              ? resolvedYFields
              : [resolvedYFields[0]!])
            : firstNumericKey
              ? [firstNumericKey]
              : []
        const resolvedXAxis =
          typeof previewDefaults.xField === 'string' && previewDefaults.xField.length > 0
            ? previewDefaults.xField
            : null

        return {
          chartType: previewMode,
          selectedKeys: resolvedSelectedKeys,
          xField: resolvedXAxis,
        }
      }
    }

    if (isGroupedData.value) {
      const resolvedYFields = (previewDefaults.yFields ?? []).filter((field) => numericKeys.includes(field))
      return {
        chartType: 'boxplot' as ChartType,
        selectedKeys: resolvedYFields.length > 0
          ? [resolvedYFields[0]!]
          : firstNumericKey
            ? [firstNumericKey]
            : [],
        xField: null,
      }
    }
  }

  if (isGroupedData.value) {
    return {
      chartType: 'boxplot' as ChartType,
      selectedKeys: firstNumericKey ? [firstNumericKey] : [],
      xField: null,
    }
  }

  return {
    chartType: 'line' as ChartType,
    selectedKeys: firstNumericKey ? [firstNumericKey] : [],
    xField: null,
  }
}

const applyInitialChartState = () => {
  if (hasAppliedInitialChartState.value || !hasRenderableData.value) return

  if (!hasAnyStoredChartState()) {
    const initialState = resolveInitialChartState()
    chartType.value = initialState.chartType
    selectedKeys.value = initialState.selectedKeys
    xField.value = initialState.xField
  }

  hasAppliedInitialChartState.value = true
}

applyInitialChartState()

watch(
  [hasRenderableData, availableKeys, allFieldNames],
  () => {
    applyInitialChartState()
  },
  { immediate: true },
)

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
  [availableXAxisOptions, requiresXAxisField],
  ([nextXAxisOptions, nextRequiresXAxisField]) => {
    if (!nextRequiresXAxisField || nextXAxisOptions.length === 0) {
      if (!nextRequiresXAxisField) xField.value = null
      return
    }

    if (!xField.value || !nextXAxisOptions.includes(xField.value)) {
      xField.value = nextXAxisOptions[0] ?? null
    }
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

const lineRenderableRows = computed(() => {
  if (isGroupedData.value || chartType.value !== 'line' || !skipInvalidRows.value) {
    return filteredData.value as ChartRow[]
  }

  return filterRowsByRenderableKeys(filteredData.value as ChartRow[], normalizedKeys.value)
})

const normalizationSourceRows = computed(() => {
  if (isGroupedData.value) {
    return (filteredData.value as ChartGroup[]).flatMap((group) => group.data ?? [])
  }

  if (chartType.value === 'line' && skipInvalidRows.value) {
    return lineRenderableRows.value
  }

  return filteredData.value as ChartRow[]
})

const supportsNormalization = computed(
  () => normalizedKeys.value.length > 0 && supportsNormalizationForChartType.value,
)

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

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

const formatIntervalValue = (value: number) => {
  if (!Number.isFinite(value)) return ''
  if (Number.isInteger(value)) return String(value)
  return value.toFixed(2).replace(/\.?0+$/, '')
}

const createBoxplotDataItem = (values: number[], color: string) => ({
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

const formatBoxValue = (value: unknown) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '--'
  if (Number.isInteger(value)) return String(value)
  return value.toFixed(2).replace(/\.?0+$/, '')
}

const currentBoxplotWhiskerModeLabel = computed(
  () => boxplotWhiskerModeOptions.find((item) => item.value === boxplotWhiskerMode.value)?.label ?? '1.5 IQR',
)

const boxplotToggleVisible = computed(() => hasRenderableData.value && chartType.value === 'boxplot')

const createBoxplotOutlierTooltipFormatter = () => (params: Record<string, unknown>) => {
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
    `<span>箱须口径</span><span style="color:#0f172a;text-align:right;font-weight:600;">${currentBoxplotWhiskerModeLabel.value}</span>`,
    `<span>数值</span><span style="color:#0f172a;text-align:right;font-weight:600;">${formatBoxValue(pointValue)}</span>`,
    `</div>`,
    `</div>`,
  ].join('')
}

const getGroupedScatterOffset = (index: number, total: number) => [Math.round((index - (total - 1) / 2) * 16), 0]

const getNormalDistributionValues = (rows: ChartRow[], key: string) =>
  rows.map((row) => row[key]).filter(isFiniteNumber)

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

  return { histogram, curve, min, max, binWidth, rawMin, rawMax, rawMean, rawStd }
}

const createNormalDistributionOption = (rows: ChartRow[], keys: string[], xAxisName: string) => {
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
      textStyle: { color: '#64748b', fontSize: 11, fontWeight: '600' },
    },
    title: keys.map((key, index) => {
      const values = getNormalDistributionValues(rows, key)
      const { rawMin, rawMax, rawMean, rawStd } = createNormalDistributionSeriesData(values)
      const columnIndex = index % NORMAL_DISTRIBUTION_COLUMNS
      const rowIndex = Math.floor(index / NORMAL_DISTRIBUTION_COLUMNS)

      const statsParts = [
        `均值: ${formatBoxValue(rawMean)}`,
        `最大值: ${formatBoxValue(rawMax)}`,
        `最小值: ${formatBoxValue(rawMin)}`,
        `标准差: ${formatBoxValue(rawStd)}`,
      ]

      return {
        text: key,
        subtext: statsParts.join('  '),
        left: columnIndex === 0 ? '6%' : '56%',
        top: `${8 + rowHeight * rowIndex}%`,
        textStyle: {
          color: '#0f172a',
          fontSize: 12,
          fontWeight: 700,
        },
        subtextStyle: {
          color: '#64748b',
          fontSize: 10,
        },
      }
    }),
    grid: keys.map((_, index) => {
      const columnIndex = index % NORMAL_DISTRIBUTION_COLUMNS
      const rowIndex = Math.floor(index / NORMAL_DISTRIBUTION_COLUMNS)

      return {
        left: columnIndex === 0 ? '6%' : '56%',
        width: '38%',
        top: `${17 + rowHeight * rowIndex}%`,
        height: `${Math.max(10, rowHeight - 15)}%`,
        containLabel: true,
      }
    }),
    xAxis: keys.map((key, index) => {
      const { min, max } = createNormalDistributionSeriesData(getNormalDistributionValues(rows, key))

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
      const { histogram, curve } = createNormalDistributionSeriesData(getNormalDistributionValues(rows, key))

      return [
        {
          name: `${key} 频数`,
          type: 'bar',
          xAxisIndex: index,
          yAxisIndex: index,
          data: histogram,
          tooltip: {
            show: true,
          },
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
          tooltip: {
            show: false,
          },
          showSymbol: false,
          smooth: true,
          emphasis: {
            showSymbol: true,
            symbol: 'circle',
            symbolSize: 6,
            itemStyle: {
              color: '#0f172a',
              borderColor: '#ffffff',
              borderWidth: 2,
            },
            lineStyle: {
              width: 3,
            },
          },
          lineStyle: {
            width: 2.4,
            color: '#0f172a',
          },
        },
      ]
    }),
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

const createBoxplotBaseOption = (keys: string[], whiskerModeLabel: string): Record<string, any> => ({
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
  const primaryKey = keys[0] ?? ''
  const xAxisField = xField.value ?? availableXAxisOptions.value[0] ?? null

  const option: any = {
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
    if (chartType.value === 'grouped-scatter') {
      const groupedScatterSeries = (sourceData as ChartGroup[]).map((group) => ({
        name: group.name,
        type: 'scatter',
        symbolSize: 8,
        data: group.data
          .filter((row) => xAxisField && typeof row[xAxisField] === 'number' && typeof row[primaryKey] === 'number')
          .map((row) => [row[xAxisField as string], row[primaryKey]]),
      }))

      option.title = { text: `${xAxisField ?? 'X'} vs ${primaryKey} 分组散点图`, left: 'center' }
      option.tooltip.trigger = 'item'
      option.legend.data = groupedScatterSeries.map((series: { name: string }) => series.name)
      option.grid = { top: '18%', bottom: '15%', left: '10%', right: '10%', containLabel: true }
      option.xAxis = { type: 'value', name: xAxisField, boundaryGap: ['5%', '5%'] }
      option.yAxis = { type: 'value', name: primaryKey, scale: true, boundaryGap: ['15%', '15%'] }
      option.series = groupedScatterSeries
      return markRaw(option)
    }

    if (chartType.value === 'grouped-bar') {
      option.title = { text: `${primaryKey} 分组对比`, left: 'center' }
      option.tooltip.trigger = 'axis'
      option.legend.data = [primaryKey]
      option.grid = { top: '18%', bottom: '15%', left: '10%', right: '10%', containLabel: true }
      option.xAxis = {
        type: 'category',
        data: (sourceData as ChartGroup[]).map((group) => group.name),
        boundaryGap: true,
      }
      option.yAxis = { type: 'value', boundaryGap: ['0%', '15%'] }
      option.series = [
        {
          name: primaryKey,
          type: 'bar',
          data: (sourceData as ChartGroup[]).map((group) => {
            const firstValidRow = group.data.find((row) => typeof row[primaryKey] === 'number')
            return firstValidRow?.[primaryKey] ?? null
          }),
          itemStyle: { color: '#2563eb' },
        },
      ]
      return markRaw(option)
    }

    Object.assign(option, createBoxplotBaseOption(keys, currentBoxplotWhiskerModeLabel.value))
    applyNormalizationAxis(option.yAxis)
    const normalizedGroups = isNormalizedView.value
      ? (sourceData as ChartGroup[]).map((group) => ({
          ...group,
          data: normalizeChartRows(group.data ?? [], keys, normalizationStats.value, normalizationMethod.value),
        }))
      : (sourceData as ChartGroup[])
    const boxplotSeries = (sourceData as ChartGroup[]).map((group, index) => {
      const color = BOX_PLOT_COLORS[index % BOX_PLOT_COLORS.length]!
      const activeGroup = normalizedGroups[index] ?? group

      return {
        name: group.name,
        type: 'boxplot',
        data: keys.map((key) => calculateBoxplotStats(activeGroup.data || [], key, boxplotWhiskerMode.value).boxValues),
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
    const outlierSeries = (sourceData as ChartGroup[]).flatMap((group, index, groups) => {
      const color = BOX_PLOT_COLORS[index % BOX_PLOT_COLORS.length]!
      const activeGroup = normalizedGroups[index] ?? group
      const scatterData = keys.flatMap((key, keyIndex) =>
        calculateBoxplotStats(activeGroup.data || [], key, boxplotWhiskerMode.value).outliers.map((value) => ({
          value: [keyIndex, value] as [number, number],
          factorName: key,
          groupName: group.name,
        })),
      )

      if (scatterData.length === 0) return []

      return [
        {
          name: `${group.name}-离群点`,
          type: 'scatter',
          data: scatterData,
          symbolSize: 8,
          symbolOffset: getGroupedScatterOffset(index, groups.length),
          z: 4,
          legendHoverLink: false,
          itemStyle: {
            color,
            borderColor: '#ffffff',
            borderWidth: 1.2,
          },
          tooltip: {
            trigger: 'item',
            formatter: createBoxplotOutlierTooltipFormatter(),
          },
        },
      ]
    })
    option.legend.data = boxplotSeries.map((series: { name: string }) => series.name)
    option.series = [...boxplotSeries, ...outlierSeries]
  } else if (chartType.value === 'boxplot') {
    Object.assign(option, createBoxplotBaseOption(keys, currentBoxplotWhiskerModeLabel.value))
    applyNormalizationAxis(option.yAxis)
    const boxplotRows = isNormalizedView.value
      ? normalizeChartRows(sourceData as ChartRow[], keys, normalizationStats.value, normalizationMethod.value)
      : (sourceData as ChartRow[])
    const boxStatsByKey = keys.map((key) => calculateBoxplotStats(boxplotRows, key, boxplotWhiskerMode.value))
    const outlierData = boxStatsByKey.flatMap((stats, index) =>
      stats.outliers.map((value) => ({
        value: [index, value] as [number, number],
        factorName: keys[index] ?? '',
      })),
    )
    option.legend.data = ['数据分布']
    option.series = [
      {
        name: '数据分布',
        type: 'boxplot',
        data: boxStatsByKey.map((stats, index) =>
          createBoxplotDataItem(
            stats.boxValues,
            BOX_PLOT_COLORS[index % BOX_PLOT_COLORS.length]!,
          ),
        ),
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
    if (outlierData.length > 0) {
      option.series.push({
        name: '离群点',
        type: 'scatter',
        data: outlierData,
        symbolSize: 8,
        z: 4,
        legendHoverLink: false,
        itemStyle: {
          color: '#0f172a',
          borderColor: '#ffffff',
          borderWidth: 1.2,
        },
        tooltip: {
          trigger: 'item',
          formatter: createBoxplotOutlierTooltipFormatter(),
        },
      })
    }
  } else if (chartType.value === 'scatter') {
    option.title = { text: `${xAxisField ?? 'X'} vs ${primaryKey} 散点分布`, left: 'center' }
    option.tooltip.trigger = 'item'
    option.grid = { top: '15%', bottom: '15%', left: '10%', right: '10%', containLabel: true }
    option.xAxis = { type: 'value', name: xAxisField, boundaryGap: ['5%', '5%'] }
    option.yAxis = { type: 'value', name: primaryKey, scale: true, boundaryGap: ['15%', '15%'] }
    option.series = [
      {
        type: 'scatter',
        symbolSize: 8,
        data: (sourceData as ChartRow[])
          .filter((row) => xAxisField && typeof row[xAxisField] === 'number' && typeof row[primaryKey] === 'number')
          .map((row) => [row[xAxisField as string], row[primaryKey]]),
        itemStyle: { color: '#0ea5e9' },
      },
    ]
  } else if (chartType.value === 'bar') {
    option.title = { text: `${primaryKey} 分类对比`, left: 'center' }
    option.tooltip.trigger = 'axis'
    option.grid = { top: '15%', bottom: '15%', left: '10%', right: '10%', containLabel: true }
    option.xAxis = {
      type: 'category',
      data: (sourceData as ChartRow[]).map((row) => row[xAxisField as string]),
      boundaryGap: true,
    }
    option.yAxis = { type: 'value', boundaryGap: ['0%', '15%'] }
    option.series = [
      {
        name: primaryKey,
        type: 'bar',
        data: (sourceData as ChartRow[]).map((row) =>
          typeof row[primaryKey] === 'number' ? row[primaryKey] : null,
        ),
        itemStyle: { color: '#2563eb' },
      },
    ]
  } else if (chartType.value === 'normal') {
    const normalRows = isNormalizedView.value
      ? normalizeChartRows(sourceData as ChartRow[], keys, normalizationStats.value, normalizationMethod.value)
      : (sourceData as ChartRow[])
    const xAxisName = isNormalizedView.value
      ? normalizationMethod.value === 'min-max'
        ? '归一化值'
        : '标准分值'
      : '原始值'

    return markRaw(createNormalDistributionOption(normalRows, keys, xAxisName))
  } else {
    const lineRows = lineRenderableRows.value
    const rows = lineRows.slice(0, maxPoints.value)
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

const chartHostStyle = computed(() => {
  if (isGroupedData.value || chartType.value !== 'normal') return undefined

  const rowCount = Math.max(1, Math.ceil(normalizedKeys.value.length / NORMAL_DISTRIBUTION_COLUMNS))
  return {
    minHeight: `${Math.max(360, rowCount * 300)}px`,
  }
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
  boxplotWhiskerMode,
  (value) => {
    if (value !== 'iqr' && value !== 'percentile') boxplotWhiskerMode.value = 'iqr'
  },
  { immediate: true },
)

watch(
  skipInvalidRows,
  (value) => {
    if (typeof value !== 'boolean') skipInvalidRows.value = false
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

// 正态分布图 hover 联动强调：鼠标悬停柱子时同步高亮对应的拟合线
watch(
  [chartRef, () => chartType.value],
  ([ref, type]) => {
    const instance = ref?.chart || ref?.getEchartsInstance?.()
    if (!instance) return

    if (type !== 'normal') {
      instance.off('mouseover')
      instance.off('globalout')
      return
    }

    instance.off('mouseover')
    instance.off('globalout')

    instance.on('mouseover', (params: Record<string, any>) => {
      const si = Number(params.seriesIndex)
      const di = Number(params.dataIndex)
      if (!Number.isFinite(si)) return

      // 正态分布图: 每个 key 对应 bar(偶数索引) + line(奇数索引) 一对
      // 同时高亮当前数据点 + 对应 pair series 中最邻近的数据点
      instance.dispatchAction({ type: 'downplay' })
      const pairSi = si % 2 === 0 ? si + 1 : si - 1

      // 高亮当前 hover 的数据点
      instance.dispatchAction({ type: 'highlight', seriesIndex: si, dataIndex: di })

      // 查找 pair series 中最邻近的数据点
      const hoverX = Array.isArray(params.data) ? (params.data[0] as number) : 0
      const option = instance.getOption()
      const pairSeries = (option as any).series?.[pairSi] as { data?: Array<[number, number]> } | undefined
      const pairData = pairSeries?.data
      if (pairData && pairData.length > 0) {
        let nearestIdx = 0
        let minDist = Math.abs((pairData[0]?.[0] ?? 0) - hoverX)
        for (let i = 1; i < pairData.length; i++) {
          const dist = Math.abs((pairData[i]?.[0] ?? 0) - hoverX)
          if (dist < minDist) {
            minDist = dist
            nearestIdx = i
          }
        }
        instance.dispatchAction({ type: 'highlight', seriesIndex: pairSi, dataIndex: nearestIdx })
      }
    })

    instance.on('globalout', () => {
      instance.dispatchAction({ type: 'downplay' })
    })
  },
  { immediate: true },
)
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
          v-if="usesSampling"
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

        <div
          v-if="requiresXAxisField && availableXAxisOptions.length > 0"
          class="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-100 rounded-lg shadow-sm"
        >
          <span class="text-[10px] font-black text-slate-400 uppercase tracking-widest">X轴</span>
          <select
            v-model="xField"
            data-test="chart-x-field-select"
            class="chart-axis-select"
          >
            <option
              v-for="field in availableXAxisOptions"
              :key="field"
              :value="field"
            >
              {{ field }}
            </option>
          </select>
        </div>

        <div class="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-100 rounded-lg shadow-sm">
          <span class="text-[10px] font-black text-slate-400 uppercase tracking-widest">过滤</span>
          <InputNumber
            v-model="lowerBound"
            input-id="chart-lower-bound"
            class="filter-input w-24"
            :step="0.01"
            :max-fraction-digits="10"
            :use-grouping="false"
            placeholder="下限"
          />
          <span class="text-xs font-bold text-slate-300">~</span>
          <InputNumber
            v-model="upperBound"
            input-id="chart-upper-bound"
            class="filter-input w-24"
            :step="0.01"
            :max-fraction-digits="10"
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

        <div class="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-100 rounded-lg shadow-sm">
          <label
            data-test="chart-skip-invalid-label"
            class="chart-checkbox-label"
            :class="{ 'chart-checkbox-label--active': skipInvalidRows }"
          >
            <input
              data-test="chart-skip-invalid-checkbox"
              v-model="skipInvalidRows"
              type="checkbox"
              class="chart-checkbox-input"
            />
            <span class="text-[11px] font-bold text-slate-600 whitespace-nowrap">异常值过滤</span>
          </label>
          <HelpCircle
            data-test="chart-skip-invalid-help"
            v-tooltip.top="'开启后，折线图会按当前选中因子整行跳过异常样本；箱线图和正态分布仍按列单独忽略异常值。'"
            :size="13"
            class="chart-help-icon"
          />
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

    <div class="flex-1 p-4 relative min-h-0 overflow-hidden">
      <div class="h-full flex gap-4 min-h-0">
        <div
          data-test="chart-scroll-viewport"
          class="chart-scroll-viewport flex-1 min-w-0 min-h-0 overflow-y-auto overflow-x-hidden pr-2"
        >
          <div v-if="hasRenderableData" data-test="chart-host" class="h-full w-full relative" :style="chartHostStyle">
            <div
              v-if="boxplotToggleVisible"
              data-test="boxplot-whisker-mode-toggle"
              class="absolute right-3 top-3 z-10 flex items-center gap-1 rounded-xl border border-slate-200 bg-white/95 p-1 shadow-sm backdrop-blur"
            >
              <button
                v-for="modeOption in boxplotWhiskerModeOptions"
                :key="modeOption.value"
                :data-test="`boxplot-whisker-mode-${modeOption.value}`"
                class="boxplot-mode-button"
                :class="{ 'boxplot-mode-button--active': boxplotWhiskerMode === modeOption.value }"
                :data-state="boxplotWhiskerMode === modeOption.value ? 'active' : 'inactive'"
                type="button"
                @click="boxplotWhiskerMode = modeOption.value"
              >
                {{ modeOption.label }}
              </button>
            </div>
            <VChart ref="chartRef" :option="chartOption" :update-options="chartUpdateOptions" autoresize />
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

.chart-scroll-viewport {
  scrollbar-gutter: stable;
}

.chart-scroll-viewport::-webkit-scrollbar {
  width: 8px;
}

.chart-scroll-viewport::-webkit-scrollbar-track {
  background: #f8fafc;
  border-radius: 999px;
}

.chart-scroll-viewport::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  border-radius: 999px;
}

.chart-scroll-viewport::-webkit-scrollbar-thumb:hover {
  background: #94a3b8;
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

.chart-axis-select {
  min-width: 132px;
  max-width: 220px;
  padding: 4px 10px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: #f8fafc;
  color: #0f172a;
  font-size: 11px;
  font-weight: 700;
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

.boxplot-mode-button {
  border: none;
  border-radius: 10px;
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

.boxplot-mode-button--active {
  background: #0f172a;
  color: #ffffff;
  box-shadow: 0 8px 16px -14px rgba(15, 23, 42, 0.8);
}

.chart-checkbox-label {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  user-select: none;
}

.chart-checkbox-label--active span {
  color: #0f172a;
}

.chart-checkbox-input {
  width: 14px;
  height: 14px;
  margin: 0;
  accent-color: #2563eb;
  cursor: pointer;
}

.chart-help-icon {
  color: #94a3b8;
  cursor: help;
  flex-shrink: 0;
  transition: color 0.2s ease;
}

.chart-help-icon:hover {
  color: #2563eb;
}
</style>
