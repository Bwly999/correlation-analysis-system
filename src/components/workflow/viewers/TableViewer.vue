<script setup lang="ts">
import { computed } from 'vue'
import AgGridTablePreview from './AgGridTablePreview.vue'
import { useTablePreviewGridModel } from './useTablePreviewGridModel'

const props = defineProps<{
  data: unknown
}>()

defineModel<number>('pageSize', { default: 50 })
defineModel<number>('page', { default: 1 })

const {
  rowData,
  fieldCount,
  defaultColDef,
  columnDefs,
  handleColumnResized,
} = useTablePreviewGridModel({
  data: computed(() => props.data),
})

const summaryText = computed(() => `共 ${rowData.value.length} 条，${fieldCount.value} 个字段`)
</script>

<template>
  <div class="h-full w-full">
    <div class="h-full w-full bg-white rounded-xl border border-slate-200 overflow-hidden flex flex-col">
      <div
        v-if="rowData.length === 0"
        class="h-full flex items-center justify-center text-sm font-medium text-slate-400"
      >
        暂无表格结果
      </div>
      <template v-else>
        <div class="px-4 py-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between gap-3">
          <div class="text-xs font-bold text-slate-500">
            {{ summaryText }}
          </div>
          <div class="text-[11px] font-semibold text-slate-400">
            整表虚拟滚动预览
          </div>
        </div>

        <div class="flex-1 min-h-0 bg-white">
          <AgGridTablePreview
            :row-data="rowData"
            :column-defs="columnDefs"
            :default-col-def="defaultColDef"
            @column-resized="handleColumnResized"
          />
        </div>
      </template>
    </div>
  </div>
</template>
