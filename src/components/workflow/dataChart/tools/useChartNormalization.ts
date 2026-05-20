import { computed, type Ref } from 'vue'
import type { ChartGroup, ChartRow, NormalizationMethod } from '../types'
import { buildNormalizationStats } from './normalization'

type UseChartNormalizationOptions = {
  isGroupedData: Ref<boolean>
  filteredData: Ref<ChartRow[] | ChartGroup[]>
  lineRenderableRows: Ref<ChartRow[]>
  chartType: Ref<string>
  skipInvalidRows: Ref<boolean>
  normalizedKeys: Ref<string[]>
  viewMode: Ref<'raw' | 'normalized'>
  normalizationMethod: Ref<NormalizationMethod>
}

export const useChartNormalization = ({
  isGroupedData,
  filteredData,
  lineRenderableRows,
  chartType,
  skipInvalidRows,
  normalizedKeys,
  viewMode,
}: UseChartNormalizationOptions) => {
  const supportsNormalization = computed(
    () =>
      normalizedKeys.value.length > 0 &&
      (
        chartType.value === 'line' ||
        chartType.value === 'scatter' ||
        chartType.value === 'bar' ||
        chartType.value === 'boxplot' ||
        chartType.value === 'normal'
      ),
  )

  const normalizationSourceRows = computed(() => {
    if (isGroupedData.value) {
      return (filteredData.value as ChartGroup[]).flatMap((group) => group.data ?? [])
    }

    if (chartType.value === 'line' && skipInvalidRows.value) {
      return lineRenderableRows.value
    }

    return filteredData.value as ChartRow[]
  })

  const normalizationStats = computed(() => {
    if (!supportsNormalization.value) return buildNormalizationStats([], [])
    return buildNormalizationStats(normalizationSourceRows.value, normalizedKeys.value)
  })

  const isNormalizedView = computed(
    () => supportsNormalization.value && viewMode.value === 'normalized',
  )

  return {
    supportsNormalization,
    normalizationStats,
    isNormalizedView,
  }
}
