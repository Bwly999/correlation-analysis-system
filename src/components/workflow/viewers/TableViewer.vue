<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import type { ColDef, GridApi, GridReadyEvent } from 'ag-grid-community'
import Button from 'primevue/button'
import InputNumber from 'primevue/inputnumber'
import InputText from 'primevue/inputtext'
import MultiSelect from 'primevue/multiselect'
import { Columns3, RotateCcw, Search, SlidersHorizontal, StretchHorizontal } from 'lucide-vue-next'
import AgGridTablePreview from './AgGridTablePreview.vue'
import TableColumnMenuPopover from './TableColumnMenuPopover.vue'
import { useTablePreviewGridModel } from './useTablePreviewGridModel'

type TableRow = Record<string, unknown>

const buildHeaderTemplate = (field: string) => `
  <div class="ag-cell-label-container table-column-header-layout" role="presentation">
    <div data-ref="eLabel" class="ag-header-cell-label table-column-header-text-wrap" role="presentation">
      <span data-ref="eText" class="ag-header-cell-text" role="columnheader"></span>
      <span data-ref="eSortOrder" class="ag-header-icon ag-sort-order"></span>
      <span data-ref="eSortAsc" class="ag-header-icon ag-sort-ascending-icon"></span>
      <span data-ref="eSortDesc" class="ag-header-icon ag-sort-descending-icon"></span>
      <span data-ref="eSortNone" class="ag-header-icon ag-sort-none-icon"></span>
    </div>
    <div class="table-column-header-actions" role="presentation">
      <span data-ref="eFilterButton" class="ag-header-icon ag-header-cell-filter-button"></span>
      <span data-ref="eFilter" class="ag-header-icon ag-filter-icon"></span>
      <button
        type="button"
        class="table-column-menu-trigger"
        data-role="table-column-menu-trigger"
        data-field="${field}"
        aria-label="打开列菜单"
      >
        <span class="table-column-menu-trigger__dots" aria-hidden="true">
          <span class="table-column-menu-trigger__dot"></span>
          <span class="table-column-menu-trigger__dot"></span>
          <span class="table-column-menu-trigger__dot"></span>
        </span>
      </button>
    </div>
  </div>
`

const props = defineProps<{
  data: unknown
  storageScopeKey?: string
}>()

defineModel<number>('pageSize', { default: 50 })
defineModel<number>('page', { default: 1 })

const {
  rowData,
  columnOptions,
  fieldCount,
  visibleRowCount,
  defaultColDef,
  columnDefs,
  quickFilterText,
  density,
  densityConfig,
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
  resetView,
  handleColumnResized,
  handleColumnMoved,
  handleSortChanged,
  handleFilterChanged,
  applyPersistedGridState,
} = useTablePreviewGridModel({
  data: computed(() => props.data),
  storageScopeKey: props.storageScopeKey,
})

const isColumnPanelOpen = ref(false)
const isWidthPanelOpen = ref(false)
const columnSearch = ref('')
const selectedWidthFields = ref<string[]>([])
const pendingWidth = ref<number | null>(null)
const gridApi = shallowRef<GridApi<TableRow> | null>(null)
const activeColumnMenu = ref<{ field: string; left: number; top: number } | null>(null)
const activeColumnMenuAnchor = shallowRef<HTMLElement | null>(null)

const toolbarSummary = computed(() => `共 ${rowData.value.length} 条，${fieldCount.value} 个字段`)
const filteredColumnOptions = computed(() => {
  const keyword = columnSearch.value.trim().toLowerCase()
  if (!keyword) return columnOptions.value

  return columnOptions.value.filter((option) => option.name.toLowerCase().includes(keyword))
})

const columnMenuOptions = computed(() =>
  columnOptions.value.map((option) => ({
    ...option,
    visible: isFieldVisible(option.value),
  })),
)

const gridColumnDefs = computed<ColDef<TableRow>[]>(() =>
  columnDefs.value.map((column) => {
    const field = String(column.field ?? '')
    return {
      ...column,
      headerComponentParams: {
        template: buildHeaderTemplate(field),
      },
    }
  }),
)

const applySelectedWidths = () => {
  applyWidthToFields(selectedWidthFields.value, pendingWidth.value)
}

const closeColumnMenu = () => {
  activeColumnMenu.value = null
  activeColumnMenuAnchor.value = null
}

