<script setup lang="ts">
import { computed } from 'vue'
import { getResultRows, getResultSchemaFields } from '../resultView'

const props = defineProps<{
  data: unknown
}>()

const PAGE_SIZE_OPTIONS = [20, 50, 100]

const rows = computed(() => getResultRows(props.data))
const fields = computed(() => {
  const schemaFields = getResultSchemaFields(props.data)
  if (schemaFields.length > 0) return schemaFields.map((field) => field.name)

  const firstRow = rows.value[0]
  return firstRow ? Object.keys(firstRow) : []
})

const pageSize = defineModel<number>('pageSize', { default: 50 })
const currentPage = defineModel<number>('page', { default: 1 })

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
          <div class="text-xs font-bold text-slate-500">
            当前显示第 {{ pageStart }} - {{ pageEnd }} 条，共 {{ rows.length }} 条
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
          <table class="min-w-full text-sm text-left text-slate-700">
            <thead class="sticky top-0 bg-slate-50 z-10">
              <tr>
                <th
                  v-for="field in fields"
                  :key="field"
                  class="px-4 py-3 text-xs font-black tracking-wide text-slate-500 uppercase border-b border-slate-200"
                >
                  {{ field }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(row, rowIndex) in pagedRows"
                :key="rowIndex"
                data-test="table-row"
                class="border-b border-slate-100 hover:bg-slate-50/80"
              >
                <td
                  v-for="field in fields"
                  :key="field"
                  class="px-4 py-3 align-top whitespace-pre-wrap break-all"
                >
                  {{ row[field] ?? '-' }}
                </td>
              </tr>
            </tbody>
          </table>
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

.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

.custom-scrollbar::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  border-radius: 999px;
}
</style>
