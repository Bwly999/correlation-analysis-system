<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, type ComponentPublicInstance } from 'vue'
import { watchDebounced } from '@vueuse/core'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Button from 'primevue/button'
import InputNumber from 'primevue/inputnumber'
import MultiSelect from 'primevue/multiselect'
import { RotateCcw, Settings2 } from 'lucide-vue-next'
import { getResultRows, getResultSchemaFields } from '../resultView'
import { useTablePreviewLayout } from './useTablePreviewLayout'

const props = defineProps<{
  data: unknown
}>()

const PAGE_SIZE_OPTIONS = [20, 50, 100]
const DEFAULT_COLUMN_WIDTH = 160
const WIDTH_APPLY_DEBOUNCE_MS = 120

const rows = computed(() => getResultRows(props.data))
const fields = computed(() => {
  const schemaFields = getResultSchemaFields(props.data)
  if (schemaFields.length > 0) return schemaFields.map((field) => field.name)

  const firstRow = rows.value[0]
  return firstRow ? Object.keys(firstRow) : []
})

const firstFieldName = computed(() => fields.value[0])
const columnOptions = computed(() => fields.value.map((field) => ({ name: field, value: field })))

const pageSize = defineModel<number>('pageSize', { default: 50 })
const currentPage = defineModel<number>('page', { default: 1 })
const {
  columnWidths,
  headerRowHeight,
  selectedFields,
  pendingWidth,
  isWidthPanelOpen,
  setColumnWidth,
  applyWidthToFields,
  resetColumnWidths,
  openWidthPanel,
  closeWidthPanel,
} = useTablePreviewLayout()

const totalPages = computed(() => {
  const size = Math.max(1, pageSize.value)
  return Math.max(1, Math.ceil(rows.value.length / size))
})

const pagedRows = computed(() => {
  const size = Math.max(1, pageSize.value)
  const safePage = Math.min(Math.max(1, currentPage.value), totalPages.value)
  const start = (safePage - 1) * size
  return rows.value.slice(start, start + size)
})

const pageStart = computed(() => {
  if (rows.value.length === 0) return 0
  return (Math.min(Math.max(1, currentPage.value), totalPages.value) - 1) * Math.max(1, pageSize.value) + 1
})

const pageEnd = computed(() => {
  if (rows.value.length === 0) return 0
  return Math.min(pageStart.value + pagedRows.value.length - 1, rows.value.length)
})

const goToPrevPage = () => {
  currentPage.value = Math.max(1, currentPage.value - 1)
}

const goToNextPage = () => {
  currentPage.value = Math.min(totalPages.value, currentPage.value + 1)
}

const updatePageSize = (event: Event) => {
  const value = Number((event.target as HTMLSelectElement).value)
  pageSize.value = PAGE_SIZE_OPTIONS.includes(value) ? value : 50
  currentPage.value = 1
}

const getCellDisplayValue = (row: Record<string, unknown>, field: string) => {
  const value = row[field]
  return value === null || value === undefined ? '-' : value
}

const shouldAttachRowDataTest = (field: string) => field === firstFieldName.value

const toggleWidthPanel = () => {
  if (isWidthPanelOpen.value) {
    closeWidthPanel()
    return
  }

  openWidthPanel()
}

const tableRenderKey = ref(0)

const resetAllColumnWidths = () => {
  resetColumnWidths()
  tableRenderKey.value += 1
}

const getColumnWidthValue = (field: string) => columnWidths.value[field]

const getColumnWidthStyle = (field: string) => {
  const width = getColumnWidthValue(field)
  if (!width) return undefined

  const pxWidth = `${width}px`
  return {
    width: pxWidth,
    maxWidth: pxWidth,
  }
}

const getColumnHorizontalPadding = (field: string) => {
  const width = getColumnWidthValue(field)

  if (!width) return 16
  if (width <= 40) return 2
  if (width <= 64) return 6
  if (width <= 96) return 10
  return 16
}

const getHeaderCellStyle = (field: string) => ({
  height: `${headerRowHeight.value}px`,
  paddingLeft: `${getColumnHorizontalPadding(field)}px`,
  paddingRight: `${getColumnHorizontalPadding(field)}px`,
})

const getBodyCellStyle = (field: string) => ({
  paddingLeft: `${getColumnHorizontalPadding(field)}px`,
  paddingRight: `${getColumnHorizontalPadding(field)}px`,
})