const openColumnMenu = (field: string, anchor: HTMLElement) => {
  const rect = anchor.getBoundingClientRect()
  const menuWidth = 248
  const viewportPadding = 12
  const menuOffset = 6
  const nextLeft = rect.right + menuOffset
  const fallbackLeft = rect.left - menuWidth - menuOffset
  const left =
    nextLeft + menuWidth + viewportPadding <= window.innerWidth
      ? nextLeft
      : Math.max(viewportPadding, fallbackLeft)
  const top = Math.min(
    Math.max(viewportPadding, rect.top - 6),
    window.innerHeight - viewportPadding - 40,
  )

  if (activeColumnMenu.value?.field === field) {
    closeColumnMenu()
    return
  }

  activeColumnMenuAnchor.value = anchor
  activeColumnMenu.value = {
    field,
    left,
    top,
  }
}

const pinColumnFromMenu = (pinned: 'left' | 'right' | undefined) => {
  const field = activeColumnMenu.value?.field
  if (!field) return
  setFieldPinned(field, pinned)
  closeColumnMenu()
}

const autoSizeCurrentColumn = () => {
  const field = activeColumnMenu.value?.field
  if (!field) return
  autoSizeField(field, gridApi.value)
  closeColumnMenu()
}

const autoSizeAllColumns = () => {
  autoSizeAllFields(gridApi.value)
  closeColumnMenu()
}

const toggleColumnVisibilityFromMenu = (field: string, visible: boolean) => {
  setFieldVisibility(field, visible)
}

const resetCurrentView = () => {
  selectedWidthFields.value = []
  pendingWidth.value = null
  columnSearch.value = ''
  isColumnPanelOpen.value = false
  isWidthPanelOpen.value = false
  closeColumnMenu()
  resetView()
}

const handleGridReady = (event: GridReadyEvent<TableRow>) => {
  gridApi.value = event.api
  applyPersistedGridState(event.api)
}

const densityModes: Array<{ label: string; value: 'compact' | 'standard' | 'comfortable'; testId: string }> = [
  { label: '紧凑', value: 'compact', testId: 'table-density-compact' },
  { label: '标准', value: 'standard', testId: 'table-density-standard' },
  { label: '舒展', value: 'comfortable', testId: 'table-density-comfortable' },
]

watch(activeColumnMenu, (value, _, onCleanup) => {
  if (!value) return

  let isListenerActive = false

  const onDocumentClick = (event: MouseEvent) => {
    if (!isListenerActive) return
    const target = event.target as HTMLElement | null
    if (!target) return
    if (target.closest('[data-test="table-column-menu"]')) return
    if (activeColumnMenuAnchor.value?.contains(target)) return
    closeColumnMenu()
  }

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      closeColumnMenu()
    }
  }

  const onWindowChange = () => closeColumnMenu()

  const activationTimer = window.setTimeout(() => {
    isListenerActive = true
  }, 0)

  document.addEventListener('click', onDocumentClick)
  document.addEventListener('keydown', onKeyDown)
  window.addEventListener('resize', onWindowChange)

  onCleanup(() => {
    window.clearTimeout(activationTimer)
    document.removeEventListener('click', onDocumentClick)
    document.removeEventListener('keydown', onKeyDown)
    window.removeEventListener('resize', onWindowChange)
  })
})

onBeforeUnmount(() => {
  gridApi.value = null
})
</script>

