<script setup lang="ts">
import { AgGridVue } from 'ag-grid-vue3'
import {
  AllCommunityModule,
  ModuleRegistry,
  type ColDef,
  type ColumnResizedEvent,
} from 'ag-grid-community'
import 'ag-grid-community/styles/ag-grid.css'
import 'ag-grid-community/styles/ag-theme-quartz.css'

type TableRow = Record<string, unknown>

let modulesRegistered = false
if (!modulesRegistered) {
  ModuleRegistry.registerModules([AllCommunityModule])
  modulesRegistered = true
}

defineProps<{
  rowData: TableRow[]
  columnDefs: ColDef<TableRow>[]
  defaultColDef: ColDef<TableRow>
}>()

const emit = defineEmits<{
  columnResized: [event: ColumnResizedEvent<TableRow>]
}>()
</script>

<template>
  <div data-test="table-grid-shell" class="ag-theme-quartz table-grid-shell h-full w-full">
    <AgGridVue
      class="h-full w-full"
      :row-data="rowData"
      :column-defs="columnDefs"
      :default-col-def="defaultColDef"
      :animate-rows="false"
      :row-buffer="4"
      :suppress-column-virtualisation="false"
      :suppress-row-virtualisation="false"
      :tooltip-show-delay="200"
      :suppress-cell-focus="true"
      @column-resized="emit('columnResized', $event)"
    />
  </div>
</template>

<style scoped>
.table-grid-shell {
  --ag-font-family: ui-sans-serif, system-ui, sans-serif;
  --ag-font-size: 13px;
  --ag-header-height: 42px;
  --ag-row-height: 36px;
  --ag-border-color: #e2e8f0;
  --ag-header-background-color: #f8fafc;
  --ag-header-foreground-color: #64748b;
  --ag-background-color: #ffffff;
  --ag-foreground-color: #0f172a;
  --ag-row-border-color: #f1f5f9;
}

.table-grid-shell :deep(.ag-root-wrapper) {
  border: none;
}

.table-grid-shell :deep(.ag-header-cell-label) {
  font-weight: 800;
}
</style>