const tableContentWidth = computed(() => {
  const totalWidth = fields.value.reduce(
    (sum, field) => sum + (getColumnWidthValue(field) ?? DEFAULT_COLUMN_WIDTH),
    0,
  )

  return `${Math.max(totalWidth, DEFAULT_COLUMN_WIDTH)}px`
})

const headerLabelElements = new Map<string, HTMLElement>()
const headerTooltipEnabledByField = ref<Record<string, boolean>>({})
const widthPanelContainer = ref<HTMLElement | null>(null)

const setHeaderLabelRef = (
  field: string,
  element: Element | ComponentPublicInstance | null,
) => {
  if (element instanceof HTMLElement) {
    headerLabelElements.set(field, element)
    return
  }

  headerLabelElements.delete(field)
}

const syncHeaderTooltipEnabledState = () => {
  const nextState: Record<string, boolean> = {}
  let changed = fields.value.length !== Object.keys(headerTooltipEnabledByField.value).length

  for (const field of fields.value) {
    const headerElement = headerLabelElements.get(field)
    const isOverflow = Boolean(
      headerElement && headerElement.scrollWidth > headerElement.clientWidth,
    )
    nextState[field] = isOverflow
    if (!changed && headerTooltipEnabledByField.value[field] !== isOverflow) {
      changed = true
    }
  }

  if (changed) {
    headerTooltipEnabledByField.value = nextState
  }
}

const refreshHeaderTooltipEnabledState = () => {
  void nextTick(syncHeaderTooltipEnabledState)
}

const isHeaderTooltipEnabled = (field: string) =>
  headerTooltipEnabledByField.value[field] === true

const headerResizeStartY = ref<number | null>(null)
const headerResizeStartHeight = ref(48)

const stopHeaderResize = () => {
  headerResizeStartY.value = null
}

const onHeaderResizeMouseMove = (event: MouseEvent) => {
  if (headerResizeStartY.value === null) return
  const deltaY = event.clientY - headerResizeStartY.value
  headerRowHeight.value = Math.max(40, headerResizeStartHeight.value + deltaY)
}

const onHeaderResizeMouseUp = () => {
  stopHeaderResize()
}

const startHeaderResize = (event: MouseEvent) => {
  event.preventDefault()
  headerResizeStartY.value = event.clientY
  headerResizeStartHeight.value = headerRowHeight.value
}

const syncResizedColumnWidth = (event: { element?: HTMLElement }) => {
  const headerCell = event.element
  if (!headerCell) return

  const field = headerCell.querySelector<HTMLElement>('[data-column-field]')?.dataset.columnField
  if (!field) return

  const width = Math.round(headerCell.getBoundingClientRect().width)
  setColumnWidth(field, width)
}

const onDocumentMouseDown = (event: MouseEvent) => {
  if (!isWidthPanelOpen.value) return

  const target = event.target
  if (!(target instanceof Node)) return

  if (widthPanelContainer.value?.contains(target)) return
  closeWidthPanel()
}

watch([fields, columnWidths], refreshHeaderTooltipEnabledState, {
  deep: true,
  immediate: true,
})

watchDebounced(
  [selectedFields, pendingWidth],
  () => {
    applyWidthToFields()
  },
  {
    debounce: WIDTH_APPLY_DEBOUNCE_MS,
    maxWait: WIDTH_APPLY_DEBOUNCE_MS * 2,
  },
)

onMounted(() => {
  window.addEventListener('resize', refreshHeaderTooltipEnabledState)
  window.addEventListener('mousemove', onHeaderResizeMouseMove)
  window.addEventListener('mouseup', onHeaderResizeMouseUp)
  document.addEventListener('mousedown', onDocumentMouseDown)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', refreshHeaderTooltipEnabledState)
  window.removeEventListener('mousemove', onHeaderResizeMouseMove)
  window.removeEventListener('mouseup', onHeaderResizeMouseUp)
  document.removeEventListener('mousedown', onDocumentMouseDown)
})
</script>

