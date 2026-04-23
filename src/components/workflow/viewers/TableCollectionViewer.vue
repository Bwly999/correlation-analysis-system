<script setup lang="ts">
import { computed, watch } from 'vue'
import { useScopedResultPreviewStorage } from '../useScopedResultPreviewStorage'
import { getResultGroups } from '../resultView'

const props = defineProps<{
  data: unknown
  storageScopeKey?: string
}>()

const groups = computed(() => getResultGroups(props.data))
const activeGroupName = useScopedResultPreviewStorage(props.storageScopeKey, 'table-collection-group', '')

watch(
  groups,
  (nextGroups) => {
    if (nextGroups.length === 0) {
      activeGroupName.value = ''
      return
    }

    if (!nextGroups.some((group) => group.name === activeGroupName.value)) {
      activeGroupName.value = nextGroups[0]!.name
    }
  },
  { immediate: true },
)

const activeGroup = computed(
  () => groups.value.find((group) => group.name === activeGroupName.value) ?? groups.value[0] ?? null,
)

const fields = computed(() => {
  const firstRow = activeGroup.value?.data[0]
  return firstRow ? Object.keys(firstRow) : []
})
</script>

<template>
  <div class="flex h-full min-h-0 w-full flex-col overflow-hidden">
    <div class="flex h-full min-h-0 w-full flex-col overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div
        v-if="groups.length === 0"
        class="flex-1 flex items-center justify-center text-sm font-medium text-slate-400"
      >
        暂无分组结果
      </div>
      <template v-else>
        <div class="px-4 pt-4 pb-3 border-b border-slate-100 flex items-center gap-2 overflow-x-auto">
          <button
            v-for="group in groups"
            :key="group.name"
            type="button"
            class="px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors whitespace-nowrap cursor-pointer"
            :class="
              group.name === activeGroupName
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
            "
            @click="activeGroupName = group.name"
          >
            {{ group.name }} ({{ group.data.length }})
          </button>
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
                v-for="(row, rowIndex) in activeGroup?.data ?? []"
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
      </template>
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
