<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import type { ColDef, GridApi, GridReadyEvent } from 'ag-grid-community'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputNumber from 'primevue/inputnumber'
import InputText from 'primevue/inputtext'
import MultiSelect from 'primevue/multiselect'
import Select from 'primevue/select'
import { useToast } from 'primevue/usetoast'
import { Columns3, Download, RotateCcw, Search, SlidersHorizontal, StretchHorizontal } from 'lucide-vue-next'
import AgGridTablePreview from './AgGridTablePreview.vue'
import TableColumnMenuPopover from './TableColumnMenuPopover.vue'
import { useTablePreviewGridModel } from './useTablePreviewGridModel'
import { useWorkflowOverlayHost } from '../workflowOverlayHost'
import { exportTableResult, type TableExportFormat } from '@/utils/tableExport'

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
const { overlayAppendTo, teleportTarget } = useWorkflowOverlayHost()
const toast = useToast()

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
const isExportDialogOpen = ref(false)
const columnSearch = ref('')
const selectedWidthFields = ref<string[]>([])
const pendingWidth = ref<number | null>(null)
const gridApi = shallowRef<GridApi<TableRow> | null>(null)
const activeColumnMenu = ref<{ field: string; left: number; top: number } | null>(null)
const activeColumnMenuAnchor = shallowRef<HTMLElement | null>(null)
const exportFormatOptions: Array<{ label: string; value: TableExportFormat }> = [
  { label: 'CSV', value: 'csv' },
  { label: 'Excel (.xlsx)', value: 'xlsx' },
  { label: 'JSON', value: 'json' },
]
const exportFormat = ref<TableExportFormat>('xlsx')
const exportFilename = ref('export_data')
const isExporting = ref(false)

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

const canExport = computed(() => rowData.value.length > 0)

const openExportDialog = () => {
  if (!canExport.value) return
  isExportDialogOpen.value = true
}

const closeExportDialog = () => {
  if (isExporting.value) return
  isExportDialogOpen.value = false
}