<template>
  <div class="h-full w-full p-4">
    <div class="h-full w-full bg-white rounded-xl border border-slate-200 overflow-hidden flex flex-col">
      <div
        v-if="rows.length === 0"
        class="h-full flex items-center justify-center text-sm font-medium text-slate-400"
      >
        暂无表格结果
      </div>
      <template v-else>
        <div class="px-4 py-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between gap-3">
          <div class="flex items-center gap-3">
            <div ref="widthPanelContainer" class="relative flex items-start">
              <Button
                data-test="table-width-panel-toggle"
                aria-label="设置列宽"
                title="设置列宽"
                rounded
                outlined
                severity="secondary"
                size="small"
                @click="toggleWidthPanel"
              >
                <Settings2 :size="14" />
              </Button>
              <div
                v-if="isWidthPanelOpen"
                data-test="table-width-panel"
                class="table-width-panel absolute left-full top-0 z-20 ml-2 w-[320px] rounded-xl border border-slate-200 bg-white p-3 shadow-xl"
              >
                <div class="text-xs font-bold text-slate-500">批量列宽设置</div>
                <div class="mt-2">
                  <MultiSelect
                    v-model="selectedFields"
                    data-test="table-column-select"
                    :options="columnOptions"
                    option-label="name"
                    option-value="value"
                    :filter="true"
                    appendTo="self"
                    display="chip"
                    placeholder="搜索并选择列名"
                    class="table-width-multiselect w-full"
                  />
                </div>
                <div class="mt-3">
                  <div class="table-width-input-row">
                    <span class="table-width-input-label">列宽</span>
                    <InputNumber
                      v-model="pendingWidth"
                      input-id="table-width-input"
                      :min="1"
                      :step="10"
                      :use-grouping="false"
                      showButtons
                      buttonLayout="stacked"
                      inputClass="table-width-input-control"
                      :inputStyle="{
                        color: '#0f172a',
                        caretColor: '#0f172a',
                        background: '#ffffff',
                      }"
                      fluid
                    />
                    <span class="table-width-input-unit">px</span>
                  </div>
                </div>
                <div class="mt-3 flex items-center justify-end">
                  <Button
                    data-test="table-reset-widths"
                    aria-label="重置列宽"
                    title="重置列宽"
                    rounded
                    outlined
                    severity="secondary"
                    size="small"
                    @click="resetAllColumnWidths"
                  >
                    <RotateCcw :size="14" />
                  </Button>
                </div>
              </div>
            </div>
            <div class="text-xs font-bold text-slate-500">
              当前显示第 {{ pageStart }} - {{ pageEnd }} 条，共 {{ rows.length }} 条
            </div>
          </div>
          <div class="flex items-center gap-2">
            <label class="text-xs font-bold text-slate-400" for="table-page-size">每页</label>
            <select
              id="table-page-size"
              data-test="table-page-size"
              class="table-pagination-select"
              :value="pageSize"
              @change="updatePageSize"
            >
              <option v-for="size in PAGE_SIZE_OPTIONS" :key="size" :value="size">{{ size }}</option>
            </select>
          </div>
        </div>
        <div class="flex-1 overflow-auto custom-scrollbar">
          <div
            data-test="table-scroll-content"
            class="min-w-full align-top"
            :style="{ width: tableContentWidth }"
          >
            <DataTable
              :key="tableRenderKey"
              :value="pagedRows"
              class="w-full text-sm text-slate-700"
              resizableColumns
              columnResizeMode="expand"
              :table-style="{ width: tableContentWidth, minWidth: tableContentWidth, tableLayout: 'fixed' }"
              @column-resize-end="syncResizedColumnWidth"
            >
              <Column
                v-for="field in fields"
                :key="field"
                :field="field"
                :style="getColumnWidthStyle(field)"
                headerClass="border-b border-slate-200"
              >
                <template #header>
                  <div
                    :ref="(element) => setHeaderLabelRef(field, element)"
                    :data-test="`table-column-header-${field}`"
                    :data-column-field="field"
                    :data-column-width="getColumnWidthValue(field)?.toString()"
                    :data-tooltip-enabled="isHeaderTooltipEnabled(field) ? 'true' : 'false'"
                    v-tooltip.top="isHeaderTooltipEnabled(field) ? field : undefined"
                    class="table-header-cell py-3 overflow-hidden text-ellipsis whitespace-nowrap text-xs font-black tracking-wide text-slate-500 uppercase"
                    :style="getHeaderCellStyle(field)"
                  >
                    {{ field }}
                    <button
                      v-if="field === firstFieldName"
                      data-test="table-header-height-resizer"
                      class="table-header-height-resizer"
                      type="button"
                      aria-label="调整标题栏高度"
                      @mousedown="startHeaderResize"
                    />
                  </div>
                </template>
                <template #body="{ data: row }">
                  <div
                    class="table-body-cell py-3 align-top whitespace-pre-wrap break-all"
                    :style="getBodyCellStyle(field)"
                    :data-test="shouldAttachRowDataTest(field) ? 'table-row' : undefined"
                  >
                    {{ getCellDisplayValue(row as Record<string, unknown>, field) }}
                  </div>
                </template>
              </Column>
            </DataTable>
          </div>
        </div>
        <div class="px-4 py-3 border-t border-slate-100 bg-slate-50 flex items-center justify-end gap-2">
          <button
            data-test="table-prev-page"
            class="table-pagination-button"
            :disabled="currentPage <= 1"
            @click="goToPrevPage"
          >
            上一页
          </button>
          <span class="text-xs font-bold text-slate-500 min-w-[72px] text-center">
            {{ currentPage }} / {{ totalPages }}
          </span>
          <button
            data-test="table-next-page"
            class="table-pagination-button"
            :disabled="currentPage >= totalPages"
            @click="goToNextPage"
          >
            下一页
          </button>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.table-pagination-button {
  padding: 6px 10px;
  border: 1px solid #cbd5e1;
  border-radius: 10px;
  background: #fff;
  color: #334155;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.table-pagination-button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.table-pagination-select {
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  padding: 4px 8px;
  background: #fff;
  color: #334155;
  font-size: 12px;
  font-weight: 700;
}

