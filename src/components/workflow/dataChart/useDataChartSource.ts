import { computed } from 'vue'
import { getCommonNumericFieldsFromGroups } from '../groupedResultSchema'
import {
  getResultGroups,
  getResultPreviewChartDefaults,
  getResultRows,
  getResultSchemaFields,
} from '../resultView'
import { getRenderableNumericFieldsFromRows } from './tools/filtering'
import type { ChartGroup, ChartType, ChartRow } from './types'

type UseDataChartSourceOptions = {
  data: unknown
  chartType: () => ChartType
}

export const useDataChartSource = ({ data, chartType }: UseDataChartSourceOptions) => {
  const groupedData = computed<ChartGroup[]>(() => getResultGroups(data) as ChartGroup[])
  const tableRows = computed<ChartRow[]>(() => getResultRows(data) as ChartRow[])
  const isGroupedData = computed(() => groupedData.value.length > 0)
  const hasRenderableData = computed(() => groupedData.value.length > 0 || tableRows.value.length > 0)
  const schemaFields = computed(() => getResultSchemaFields(data))

  const availableKeys = computed(() => {
    if (!hasRenderableData.value) return []

    if (isGroupedData.value) {
      return getCommonNumericFieldsFromGroups(groupedData.value)
    }

    return getRenderableNumericFieldsFromRows(tableRows.value, schemaFields.value)
  })

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
      if (chartType() === 'grouped-scatter') return availableKeys.value
      return []
    }

    if (chartType() === 'scatter') return availableKeys.value
    if (chartType() === 'bar') return allFieldNames.value
    return []
  })

  const previewChartDefaults = computed(() => getResultPreviewChartDefaults(data))

  return {
    groupedData,
    tableRows,
    isGroupedData,
    hasRenderableData,
    schemaFields,
    availableKeys,
    allFieldNames,
    categoricalFieldNames,
    availableXAxisOptions,
    previewChartDefaults,
  }
}