const submitExport = async () => {
  if (!canExport.value || isExporting.value) return

  isExporting.value = true
  try {
    const file = exportTableResult({
      rows: rowData.value,
      format: exportFormat.value,
      filename: exportFilename.value,
      fallbackBaseName: 'export_data',
    })
    toast.add({
      severity: 'success',
      summary: '导出成功',
      detail: `${file.filename} 已开始下载`,
      life: 2500,
    })
    isExportDialogOpen.value = false
  } catch (error) {
    console.error('导出表格失败:', error)
    toast.add({
      severity: 'error',
      summary: '导出失败',
      detail: error instanceof Error ? error.message : '导出表格时发生错误。',
      life: 4000,
    })
  } finally {
    isExporting.value = false
  }
}

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
    <div class="h-full w-full overflow-hidden rounded-xl border border-slate-200 bg-white flex flex-col shadow-sm">
      <div
        v-if="rowData.length === 0"
        class="h-full flex items-center justify-center text-sm font-medium text-slate-400"
      >
        暂无表格结果
      </div>
      <template v-else>
        <div data-test="table-toolbar" class="table-toolbar">
          <div class="table-toolbar-row">
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

            <div class="table-toolbar-sep" aria-hidden="true"></div>

            <div class="table-toolbar-cluster table-toolbar-cluster--density">
              <span class="table-toolbar-cluster-label">行距</span>
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
            </div>

            <div class="table-toolbar-sep" aria-hidden="true"></div>

            <div class="table-toolbar-cluster">
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
            </div>

            <div class="table-toolbar-actions">
              <Button
                v-if="canExport"
                data-test="table-export-trigger"
                class="table-toolbar-button table-toolbar-button--primary"
                severity="secondary"
                outlined
                @click="openExportDialog"
              >
                <Download :size="14" />
                导出
              </Button>

              <Button
                data-test="table-reset-view"
                class="table-toolbar-button table-toolbar-button--ghost"
                severity="secondary"
                text
                @click="resetCurrentView"
              >
                <RotateCcw :size="14" />
              </Button>

              <div class="table-toolbar-sep" aria-hidden="true"></div>

              <div class="table-toolbar-summary">
                {{ toolbarSummary }}
              </div>
            </div>
          </div>

          <div v-if="isColumnPanelOpen || isWidthPanelOpen" class="table-panel-grid">
            <div
              v-if="isColumnPanelOpen"
              class="table-panel"
            >
              <div class="table-panel-header">
                <div>
                  <div class="table-panel-title">列管理</div>
                  <div class="table-panel-description">快速隐藏、固定字段；拖动表头可调整列顺序</div>
                </div>
                <div class="table-panel-kicker">{{ filteredColumnOptions.length }} 列</div>
              </div>
              <div class="table-panel-search table-toolbar-search-shell">
                <SlidersHorizontal :size="14" class="text-slate-400" />
                <InputText
                  v-model="columnSearch"
                  class="table-toolbar-input"
                  placeholder="搜索列名"
                />
              </div>
              <div class="table-column-list">
                <div
                  v-for="option in filteredColumnOptions"
                  :key="option.value"
                  class="table-column-list-row"
                >
                  <div class="table-column-name">
                    {{ option.name }}
                  </div>
                  <div class="table-column-actions">
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
              <div class="table-panel-header">
                <div>
                  <div class="table-panel-title">批量列宽</div>
                  <div class="table-panel-description">为多个字段统一设置宽度，适合长字段预览</div>
                </div>
              </div>
              <div class="table-form-field">
                <label class="table-form-label" for="table-width-fields">
                  选择列
                </label>
                <MultiSelect
                  id="table-width-fields"
                  v-model="selectedWidthFields"
                  data-test="table-width-fields"
                  class="table-multi-select"
                  :append-to="overlayAppendTo"
                  :options="columnOptions"
                  option-label="name"
                  option-value="value"
                  placeholder="选择要统一列宽的字段"
                  display="chip"
                  filter
                  :max-selected-labels="4"
                />
              </div>
              <div class="table-form-field">
                <label class="table-form-label" for="table-width-input">
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
              <div class="table-panel-footer">
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
          <span class="table-status-pill">总行数 {{ rowData.length }}</span>
          <span class="table-status-pill">可见行数 {{ visibleRowCount }}</span>
          <span class="table-status-pill">字段数 {{ fieldCount }}</span>
          <span v-if="quickFilterText" class="table-status-pill table-status-pill--highlight">搜索中：{{ quickFilterText }}</span>
        </div>
      </template>
    </div>
  </div>

  <Teleport :to="teleportTarget">
    <Dialog
      v-model:visible="isExportDialogOpen"
      :append-to="overlayAppendTo"
      modal
      header="导出表格"
      @hide="closeExportDialog"
    >
      <div class="table-export-dialog-body">
        <div class="table-export-field">
          <label class="table-export-label" for="table-export-format">导出格式</label>
          <Select
            id="table-export-format"
            v-model="exportFormat"
            data-test="table-export-format"
            :options="exportFormatOptions"
            option-label="label"
            option-value="value"
            placeholder="选择导出格式"
          />
        </div>

        <div class="table-export-field">
          <label class="table-export-label" for="table-export-filename">文件名称</label>
          <InputText
            id="table-export-filename"
            v-model="exportFilename"
            data-test="table-export-filename"
            placeholder="输入导出文件名前缀"
          />
        </div>
      </div>

      <template #footer>
        <div class="table-export-footer">
          <Button
            class="table-toolbar-button"
            severity="secondary"
            text
            :disabled="isExporting"
            @click="closeExportDialog"
          >
            取消
          </Button>
          <Button
            data-test="table-export-submit"
            class="table-apply-width-button"
            :disabled="isExporting"
            @click="submitExport"
          >
            {{ isExporting ? '导出中...' : '导出' }}
          </Button>
        </div>
      </template>
    </Dialog>

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
/* Toolbar */
.table-toolbar {
  position: relative;
  overflow: hidden;
  border-bottom: 1px solid rgba(203, 213, 225, 0.9);
  background:
    radial-gradient(circle at 18px 14px, rgba(37, 99, 235, 0.1), transparent 24px),
    linear-gradient(135deg, #f8fafc 0%, #eef3f8 48%, #f8fafc 100%);
}

.table-toolbar::before {
  position: absolute;
  inset: 0;
  pointer-events: none;
  content: '';
  background-image: linear-gradient(rgba(15, 23, 42, 0.035) 1px, transparent 1px);
  background-size: 100% 12px;
  mask-image: linear-gradient(90deg, transparent, #000 18%, #000 82%, transparent);
}

.table-toolbar-row {
  position: relative;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
}

.table-toolbar-cluster,
.table-toolbar-actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.table-toolbar-cluster {
  padding: 3px;
  border: 1px solid rgba(203, 213, 225, 0.72);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.68);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.82);
  backdrop-filter: blur(10px);
}

