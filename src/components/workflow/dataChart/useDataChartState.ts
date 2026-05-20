import { computed, shallowRef, watch } from 'vue'
import type { BoxplotWhiskerMode } from '@/utils/stats'
import { buildScopedResultPreviewStorageKey, useScopedResultPreviewStorage } from '../useScopedResultPreviewStorage'
import type {
  ChartFilterPreset,
  ChartNumericExtent,
  ChartType,
  ChartYZoomRange,
  GroupedChartType,
  NormalizationMethod,
  TableChartType,
} from './types'
import { GROUPED_CHART_TYPES, TABLE_CHART_TYPES } from './constants'

const isGroupedChartType = (value: string): value is GroupedChartType =>
  GROUPED_CHART_TYPES.includes(value as GroupedChartType)

const isTableChartType = (value: string): value is TableChartType =>
  TABLE_CHART_TYPES.includes(value as TableChartType)

const clampZoomStop = (value: number) => Math.min(100, Math.max(0, Math.round(value)))
const normalizeZoomRange = (value: ChartYZoomRange): ChartYZoomRange => {
  const start = clampZoomStop(value[0] ?? 0)
  const end = clampZoomStop(value[1] ?? 100)

  if (start === end) {
    if (end >= 100) return [Math.max(0, end - 1), end]
    return [start, Math.min(100, start + 1)]
  }

  return start < end ? [start, end] : [end, start]
}

const supportsVerticalZoom = (chartType: ChartType) => chartType !== 'normal'

const normalizeOptionalNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null
  const numericValue = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(numericValue) ? numericValue : null
}

export const normalizeLegacyTableChartType = (value: string): TableChartType | null => {
  if (value === 'histogram') return 'normal'
  return isTableChartType(value) ? value : null
}

const hasStoredScopedSlice = (storageScopeKey: string | undefined, slice: string) => {
  const storageKey = buildScopedResultPreviewStorageKey(storageScopeKey, slice)
  if (!storageKey || typeof window === 'undefined') return false
  return window.localStorage.getItem(storageKey) !== null
}

const readStoredScopedSlice = <T>(storageScopeKey: string | undefined, slice: string, fallback: T): T => {
  const storageKey = buildScopedResultPreviewStorageKey(storageScopeKey, slice)
  if (!storageKey || typeof window === 'undefined') return fallback

  const storedValue = window.localStorage.getItem(storageKey)
  if (storedValue === null) return fallback

  try {
    return JSON.parse(storedValue) as T
  } catch {
    return storedValue as T
  }
}

type UseDataChartStateOptions = {
  storageScopeKey?: string
  isGroupedData: () => boolean
  hasRenderableData: () => boolean
  availableKeys: () => string[]
  allFieldNames: () => string[]
  availableXAxisOptions: () => string[]
  previewChartDefaults: () => { mode: string; xField?: string; yFields?: string[] } | null
}