<template>
  <div class="h-full w-full">
    <div class="h-full w-full overflow-hidden rounded-xl border border-slate-200 bg-white flex flex-col">
      <div
        v-if="rowData.length === 0"
        class="h-full flex items-center justify-center text-sm font-medium text-slate-400"
      >
        暂无表格结果
      </div>
      <template v-else>
        <div data-test="table-toolbar" class="table-toolbar">
          <div class="px-4 py-3 flex flex-wrap items-center gap-3">
            <div class="table-toolbar-search-shell">
              <Search :size="14" class="text-slate-400" />
              <label class="sr-only" for="table-quick-filter">快速搜索</label>
              <InputText
                id="table-quick-filter"
                :model-value="quickFilterText"
                data-test="table-quick-filter"
                class="table-toolbar-input"
                placeholder="快速搜索"
                @update:model-value="setQuickFilterText(String($event ?? ''))"
              />
            </div>

            <div class="table-density-group">
              <Button
                v-for="mode in densityModes"
                :key="mode.value"
                :data-test="mode.testId"
                class="table-toolbar-button"
                :class="{ 'table-toolbar-button--active': density === mode.value }"
                severity="secondary"
                outlined
                @click="setDensity(mode.value)"
              >
                {{ mode.label }}
              </Button>
            </div>

            <Button
              data-test="table-column-panel-toggle"
              class="table-toolbar-button"
              :class="{ 'table-toolbar-button--active': isColumnPanelOpen }"
              severity="secondary"
              outlined
              @click="isColumnPanelOpen = !isColumnPanelOpen"
            >
              <Columns3 :size="14" />
              列管理
            </Button>

            <Button
              data-test="table-width-panel-toggle"
              class="table-toolbar-button"
              :class="{ 'table-toolbar-button--active': isWidthPanelOpen }"
              severity="secondary"
              outlined
              @click="isWidthPanelOpen = !isWidthPanelOpen"
            >
              <StretchHorizontal :size="14" />
              批量列宽
            </Button>

            <Button
              data-test="table-reset-view"
              class="table-toolbar-button"
              severity="secondary"
              text
              @click="resetCurrentView"
            >
              <RotateCcw :size="14" />
              重置视图
            </Button>

            <div class="ml-auto text-[11px] font-semibold text-slate-500">
              {{ toolbarSummary }}
            </div>
          </div>

          <div v-if="isColumnPanelOpen || isWidthPanelOpen" class="px-4 pb-3 grid gap-3 lg:grid-cols-2">
            <div
              v-if="isColumnPanelOpen"
              class="table-panel"
            >
              <div class="flex items-center justify-between gap-3">
                <div class="text-sm font-bold text-slate-700">列管理</div>
                <div class="text-xs font-medium text-slate-400">拖动表头可调整列顺序</div>
              </div>
              <div class="mt-3 table-toolbar-search-shell">
                <SlidersHorizontal :size="14" class="text-slate-400" />
                <InputText
                  v-model="columnSearch"
                  class="table-toolbar-input"
                  placeholder="搜索列名"
                />
              </div>
              <div class="mt-3 max-h-56 overflow-auto rounded-lg border border-slate-100">
                <div
                  v-for="option in filteredColumnOptions"
                  :key="option.value"
                  class="flex items-center justify-between gap-3 border-b border-slate-100 px-3 py-2 last:border-b-0"
                >
                  <div class="truncate text-sm font-medium text-slate-700">
                    {{ option.name }}
                  </div>
                  <div class="flex items-center gap-2">
                    <Button
                      :data-test="`table-hide-column-${option.value}`"
                      class="table-mini-button"
                      severity="secondary"
                      outlined
                      size="small"
                      @click="toggleFieldVisibility(option.value)"
                    >
                      显隐
                    </Button>
                    <Button
                      :data-test="`table-pin-column-${option.value}-left`"
                      class="table-mini-button"
                      severity="secondary"
                      outlined
                      size="small"
                      @click="setFieldPinned(option.value, 'left')"
                    >
                      左固定
                    </Button>
                    <Button
                      :data-test="`table-unpin-column-${option.value}`"
                      class="table-mini-button"
                      severity="secondary"
                      text
                      size="small"
                      @click="setFieldPinned(option.value, undefined)"
                    >
                      取消固定
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            <div
              v-if="isWidthPanelOpen"
              class="table-panel"
            >
              <div class="text-sm font-bold text-slate-700">批量列宽</div>
              <div class="mt-3">
                <label class="mb-2 block text-xs font-bold text-slate-500" for="table-width-fields">
                  选择列
                </label>
                <MultiSelect
                  id="table-width-fields"
                  v-model="selectedWidthFields"
                  data-test="table-width-fields"
                  class="table-multi-select"
                  :options="columnOptions"
                  option-label="name"
                  option-value="value"
                  placeholder="选择要统一列宽的字段"
                  display="chip"
                  filter
                  :max-selected-labels="4"
                />
              </div>
              <div class="mt-3">
                <label class="mb-2 block text-xs font-bold text-slate-500" for="table-width-input">
                  宽度
                </label>
                <InputNumber
                  id="table-width-input"
                  v-model="pendingWidth"
                  data-test="table-width-input"
                  class="table-number-input"
                  :min="1"
                  :step="10"
                  :use-grouping="false"
                  placeholder="例如 240"
                />
              </div>
              <div class="mt-3 flex items-center justify-end gap-2">
                <Button data-test="table-apply-width" class="table-apply-width-button" @click="applySelectedWidths">
                  应用列宽
                </Button>
              </div>
            </div>
          </div>
        </div>

        <div class="flex-1 min-h-0 bg-white">
          <AgGridTablePreview
            :row-data="rowData"
            :column-defs="gridColumnDefs"
            :default-col-def="defaultColDef"
            :quick-filter-text="quickFilterText"
            :row-height="densityConfig.rowHeight"
            :header-height="densityConfig.headerHeight"
            @column-resized="handleColumnResized"
            @column-moved="handleColumnMoved"
            @sort-changed="handleSortChanged"
            @filter-changed="handleFilterChanged"
            @grid-ready="handleGridReady"
            @header-menu-triggered="({ field, anchor }) => openColumnMenu(field, anchor)"
          />
        </div>

        <div
          data-test="table-status-bar"
          class="table-status-bar"
        >
          <span>总行数 {{ rowData.length }}</span>
          <span>可见行数 {{ visibleRowCount }}</span>
          <span>字段数 {{ fieldCount }}</span>
          <span v-if="quickFilterText">搜索中：{{ quickFilterText }}</span>
        </div>
      </template>
    </div>
  </div>

  <Teleport to="body">
    <TableColumnMenuPopover
      v-if="activeColumnMenu"
      :field="activeColumnMenu.field"
      :left="activeColumnMenu.left"
      :top="activeColumnMenu.top"
      :pinned="getFieldPinned(activeColumnMenu.field)"
      :columns="columnMenuOptions"
      @close="closeColumnMenu"
      @pin-left="pinColumnFromMenu('left')"
      @pin-right="pinColumnFromMenu('right')"
      @unpin="pinColumnFromMenu(undefined)"
      @auto-size-current="autoSizeCurrentColumn"
      @auto-size-all="autoSizeAllColumns"
      @toggle-column-visibility="toggleColumnVisibilityFromMenu"
      @reset="resetCurrentView"
    />
  </Teleport>