.table-toolbar-cluster--density {
  gap: 6px;
  padding-left: 10px;
}

.table-toolbar-cluster-label {
  color: #64748b;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.08em;
}

.table-toolbar-actions {
  margin-left: auto;
  padding: 3px;
  border: 1px solid rgba(203, 213, 225, 0.72);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.72);
  box-shadow:
    0 10px 28px rgba(15, 23, 42, 0.08),
    inset 0 1px 0 rgba(255, 255, 255, 0.86);
}

.table-toolbar-sep {
  width: 1px;
  align-self: stretch;
  margin: 6px 0;
  background: linear-gradient(180deg, transparent, #cbd5e1 28%, #cbd5e1 72%, transparent);
  flex-shrink: 0;
}

.table-toolbar-summary {
  font-size: 11px;
  font-weight: 700;
  color: #475569;
  letter-spacing: 0.02em;
  white-space: nowrap;
  padding: 0 8px;
}

/* Search */
.table-toolbar-search-shell {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: min(320px, 100%);
  height: 38px;
  padding: 0 14px;
  border: 1px solid rgba(148, 163, 184, 0.55);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.9);
  box-shadow:
    0 12px 30px rgba(15, 23, 42, 0.08),
    inset 0 1px 0 rgba(255, 255, 255, 0.9);
  transition:
    border-color 0.2s ease,
    box-shadow 0.2s ease,
    transform 0.2s ease;
}

.table-toolbar-search-shell:focus-within {
  border-color: #2563eb;
  box-shadow:
    0 0 0 4px rgba(37, 99, 235, 0.14),
    0 16px 34px rgba(37, 99, 235, 0.12),
    inset 0 1px 0 rgba(255, 255, 255, 0.95);
  transform: translateY(-1px);
}

.table-toolbar-search-shell :deep(.p-inputtext),
.table-toolbar-search-shell :deep(.table-toolbar-input) {
  width: 100%;
  border: none;
  box-shadow: none;
  background: transparent;
  height: 36px;
  min-height: 36px;
  padding: 0;
  font-size: 13px;
  color: #1e293b;
}

/* Density segmented control */
.table-density-group {
  display: inline-flex;
  align-items: center;
  background: #e2e8f0;
  border-radius: 999px;
  padding: 3px;
  gap: 2px;
}

/* Buttons */
.table-toolbar-button {
  height: 36px;
}

:deep(.p-button.table-toolbar-button),
.table-toolbar-button:deep(.p-button) {
  gap: 6px;
  height: 36px;
  padding: 0 14px;
  border: 1px solid rgba(203, 213, 225, 0.86);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.86);
  color: #0f172a;
  font-size: 12px;
  font-weight: 750;
  letter-spacing: 0.01em;
  box-shadow:
    0 8px 18px rgba(15, 23, 42, 0.06),
    inset 0 1px 0 rgba(255, 255, 255, 0.82);
  transition:
    transform 0.16s ease,
    border-color 0.16s ease,
    background 0.16s ease,
    box-shadow 0.16s ease,
    color 0.16s ease;
}

:deep(.p-button.table-toolbar-button:hover),
.table-toolbar-button:deep(.p-button:hover) {
  border-color: rgba(100, 116, 139, 0.45);
  background: #ffffff;
  color: #0f172a;
  box-shadow:
    0 12px 24px rgba(15, 23, 42, 0.1),
    inset 0 1px 0 rgba(255, 255, 255, 0.9);
  transform: translateY(-1px);
}

:deep(.p-button.table-toolbar-button:active),
.table-toolbar-button:deep(.p-button:active) {
  transform: translateY(0);
  box-shadow: 0 4px 10px rgba(15, 23, 42, 0.08);
}

