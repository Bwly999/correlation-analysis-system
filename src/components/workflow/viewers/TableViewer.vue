<script setup lang="ts">
import { computed } from 'vue'
import { getResultRows, getResultSchemaFields } from '../resultView'

const props = defineProps<{
  data: unknown
}>()

const rows = computed(() => getResultRows(props.data))
const fields = computed(() => {
  const schemaFields = getResultSchemaFields(props.data)
  if (schemaFields.length > 0) return schemaFields.map((field) => field.name)

  const firstRow = rows.value[0]
  return firstRow ? Object.keys(firstRow) : []
})
</script>

<template>
  <div class="h-full w-full p-4">
    <div class="h-full w-full bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div
        v-if="rows.length === 0"
        class="h-full flex items-center justify-center text-sm font-medium text-slate-400"
      >
        暂无表格结果
      </div>
      <div v-else class="h-full overflow-auto custom-scrollbar">
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
              v-for="(row, rowIndex) in rows"
              :key="rowIndex"
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
    </div>
  </div>
</template>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

.custom-scrollbar::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  border-radius: 999px;
}
</style>
