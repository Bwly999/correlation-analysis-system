<script setup lang="ts">
import { AgGridVue } from 'ag-grid-vue3'
import {
  AllCommunityModule,
  ModuleRegistry,
  type ColDef,
  type ColumnMovedEvent,
  type ColumnResizedEvent,
  type FilterChangedEvent,
  type GridReadyEvent,
  type SortChangedEvent,
} from 'ag-grid-community'
import { nextTick, onBeforeUnmount, onMounted, onUpdated, useTemplateRef } from 'vue'
import 'ag-grid-community/styles/ag-grid.css'
import 'ag-grid-community/styles/ag-theme-quartz.css'

type TableRow = Record<string, unknown>

let modulesRegistered = false
if (!modulesRegistered) {
  ModuleRegistry.registerModules([AllCommunityModule])
  modulesRegistered = true
}

const props = defineProps<{
  rowData: TableRow[]
  columnDefs: ColDef<TableRow>[]
  defaultColDef: ColDef<TableRow>
  components?: Record<string, unknown>
  quickFilterText: string
  rowHeight: number
  headerHeight: number
}>()

const emit = defineEmits<{
  columnResized: [event: ColumnResizedEvent<TableRow>]
  columnMoved: [event: ColumnMovedEvent<TableRow>]
  gridReady: [event: GridReadyEvent<TableRow>]
  sortChanged: [event: SortChangedEvent<TableRow>]
  filterChanged: [event: FilterChangedEvent<TableRow>]
  headerMenuTriggered: [payload: { field: string; anchor: HTMLElement }]
}>()

const shellRef = useTemplateRef<HTMLDivElement>('shell')
let headerObserver: MutationObserver | null = null

const emitHeaderMenuTrigger = (button: HTMLElement) => {
  const field = button.dataset.field?.trim()
  if (!field) return
  emit('headerMenuTriggered', { field, anchor: button })
}

const bindHeaderMenuButtons = () => {
  const shell = shellRef.value
  if (!shell) return

  const buttons = shell.querySelectorAll<HTMLElement>('[data-role="table-column-menu-trigger"]')
  buttons.forEach((button) => {
    if (button.dataset.boundMenuTrigger === 'true') return
    button.dataset.boundMenuTrigger = 'true'
    button.addEventListener('pointerdown', (event) => {
      event.preventDefault()
      event.stopPropagation()
    })
    button.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopPropagation()
      emitHeaderMenuTrigger(button)
    })
  })
}

const scheduleHeaderMenuBinding = () => {
  nextTick(bindHeaderMenuButtons)
}

const handleGridReady = (event: GridReadyEvent<TableRow>) => {
  emit('gridReady', event)
  scheduleHeaderMenuBinding()
}

const handleShellPointerDownCapture = (event: PointerEvent) => {
  const shell = shellRef.value
  const target = event.target as HTMLElement | null
  if (!shell || !target) return

  const button = target.closest<HTMLElement>('[data-role="table-column-menu-trigger"]')
  if (!button || !shell.contains(button)) return

  event.preventDefault()
  event.stopPropagation()
}

const handleShellClickCapture = (event: MouseEvent) => {
  const shell = shellRef.value
  const target = event.target as HTMLElement | null
  if (!shell || !target) return

  const button = target.closest<HTMLElement>('[data-role="table-column-menu-trigger"]')
  if (!button || !shell.contains(button)) return

  event.preventDefault()
  event.stopPropagation()
  emitHeaderMenuTrigger(button)
}

onMounted(() => {
  scheduleHeaderMenuBinding()

  const shell = shellRef.value
  if (!shell) return

  shell.addEventListener('pointerdown', handleShellPointerDownCapture, true)
  shell.addEventListener('click', handleShellClickCapture, true)

  headerObserver = new MutationObserver(() => {
    bindHeaderMenuButtons()
  })
  headerObserver.observe(shell, { childList: true, subtree: true })
})
onUpdated(scheduleHeaderMenuBinding)

onBeforeUnmount(() => {
  const shell = shellRef.value
  if (shell) {
    shell.removeEventListener('pointerdown', handleShellPointerDownCapture, true)
    shell.removeEventListener('click', handleShellClickCapture, true)
  }
  headerObserver?.disconnect()
  headerObserver = null
})
</script>

<template>
  <div ref="shell" data-test="table-grid-shell" class="ag-theme-quartz table-grid-shell h-full w-full">
    <AgGridVue
      class="h-full w-full"
      theme="legacy"
      :row-data="rowData"
      :column-defs="columnDefs"
      :default-col-def="defaultColDef"
      :components="components"
      :quick-filter-text="quickFilterText"
      :row-height="rowHeight"
      :header-height="headerHeight"
      :animate-rows="false"
      :row-buffer="4"
      :suppress-column-virtualisation="false"
      :suppress-row-virtualisation="false"
      :tooltip-show-delay="200"
      :suppress-cell-focus="true"
      :enable-cell-text-selection="true"
      :ensure-dom-order="true"
      @column-resized="emit('columnResized', $event)"
      @column-moved="emit('columnMoved', $event)"
      @grid-ready="handleGridReady"
      @sort-changed="emit('sortChanged', $event)"
      @filter-changed="emit('filterChanged', $event)"
    />
  </div>
</template>

<style scoped>
.table-grid-shell {
  --ag-font-size: 13px;
  --ag-font-family: "IBM Plex Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
  --ag-header-background-color: #fafafa;
  --ag-background-color: #ffffff;
  --ag-border-color: rgba(24, 29, 31, 0.12);
  --ag-row-hover-color: rgba(33, 150, 243, 0.08);
  --ag-selected-row-background-color: rgba(33, 150, 243, 0.12);
}

.table-grid-shell :deep(.ag-root-wrapper) {
  border: none;
  border-radius: 0;
}

.table-grid-shell :deep(.ag-header) {
  border-bottom-color: rgba(24, 29, 31, 0.12);
}

.table-grid-shell :deep(.ag-header-cell-label) {
  font-weight: 700;
}

.table-grid-shell :deep(.ag-cell),
.table-grid-shell :deep(.ag-cell-value) {
  user-select: text;
}

.table-grid-shell :deep(.ag-header-cell-comp-wrapper) {
  width: 100%;
}

.table-grid-shell :deep(.ag-cell-label-container.table-column-header-layout) {
  display: flex;
  flex-direction: row;
  justify-content: flex-start;
  align-items: center;
  gap: 6px;
  min-width: 0;
  width: 100%;
}

.table-grid-shell :deep(.table-column-header-text-wrap) {
  display: flex;
  align-items: center;
  min-width: 0;
  flex: 1;
}

.table-grid-shell :deep(.table-column-header-actions) {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  margin-left: auto;
  flex: 0 0 auto;
}

.table-grid-shell :deep(.table-column-menu-trigger) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 22px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: #64748b;
  cursor: pointer;
  padding: 0;
}

.table-grid-shell :deep(.table-column-menu-trigger:hover) {
  border-color: rgba(148, 163, 184, 0.35);
  background: rgba(226, 232, 240, 0.7);
  color: #0f172a;
}

.table-grid-shell :deep(.table-column-menu-trigger__dots) {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
}

.table-grid-shell :deep(.table-column-menu-trigger__dot) {
  width: 3px;
  height: 3px;
  border-radius: 999px;
  background: currentColor;
}
</style>