:deep(.p-button.table-toolbar-button--active),
.table-toolbar-button--active:deep(.p-button) {
  border-color: rgba(37, 99, 235, 0.42);
  background: linear-gradient(180deg, #eff6ff 0%, #dbeafe 100%);
  color: #1d4ed8;
  box-shadow:
    0 0 0 1px rgba(37, 99, 235, 0.18),
    0 10px 22px rgba(37, 99, 235, 0.12);
}

/* Density segmented overrides */
:deep(.table-density-group .p-button.table-toolbar-button),
.table-density-group .table-toolbar-button:deep(.p-button) {
  height: 30px;
  border: none;
  background: transparent;
  box-shadow: none;
  color: #475569;
  border-radius: 999px;
  padding: 0 11px;
}

:deep(.table-density-group .p-button.table-toolbar-button:hover),
.table-density-group .table-toolbar-button:deep(.p-button:hover) {
  background: rgba(255, 255, 255, 0.72);
  color: #1e293b;
  box-shadow: none;
  transform: none;
}

:deep(.table-density-group .p-button.table-toolbar-button--active),
.table-density-group .table-toolbar-button--active:deep(.p-button) {
  background: #ffffff;
  color: #2563eb;
  border: none;
  box-shadow: 0 4px 12px rgba(15, 23, 42, 0.12);
  font-weight: 700;
}

/* Primary action */
:deep(.p-button.table-toolbar-button--primary),
.table-toolbar-button--primary:deep(.p-button) {
  background: linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%);
  border-color: #2563eb;
  color: #ffffff;
  box-shadow:
    0 14px 28px rgba(37, 99, 235, 0.28),
    inset 0 1px 0 rgba(255, 255, 255, 0.18);
}

:deep(.p-button.table-toolbar-button--primary:hover),
.table-toolbar-button--primary:deep(.p-button:hover) {
  background: linear-gradient(180deg, #1d4ed8 0%, #1e40af 100%);
  border-color: #1d4ed8;
  color: #ffffff;
  box-shadow: 0 18px 34px rgba(37, 99, 235, 0.34);
  transform: translateY(-1px);
}

.table-toolbar-button--primary:deep(.p-button:active),
:deep(.p-button.table-toolbar-button--primary:active) {
  transform: translateY(0);
  box-shadow: 0 8px 18px rgba(37, 99, 235, 0.24);
}

/* Ghost button */
:deep(.p-button.table-toolbar-button--ghost),
.table-toolbar-button--ghost:deep(.p-button) {
  width: 36px;
  background: transparent;
  border: 1px solid transparent;
  color: #64748b;
  box-shadow: none;
  padding: 0;
}

:deep(.p-button.table-toolbar-button--ghost:hover),
.table-toolbar-button--ghost:deep(.p-button:hover) {
  background: rgba(15, 23, 42, 0.06);
  border-color: transparent;
  color: #0f172a;
  box-shadow: none;
  transform: none;
}

/* Panels */
.table-panel-grid {
  position: relative;
  display: grid;
  gap: 12px;
  padding: 0 16px 14px;
}

.table-panel {
  border: 1px solid rgba(203, 213, 225, 0.82);
  border-radius: 16px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.96) 0%, rgba(248, 250, 252, 0.96) 100%),
    #ffffff;
  padding: 16px;
  box-shadow:
    0 18px 42px rgba(15, 23, 42, 0.08),
    inset 0 1px 0 rgba(255, 255, 255, 0.9);
}

.table-panel-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.table-panel-title {
  color: #0f172a;
  font-size: 14px;
  font-weight: 800;
}

.table-panel-description {
  margin-top: 3px;
  color: #64748b;
  font-size: 12px;
  font-weight: 500;
}

.table-panel-kicker {
  flex-shrink: 0;
  border-radius: 999px;
  background: #eff6ff;
  color: #1d4ed8;
  font-size: 11px;
  font-weight: 800;
  padding: 4px 9px;
}

.table-panel-search {
  width: 100%;
  margin-top: 14px;
}

.table-column-list {
  max-height: 224px;
  overflow: auto;
  margin-top: 14px;
  border: 1px solid rgba(226, 232, 240, 0.92);
  border-radius: 12px;
  background: #ffffff;
}

.table-column-list-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border-bottom: 1px solid rgba(226, 232, 240, 0.8);
  transition:
    background 0.16s ease,
    box-shadow 0.16s ease;
}

