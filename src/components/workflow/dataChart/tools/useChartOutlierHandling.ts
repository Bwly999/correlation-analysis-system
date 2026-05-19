import { computed, type Ref } from 'vue'
import type { ChartRow } from '../types'
import { filterInvalidLineRows } from './outlierHandling'

type UseChartOutlierHandlingOptions = {
  isGroupedData: Ref<boolean>
  chartType: Ref<string>
  skipInvalidRows: Ref<boolean>
  filteredRows: Ref<ChartRow[]>
  normalizedKeys: Ref<string[]>
}

export const useChartOutlierHandling = ({
  isGroupedData,
  chartType,
  skipInvalidRows,
  filteredRows,
  normalizedKeys,
}: UseChartOutlierHandlingOptions) => {
  const lineRenderableRows = computed(() => {
    if (isGroupedData.value || chartType.value !== 'line' || !skipInvalidRows.value) {
      return filteredRows.value
    }

    return filterInvalidLineRows(filteredRows.value, normalizedKeys.value)
  })

  return {
    lineRenderableRows,
  }
}