export const useDataChartState = ({
  storageScopeKey,
  isGroupedData,
  hasRenderableData,
  availableKeys,
  availableXAxisOptions,
  previewChartDefaults,
}: UseDataChartStateOptions) => {
  const hadStoredChartTypeAtMount = hasStoredScopedSlice(storageScopeKey, 'chart-type')
  const hadStoredSelectedKeysAtMount = hasStoredScopedSlice(storageScopeKey, 'chart-selected-keys')
  const hadStoredXAxisFieldAtMount = hasStoredScopedSlice(storageScopeKey, 'chart-x-field')

  const chartType = useScopedResultPreviewStorage<ChartType>(storageScopeKey, 'chart-type', 'line')
  const maxPoints = useScopedResultPreviewStorage(storageScopeKey, 'chart-max-points', 5000)
  const selectedKeys = useScopedResultPreviewStorage<string[]>(storageScopeKey, 'chart-selected-keys', [])
  const xField = useScopedResultPreviewStorage<string | null>(storageScopeKey, 'chart-x-field', null)
  const lowerBound = useScopedResultPreviewStorage<number | null>(storageScopeKey, 'chart-lower-bound', null)
  const upperBound = useScopedResultPreviewStorage<number | null>(storageScopeKey, 'chart-upper-bound', null)
  const viewMode = useScopedResultPreviewStorage<'raw' | 'normalized'>(storageScopeKey, 'chart-view-mode', 'raw')
  const normalizationMethod = useScopedResultPreviewStorage<NormalizationMethod>(
    storageScopeKey,
    'chart-normalization-method',
    'min-max',
  )
  const skipInvalidRows = useScopedResultPreviewStorage(storageScopeKey, 'chart-skip-invalid-rows', false)
  const boxplotWhiskerMode = useScopedResultPreviewStorage<BoxplotWhiskerMode>(
    storageScopeKey,
    'chart-boxplot-whisker-mode',
    'iqr',
  )
  const isPresetPanelOpen = shallowRef(false)
  const presetNameInput = shallowRef('')
  const selectedPresetId = useScopedResultPreviewStorage<string | null>(storageScopeKey, 'chart-selected-preset', null)
  const savedPresets = useScopedResultPreviewStorage<ChartFilterPreset[]>(storageScopeKey, 'chart-saved-presets', [])
  const defaultPresetId = useScopedResultPreviewStorage<string | 'none' | null>(
    storageScopeKey,
    'chart-default-preset',
    null,
  )
  const yZoomEnabled = shallowRef(readStoredScopedSlice(storageScopeKey, 'chart-y-zoom-enabled', false))
  const yZoomRange = shallowRef<ChartYZoomRange>(readStoredScopedSlice(storageScopeKey, 'chart-y-zoom-range', [0, 100]))
  const yZoomBaseExtent = shallowRef<ChartNumericExtent | null>(null)
  const hasAppliedInitialChartState = shallowRef(false)

  const hasAnyStoredChartState = () =>
    hadStoredChartTypeAtMount || hadStoredSelectedKeysAtMount || hadStoredXAxisFieldAtMount

  const resolveInitialChartState = () => {
    const numericKeys = availableKeys()
    const firstNumericKey = numericKeys[0] ?? null
    const defaults = previewChartDefaults()

    if (defaults) {
      if (isGroupedData()) {
        const previewMode = defaults.mode
        if (isGroupedChartType(previewMode)) {
          const resolvedYFields = (defaults.yFields ?? []).filter((field) => numericKeys.includes(field))
          return {
            chartType: previewMode as ChartType,
            selectedKeys:
              resolvedYFields.length > 0
                ? [resolvedYFields[0]!]
                : firstNumericKey
                  ? [firstNumericKey]
                  : [],
            xField: defaults.xField?.length ? defaults.xField : null,
          }
        }
      } else {
        const previewMode = normalizeLegacyTableChartType(defaults.mode)
        if (previewMode) {
          const resolvedYFields = (defaults.yFields ?? []).filter((field) => numericKeys.includes(field))
          return {
            chartType: previewMode,
            selectedKeys:
              resolvedYFields.length > 0
                ? previewMode === 'line' || previewMode === 'boxplot' || previewMode === 'normal'
                  ? resolvedYFields
                  : [resolvedYFields[0]!]
                : firstNumericKey
                  ? [firstNumericKey]
                  : [],
            xField: defaults.xField?.length ? defaults.xField : null,
          }
        }
      }
    }

    if (isGroupedData()) {
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
    if (hasAppliedInitialChartState.value || !hasRenderableData()) return

    if (!hasAnyStoredChartState()) {
      const initialState = resolveInitialChartState()
      chartType.value = initialState.chartType
      selectedKeys.value = initialState.selectedKeys
      xField.value = initialState.xField
    }

    hasAppliedInitialChartState.value = true
  }

  watch(
    () => isGroupedData(),
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

  watch(
    () => [hasRenderableData(), availableKeys().join('|')] as const,
    () => {
      applyInitialChartState()
    },
    { immediate: true },
  )

  watch(
    () => availableKeys(),
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

  const showsXAxisFieldSelector = computed(() =>
    chartType.value === 'scatter' || chartType.value === 'bar' || chartType.value === 'grouped-scatter',
  )

  watch(
    () => [availableXAxisOptions(), showsXAxisFieldSelector.value] as const,
    ([nextXAxisOptions, nextShowsXAxisFieldSelector]) => {
      if (!nextShowsXAxisFieldSelector || nextXAxisOptions.length === 0) {
        if (!nextShowsXAxisFieldSelector) xField.value = null
        return
      }

      if (xField.value && !nextXAxisOptions.includes(xField.value)) {
        xField.value = null
      }
    },
    { immediate: true },
  )

  watch(xField, (value) => {
    if (value === 'null' || value === 'undefined' || value === '') {
      xField.value = null
      return
    }
    const storageKey = buildScopedResultPreviewStorageKey(storageScopeKey, 'chart-x-field')
    if (!storageKey || typeof window === 'undefined') return
    window.localStorage.setItem(storageKey, JSON.stringify(value))
  }, { immediate: true })

  watch(
    maxPoints,
    (value) => {
      const normalized = Number.isFinite(value) ? Math.min(50000, Math.max(100, Math.round(value))) : 5000
      if (normalized !== value) maxPoints.value = normalized
    },
    { immediate: true },
  )

  watch(viewMode, (value) => {
    if (value !== 'raw' && value !== 'normalized') viewMode.value = 'raw'
  }, { immediate: true })

  watch(normalizationMethod, (value) => {
    if (value !== 'min-max' && value !== 'z-score') normalizationMethod.value = 'min-max'
  }, { immediate: true })

  watch(boxplotWhiskerMode, (value) => {
    if (value !== 'iqr' && value !== 'percentile') boxplotWhiskerMode.value = 'iqr'
  }, { immediate: true })

  watch(skipInvalidRows, (value) => {
    if (typeof value !== 'boolean') skipInvalidRows.value = false
  }, { immediate: true })

  watch(lowerBound, (value) => {
    const normalized = normalizeOptionalNumber(value)
    if (normalized !== value) lowerBound.value = normalized
  }, { immediate: true })

  watch(upperBound, (value) => {
    const normalized = normalizeOptionalNumber(value)
    if (normalized !== value) upperBound.value = normalized
  }, { immediate: true })

  watch(yZoomRange, (value) => {
    if (!Array.isArray(value) || value.length !== 2) {
      yZoomRange.value = [0, 100]
      return
    }

    const normalized = normalizeZoomRange(value)
    if (normalized[0] !== value[0] || normalized[1] !== value[1]) {
      yZoomRange.value = normalized
    }
  }, { immediate: true, deep: true })

  watch(yZoomEnabled, (value) => {
    if (typeof value !== 'boolean') yZoomEnabled.value = false
  }, { immediate: true })

  watch([yZoomEnabled, yZoomRange], ([enabled, range]) => {
    const enabledStorageKey = buildScopedResultPreviewStorageKey(storageScopeKey, 'chart-y-zoom-enabled')
    const rangeStorageKey = buildScopedResultPreviewStorageKey(storageScopeKey, 'chart-y-zoom-range')
    if (!enabledStorageKey || !rangeStorageKey || typeof window === 'undefined') return

    const isDefaultRange = range[0] === 0 && range[1] === 100
    if (!enabled && isDefaultRange) {
      window.localStorage.removeItem(enabledStorageKey)
      window.localStorage.removeItem(rangeStorageKey)
      return
    }

    window.localStorage.setItem(enabledStorageKey, JSON.stringify(enabled))
    window.localStorage.setItem(rangeStorageKey, JSON.stringify(range))
  }, { immediate: true, deep: true })

  watch(chartType, (value) => {
    if (supportsVerticalZoom(value)) return
    if (yZoomEnabled.value) yZoomEnabled.value = false
    if (yZoomRange.value[0] !== 0 || yZoomRange.value[1] !== 100) {
      yZoomRange.value = [0, 100]
    }
  }, { immediate: true })

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

  watch(defaultPresetId, (value) => {
    if (value === 'none' || value === null) return
    if (!savedPresets.value.some((preset) => preset.id === value)) {
      defaultPresetId.value = null
    }
  }, { immediate: true })

  watch(selectedPresetId, (value) => {
    if (value === null) return
    if (!savedPresets.value.some((preset) => preset.id === value)) {
      selectedPresetId.value = null
    }
  }, { immediate: true })

  return {
    chartType,
    maxPoints,
    selectedKeys,
    xField,
    lowerBound,
    upperBound,
    viewMode,
    normalizationMethod,
    skipInvalidRows,
    boxplotWhiskerMode,
    isPresetPanelOpen,
    presetNameInput,
    selectedPresetId,
    savedPresets,
    defaultPresetId,
    yZoomEnabled,
    yZoomRange,
    yZoomBaseExtent,
    showsXAxisFieldSelector,
  }
}