.table-column-list-row:last-child {
  border-bottom: none;
}

.table-column-list-row:hover {
  background: #f8fafc;
  box-shadow: inset 3px 0 0 #2563eb;
}

.table-column-name {
  min-width: 0;
  overflow: hidden;
  color: #334155;
  font-size: 13px;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.table-column-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 6px;
}

.table-form-field {
  display: grid;
  gap: 8px;
  margin-top: 14px;
}

.table-form-label {
  color: #475569;
  font-size: 12px;
  font-weight: 800;
}

.table-panel-footer {
  display: flex;
  justify-content: flex-end;
  margin-top: 14px;
}

/* Mini buttons */
.table-mini-button {
  height: 28px;
}

:deep(.p-button.table-mini-button),
.table-mini-button:deep(.p-button) {
  height: 28px;
  border: 1px solid rgba(203, 213, 225, 0.88);
  border-radius: 999px;
  background: #ffffff;
  box-shadow: none;
  font-size: 11px;
  font-weight: 750;
  padding-inline: 10px;
  color: #334155;
  transition: all 0.15s ease;
}

:deep(.p-button.table-mini-button:hover),
.table-mini-button:deep(.p-button:hover) {
  border-color: rgba(37, 99, 235, 0.4);
  background: #eff6ff;
  color: #1d4ed8;
}

/* Form controls */
.table-multi-select:deep(.p-multiselect),
.table-number-input:deep(.p-inputnumber),
.table-number-input:deep(.p-inputnumber-input) {
  width: 100%;
}

.table-multi-select:deep(.p-multiselect),
.table-number-input:deep(.p-inputnumber-input) {
  border-color: rgba(203, 213, 225, 0.9);
  border-radius: 10px;
  box-shadow: none;
  min-height: 38px;
}

.table-multi-select:deep(.p-multiselect-label),
.table-number-input:deep(.p-inputnumber-input) {
  font-size: 13px;
}

/* Apply / submit button */
:deep(.p-button.table-apply-width-button),
.table-apply-width-button:deep(.p-button) {
  height: 36px;
  border-radius: 10px;
  background: linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%);
  border-color: #2563eb;
  box-shadow: 0 12px 24px rgba(37, 99, 235, 0.24);
  transition: all 0.15s ease;
}

:deep(.p-button.table-apply-width-button:hover),
.table-apply-width-button:deep(.p-button:hover) {
  background: linear-gradient(180deg, #1d4ed8 0%, #1e40af 100%);
  border-color: #1d4ed8;
  box-shadow: 0 16px 28px rgba(37, 99, 235, 0.3);
}

/* Status bar */
.table-status-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border-top: 1px solid #e5e7eb;
  background: #f8fafc;
}

.table-status-pill {
  display: inline-flex;
  align-items: center;
  height: 24px;
  padding: 0 10px;
  border-radius: 999px;
  background: #eef2f7;
  color: #475569;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.01em;
  white-space: nowrap;
}

.table-status-pill--highlight {
  background: #eff6ff;
  color: #1d4ed8;
  border: 1px solid #bfdbfe;
}

/* Export dialog */
.table-export-dialog-body {
  display: grid;
  gap: 16px;
  min-width: 320px;
  padding-top: 4px;
}

.table-export-field {
  display: grid;
  gap: 8px;
}

.table-export-label {
  font-size: 12px;
  font-weight: 700;
  color: #475569;
}

.table-export-field :deep(.p-select),
.table-export-field :deep(.p-inputtext) {
  width: 100%;
  border-radius: 8px;
  border-color: #cdd5e0;
  box-shadow: none;
  min-height: 36px;
}

.table-export-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  width: 100%;
}

@media (min-width: 1024px) {
  .table-panel-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 760px) {
  .table-toolbar-row {
    align-items: stretch;
  }

  .table-toolbar-search-shell,
  .table-toolbar-cluster,
  .table-toolbar-actions {
    width: 100%;
  }

  .table-toolbar-cluster,
  .table-toolbar-actions {
    justify-content: space-between;
  }

  .table-toolbar-sep {
    display: none;
  }

  .table-column-list-row {
    align-items: flex-start;
    flex-direction: column;
  }

  .table-column-actions {
    justify-content: flex-start;
  }
}
</style>