.table-width-panel {
  min-width: 320px;
}

:deep(.table-width-panel .p-button) {
  color: #334155;
}

:deep(.table-width-multiselect) {
  min-height: 40px;
}

:deep(.table-width-multiselect .p-multiselect-label-container) {
  min-height: 40px;
}

:deep(#table-width-input) {
  width: 100%;
  color: #0f172a;
  caret-color: #0f172a;
  background: #ffffff;
  cursor: text;
}

:deep(.p-inputnumber-input#table-width-input),
:deep(.table-width-input-control) {
  color: #0f172a;
  caret-color: #0f172a;
  background: #ffffff;
  cursor: text;
}

:deep(.table-width-input-control::selection) {
  color: #0f172a;
  background: #bfdbfe;
}

:deep(.table-width-input-row .p-inputnumber) {
  flex: 1 1 auto;
}

:deep(.table-width-input-row .p-inputnumber-button) {
  width: 24px;
}

:deep(.table-width-input-row .p-inputnumber-button .p-button-icon) {
  color: #475569;
}

.table-width-input-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.table-width-input-label,
.table-width-input-unit {
  flex: 0 0 auto;
  font-size: 12px;
  font-weight: 700;
  color: #475569;
  white-space: nowrap;
}

.table-header-cell {
  position: relative;
  display: flex;
  align-items: center;
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
}

.table-body-cell {
  box-sizing: border-box;
  overflow: hidden;
  width: 100%;
  min-width: 0;
}

:deep(.p-datatable thead > tr > th[data-p-resizable-column='true']) {
  position: relative;
}

:deep(.p-datatable-column-resizer) {
  position: absolute;
  top: 0;
  right: -4px;
  width: 14px;
  height: 100%;
  cursor: ew-resize !important;
  z-index: 12;
  touch-action: none;
  background: linear-gradient(
    to right,
    transparent 0,
    transparent 6px,
    rgba(148, 163, 184, 0.18) 6px,
    rgba(148, 163, 184, 0.18) 7px,
    transparent 7px,
    transparent 100%
  );
  opacity: 1;
  transition:
    background 140ms ease,
    box-shadow 140ms ease,
    opacity 140ms ease;
}

:deep(.p-datatable thead > tr > th[data-p-resizable-column='true']:hover .p-datatable-column-resizer) {
  background: linear-gradient(
    to right,
    transparent 0,
    rgba(37, 99, 235, 0.06) 0,
    rgba(37, 99, 235, 0.06) 6px,
    rgba(37, 99, 235, 0.72) 6px,
    rgba(37, 99, 235, 0.72) 7px,
    transparent 7px,
    transparent 100%
  );
  box-shadow: inset -1px 0 0 rgba(37, 99, 235, 0.18);
}

:deep(.p-datatable thead > tr > th[data-p-resizable-column='true']),
:deep(.p-datatable thead > tr > th[data-p-resizable-column='true'] *) {
  cursor: default;
}

:deep(.p-datatable thead > tr > th[data-p-resizable-column='true'] .p-datatable-column-resizer),
:deep(.p-datatable thead > tr > th[data-p-resizable-column='true'] .p-datatable-column-resizer *) {
  cursor: ew-resize !important;
}

:deep(.p-datatable-column-resize-indicator) {
  width: 1px;
  background: rgba(37, 99, 235, 0.9);
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.14);
  border-radius: 999px;
}

.table-header-height-resizer {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 8px;
  border: none;
  padding: 0;
  background: transparent;
  cursor: row-resize;
}

.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

.custom-scrollbar::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  border-radius: 999px;
}
</style>
