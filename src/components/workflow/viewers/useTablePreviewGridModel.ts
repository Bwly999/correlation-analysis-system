import { computed, ref, type ComputedRef, type Ref } from 'vue'
import type {
  ColDef,
  ColumnResizedEvent,
  TooltipValueGetterFunc,
  ValueFormatterParams,
} from 'ag-grid-community'
import { getResultRows, getResultSchemaFields } from '../resultView'

type TableRow = Record<string, unknown>

interface UseTablePreviewGridModelOptions {
  data: Ref<unknown> | ComputedRef<unknown>
  defaultColumnWidth?: number
  minColumnWidth?: number
}

const DEFAULT_COLUMN_WIDTH = 160
const MIN_COLUMN_WIDTH = 72

const formatCellValue = (value: unknown) => {
  if (value === null || value === undefined) return '-'
  return String(value)
}

const tooltipValueGetter: TooltipValueGetterFunc<TableRow> = (params) =>
  formatCellValue(params.value)

export const useTablePreviewGridModel = ({
  data,
  defaultColumnWidth = DEFAULT_COLUMN_WIDTH,
  minColumnWidth = MIN_COLUMN_WIDTH,
}: UseTablePreviewGridModelOptions) => {
  const columnWidths = ref<Record<string, number | undefined>>({})

  const rowData = computed<TableRow[]>(() => getResultRows(data.value) as TableRow[])
  const fieldNames = computed(() => {
    const schemaFields = getResultSchemaFields(data.value)
    if (schemaFields.length > 0) return schemaFields.map((field) => field.name)

    const firstRow = rowData.value[0]
    return firstRow ? Object.keys(firstRow) : []
  })

  const defaultColDef: ColDef<TableRow> = {
    resizable: true,
    sortable: false,
    filter: false,
    suppressHeaderMenuButton: true,
    minWidth: minColumnWidth,
  }

  const columnDefs = computed<ColDef<TableRow>[]>(() =>
    fieldNames.value.map((field) => ({
      field,
      headerName: field,
      width: columnWidths.value[field] ?? defaultColumnWidth,
      minWidth: minColumnWidth,
      valueFormatter: (params: ValueFormatterParams<TableRow>) => formatCellValue(params.value),
      tooltipValueGetter,
      headerTooltip: field,
    })),
  )

  const handleColumnResized = (event: ColumnResizedEvent<TableRow>) => {
    if (!event.finished || !event.column) return

    const field = event.column.getColId()
    const width = event.column.getActualWidth()
    if (!field || !width) return

    columnWidths.value = {
      ...columnWidths.value,
      [field]: width,
    }
  }

  return {
    rowData,
    fieldNames,
    columnDefs,
    defaultColDef,
    rowCount: computed(() => rowData.value.length),
    fieldCount: computed(() => fieldNames.value.length),
    handleColumnResized,
  }
}
