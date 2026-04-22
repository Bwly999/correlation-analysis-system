import { computed, ref, watch, type ComputedRef, type Ref } from 'vue'
import type {
  ColDef,
  ColumnState,
  ColumnMovedEvent,
  ColumnResizedEvent,
  FilterChangedEvent,
  GridApi,
  SortChangedEvent,
  TooltipValueGetterFunc,
  ValueFormatterParams,
} from 'ag-grid-community'
import { useScopedResultPreviewStorage } from '../useScopedResultPreviewStorage'
import { getResultRows, getResultSchemaFields } from '../resultView'

type TableRow = Record<string, unknown>
type DensityMode = 'compact' | 'standard' | 'comfortable'
type PinnedState = 'left' | 'right' | undefined

interface UseTablePreviewGridModelOptions {
  data: Ref<unknown> | ComputedRef<unknown>
  storageScopeKey?: string
  defaultColumnWidth?: number
  minColumnWidth?: number
}

const DEFAULT_COLUMN_WIDTH = 160
const MIN_COLUMN_WIDTH = 72
const MAX_AUTO_WIDTH = 420

const DENSITY_CONFIG: Record<DensityMode, { rowHeight: number; headerHeight: number }> = {
  compact: { rowHeight: 30, headerHeight: 36 },
  standard: { rowHeight: 36, headerHeight: 42 },
  comfortable: { rowHeight: 44, headerHeight: 50 },
}

const formatCellValue = (value: unknown) => {
  if (value === null || value === undefined) return '-'
  return String(value)
}

const tooltipValueGetter: TooltipValueGetterFunc<TableRow> = (params) =>
  formatCellValue(params.value)

const inferFieldType = (rows: TableRow[], field: string) => {
  for (const row of rows) {
    const value = row[field]
    if (typeof value === 'number' && Number.isFinite(value)) return 'number'
    if (typeof value === 'boolean') return 'boolean'
    if (value !== null && value !== undefined) return 'string'
  }
  return 'string'
}

const matchesQuickFilter = (row: TableRow, query: string) => {
  if (!query) return true
  const normalized = query.trim().toLowerCase()
  if (!normalized) return true

  return Object.values(row).some((value) => formatCellValue(value).toLowerCase().includes(normalized))
}

const estimateContentWidth = (value: string) => {
  const doubleWidthChars = Array.from(value).reduce(
    (count, char) => count + (char.charCodeAt(0) > 255 ? 2 : 1),
    0,
  )
  return doubleWidthChars * 8 + 40
}

