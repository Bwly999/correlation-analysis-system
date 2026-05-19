import { computed, type Ref } from 'vue'
import type { ChartGroup, ChartRow } from '../types'
import { applyValueBoundsToGroups, applyValueBoundsToRows } from './filtering'

type UseChartFilteringOptions = {
  isGroupedData: Ref<boolean>
  groupedData: Ref<ChartGroup[]>
  tableRows: Ref<ChartRow[]>
  normalizedKeys: Ref<string[]>
  lowerBound: Ref<number | null>
  upperBound: Ref<number | null>
}

export const useChartFiltering = ({
  isGroupedData,
  groupedData,
  tableRows,
  normalizedKeys,
  lowerBound,
  upperBound,
}: UseChartFilteringOptions) => {
  const filteredData = computed(() => {
    if (isGroupedData.value) {
      return applyValueBoundsToGroups(
        groupedData.value,
        normalizedKeys.value,
        lowerBound.value,
        upperBound.value,
      )
    }

    return applyValueBoundsToRows(
      tableRows.value,
      normalizedKeys.value,
      lowerBound.value,
      upperBound.value,
    )
  })

  const filteredSummary = computed(() => {
    if (isGroupedData.value) {
      return (filteredData.value as ChartGroup[]).reduce((sum, group) => sum + group.data.length, 0)
    }

    return (filteredData.value as ChartRow[]).length
  })

  return {
    filteredData,
    filteredSummary,
  }
}