</template>

<style scoped>
.table-toolbar {
  border-bottom: 1px solid #dde2eb;
  background: #f8fafc;
}

.table-panel {
  border-radius: 10px;
  border: 1px solid #dde2eb;
  background: #fbfcfe;
  padding: 12px;
  box-shadow: none;
}

.table-toolbar-search-shell {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 220px;
  height: 34px;
  padding: 0 10px;
  border: 1px solid #d6dbe5;
  border-radius: 8px;
  background: #ffffff;
}

.table-toolbar-search-shell :deep(.p-inputtext),
.table-toolbar-search-shell :deep(.table-toolbar-input) {
  width: 100%;
  border: none;
  box-shadow: none;
  background: transparent;
  height: 32px;
  min-height: 32px;
  padding-left: 0;
  padding-right: 0;
  padding-top: 0;
  padding-bottom: 0;
  font-size: 13px;
}

.table-density-group {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.table-toolbar-button {
  height: 34px;
}

.table-toolbar-button:deep(.p-button) {
  gap: 6px;
  height: 34px;
  padding: 0 12px;
  border-radius: 8px;
  border-color: #d6dbe5;
  background: #ffffff;
  color: #425466;
  font-size: 12px;
  font-weight: 600;
  box-shadow: none;
}

.table-toolbar-button--active:deep(.p-button) {
  border-color: #9ec5fe;
  background: #edf4ff;
  color: #1b4d9b;
}

.table-mini-button {
  height: 28px;
}

.table-mini-button:deep(.p-button) {
  height: 28px;
  border-radius: 6px;
  border-color: #d6dbe5;
  box-shadow: none;
  font-size: 11px;
  font-weight: 600;
  padding-inline: 10px;
}

.table-multi-select:deep(.p-multiselect),
.table-number-input:deep(.p-inputnumber),
.table-number-input:deep(.p-inputnumber-input) {
  width: 100%;
}

.table-multi-select:deep(.p-multiselect),
.table-number-input:deep(.p-inputnumber-input) {
  border-radius: 8px;
  border-color: #d6dbe5;
  box-shadow: none;
  min-height: 34px;
}

.table-multi-select:deep(.p-multiselect-label),
.table-number-input:deep(.p-inputnumber-input) {
  font-size: 13px;
}

.table-apply-width-button:deep(.p-button) {
  height: 34px;
  border-radius: 8px;
  background: #2563eb;
  border-color: #2563eb;
  box-shadow: none;
}

.table-apply-width-button:deep(.p-button:hover) {
  background: #1d4ed8;
  border-color: #1d4ed8;
}

.table-status-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 16px;
  padding: 8px 16px;
  border-top: 1px solid #dde2eb;
  background: #fafbfc;
  color: #60758a;
  font-size: 12px;
  font-weight: 600;
}
</style>