export const useTablePreviewGridModel = ({
  data,
  storageScopeKey,
  defaultColumnWidth = DEFAULT_COLUMN_WIDTH,
  minColumnWidth = MIN_COLUMN_WIDTH,
}: UseTablePreviewGridModelOptions) => {
  const columnWidths = useScopedResultPreviewStorage<Record<string, number | undefined>>(
    storageScopeKey,
    'table-column-widths',
    {},
  )
  const quickFilterText = ref('')
  const density = useScopedResultPreviewStorage<DensityMode>(storageScopeKey, 'table-density', 'standard')
  const hiddenFields = useScopedResultPreviewStorage<string[]>(storageScopeKey, 'table-hidden-fields', [])
  const pinnedFields = useScopedResultPreviewStorage<Record<string, PinnedState>>(
    storageScopeKey,
    'table-pinned-fields',
    {},
  )
  const columnOrder = useScopedResultPreviewStorage<string[]>(storageScopeKey, 'table-column-order', [])
  const sortModel = useScopedResultPreviewStorage<ColumnState[]>(storageScopeKey, 'table-sort-model', [])
  const filterModel = useScopedResultPreviewStorage<Record<string, unknown>>(storageScopeKey, 'table-filter-model', {})

  const rowData = computed<TableRow[]>(() => getResultRows(data.value) as TableRow[])
  const schemaFields = computed(() => getResultSchemaFields(data.value))
  const fieldNames = computed(() => {
    if (schemaFields.value.length > 0) return schemaFields.value.map((field) => field.name)

    const firstRow = rowData.value[0]
    return firstRow ? Object.keys(firstRow) : []
  })

  const fieldTypeMap = computed(() => {
    const schemaMap = new Map(schemaFields.value.map((field) => [field.name, field.type]))
    return fieldNames.value.reduce<Record<string, string>>((acc, field) => {
      acc[field] = schemaMap.get(field) ?? inferFieldType(rowData.value, field)
      return acc
    }, {})
  })

  const orderedFields = computed(() => {
    const nextOrder = columnOrder.value.filter((field) => fieldNames.value.includes(field))
    for (const field of fieldNames.value) {
      if (!nextOrder.includes(field)) nextOrder.push(field)
    }
    return nextOrder
  })

  const columnOptions = computed(() => fieldNames.value.map((field) => ({ name: field, value: field })))

  const visibleRowCount = computed(() =>
    rowData.value.filter((row) => matchesQuickFilter(row, quickFilterText.value)).length,
  )

  const defaultColDef: ColDef<TableRow> = {
    resizable: true,
    sortable: true,
    filter: true,
    floatingFilter: false,
    suppressHeaderMenuButton: false,
    minWidth: minColumnWidth,
  }

  const columnDefs = computed<ColDef<TableRow>[]>(() =>
    orderedFields.value.map((field) => ({
      field,
      headerName: field,
      width: columnWidths.value[field] ?? defaultColumnWidth,
      minWidth: minColumnWidth,
      hide: hiddenFields.value.includes(field),
      pinned: pinnedFields.value[field],
      suppressMovable: false,
      filter: fieldTypeMap.value[field] === 'number' ? 'agNumberColumnFilter' : true,
      valueFormatter: (params: ValueFormatterParams<TableRow>) => formatCellValue(params.value),
      tooltipValueGetter,
      headerTooltip: field,
    })),
  )

  const densityConfig = computed(() => DENSITY_CONFIG[density.value])

  watch(
    fieldNames,
    (fields) => {
      const fieldSet = new Set(fields)
      const nextHiddenFields = hiddenFields.value.filter((field) => fieldSet.has(field))
      if (nextHiddenFields.length !== hiddenFields.value.length) {
        hiddenFields.value = nextHiddenFields
      }

      const nextColumnOrder = columnOrder.value.filter((field) => fieldSet.has(field))
      if (nextColumnOrder.length !== columnOrder.value.length) {
        columnOrder.value = nextColumnOrder
      }

      const nextColumnWidths = Object.fromEntries(
        Object.entries(columnWidths.value).filter(([field]) => fieldSet.has(field)),
      )
      if (Object.keys(nextColumnWidths).length !== Object.keys(columnWidths.value).length) {
        columnWidths.value = nextColumnWidths
      }

      const nextPinnedFields = Object.fromEntries(
        Object.entries(pinnedFields.value).filter(([field]) => fieldSet.has(field)),
      )
      if (Object.keys(nextPinnedFields).length !== Object.keys(pinnedFields.value).length) {
        pinnedFields.value = nextPinnedFields
      }

      const nextSortModel = sortModel.value.filter((state) => fieldSet.has(String(state.colId ?? '')))
      if (nextSortModel.length !== sortModel.value.length) {
        sortModel.value = nextSortModel
      }

      const nextFilterModel = Object.fromEntries(
        Object.entries(filterModel.value).filter(([field]) => fieldSet.has(field)),
      )
      if (Object.keys(nextFilterModel).length !== Object.keys(filterModel.value).length) {
        filterModel.value = nextFilterModel
      }
    },
    { immediate: true },
  )

  const setQuickFilterText = (value: string) => {
    quickFilterText.value = value
  }

  const setDensity = (value: DensityMode) => {
    density.value = value
  }

  const toggleFieldVisibility = (field: string) => {
    setFieldVisibility(field, hiddenFields.value.includes(field))
  }

  const setFieldPinned = (field: string, pinned: PinnedState) => {
    pinnedFields.value = {
      ...pinnedFields.value,
      [field]: pinned,
    }
  }

  const setFieldVisibility = (field: string, visible: boolean) => {
    hiddenFields.value = visible
      ? hiddenFields.value.filter((item) => item !== field)
      : [...hiddenFields.value.filter((item) => item !== field), field]
  }

  const isFieldVisible = (field: string) => !hiddenFields.value.includes(field)

  const getFieldPinned = (field: string) => pinnedFields.value[field]

  const applyWidthToFields = (fields: string[], width: number | null) => {
    if (!Number.isFinite(width) || !width || width <= 0) return
    const next = { ...columnWidths.value }
    for (const field of fields) {
      next[field] = width
    }
    columnWidths.value = next
  }

  const estimateFieldWidth = (field: string) => {
    const samples = rowData.value.slice(0, 200)
    let nextWidth = estimateContentWidth(field)
    for (const row of samples) {
      nextWidth = Math.max(nextWidth, estimateContentWidth(formatCellValue(row[field])))
    }
    return Math.min(Math.max(nextWidth, minColumnWidth), MAX_AUTO_WIDTH)
  }

  const syncColumnWidthsFromGrid = (fields: string[], api: GridApi<TableRow>) => {
    const next = { ...columnWidths.value }
    for (const field of fields) {
      const column = api.getColumn(field)
      const width = column?.getActualWidth()
      if (width && Number.isFinite(width)) {
        next[field] = width
      }
    }
    columnWidths.value = next
  }

  const autoSizeField = (field: string, api?: GridApi<TableRow> | null) => {
    if (api?.autoSizeColumns) {
      api.autoSizeColumns([field], false)
      syncColumnWidthsFromGrid([field], api)
      return
    }
    applyWidthToFields([field], estimateFieldWidth(field))
  }

  const autoSizeAllFields = (api?: GridApi<TableRow> | null) => {
    const fields = orderedFields.value.filter((field) => isFieldVisible(field))
    if (!fields.length) return

    if (api?.autoSizeAllColumns) {
      api.autoSizeAllColumns(false)
      syncColumnWidthsFromGrid(fields, api)
      return
    }

    const next = { ...columnWidths.value }
    for (const field of fields) {
      next[field] = estimateFieldWidth(field)
    }
    columnWidths.value = next
  }

  const resetColumnWidths = () => {
    columnWidths.value = {}
  }

  const resetView = () => {
    quickFilterText.value = ''
    density.value = 'standard'
    hiddenFields.value = []
    pinnedFields.value = {}
    columnWidths.value = {}
    columnOrder.value = fieldNames.value.slice()
  }

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

  const handleColumnMoved = (event: ColumnMovedEvent<TableRow>) => {
    if (!event.finished || !event.api) return

    const nextOrder = event.api
      .getAllGridColumns()
      ?.map((column) => column.getColId())
      .filter((field): field is string => Boolean(field))

    if (!nextOrder?.length) return
    columnOrder.value = nextOrder
  }

  const handleSortChanged = (event: SortChangedEvent<TableRow>) => {
    const nextSortModel =
      event.api
        .getColumnState()
        ?.filter((state) => state.sort === 'asc' || state.sort === 'desc')
        .map((state) => ({
          colId: state.colId,
          sort: state.sort,
          sortIndex: state.sortIndex,
        })) ?? []

    sortModel.value = nextSortModel
  }

  const handleFilterChanged = (event: FilterChangedEvent<TableRow>) => {
    filterModel.value = { ...(event.api.getFilterModel() ?? {}) }
  }

  const applyPersistedGridState = (api: GridApi<TableRow>) => {
    if (sortModel.value.length > 0) {
      api.applyColumnState({
        state: sortModel.value,
        defaultState: { sort: null },
      })
    }

    if (Object.keys(filterModel.value).length > 0) {
      api.setFilterModel(filterModel.value)
    }
  }

  return {
    rowData,
    fieldNames,
    columnOptions,
    columnDefs,
    defaultColDef,
    quickFilterText,
    density,
    densityConfig,
    visibleRowCount,
    fieldCount: computed(() => fieldNames.value.length),
    setQuickFilterText,
    setDensity,
    toggleFieldVisibility,
    setFieldVisibility,
    isFieldVisible,
    setFieldPinned,
    getFieldPinned,
    applyWidthToFields,
    autoSizeField,
    autoSizeAllFields,
    resetColumnWidths,
    resetView,
    handleColumnResized,
    handleColumnMoved,
    handleSortChanged,
    handleFilterChanged,
    applyPersistedGridState,
  }
}
