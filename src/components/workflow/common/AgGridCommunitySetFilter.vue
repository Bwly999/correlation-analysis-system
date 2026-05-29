<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import type { IFilterParams } from 'ag-grid-community'
import { Search, X } from 'lucide-vue-next'

const props = defineProps<{
  params: IFilterParams
}>()

const selectedValues = ref<any[]>([])
const uniqueValues = ref<{ label: string; value: any }[]>([])
const searchText = ref('')

const updateUniqueValues = () => {
  const values = new Set<any>()
  props.params.api.forEachNode((node) => {
    const value = props.params.getValue(node)
    if (value !== null && value !== undefined && value !== '') {
      values.add(value)
    }
  })
  uniqueValues.value = Array.from(values)
    .sort()
    .map((v) => ({ label: String(v), value: v }))
}

// AG-Grid Filter Interface
const doesFilterPass = (params: any) => {
  const value = props.params.getValue(params.node)
  if (selectedValues.value.length === 0) return true
  return selectedValues.value.includes(value)
}

const isFilterActive = () => selectedValues.value.length > 0

const getModel = () => (isFilterActive() ? { values: selectedValues.value } : null)

const setModel = (model: any) => {
  selectedValues.value = model ? model.values : []
}

const filteredValues = computed(() => {
  const keyword = searchText.value.trim().toLowerCase()
  if (!keyword) return uniqueValues.value
  return uniqueValues.value.filter((item) => item.label.toLowerCase().includes(keyword))
})

onMounted(() => {
  updateUniqueValues()
})

// Expose methods for AG-Grid
defineExpose({
  doesFilterPass,
  isFilterActive,
  getModel,
  setModel,
})

const onSelectionChange = () => {
  props.params.filterChangedCallback()
}

const resetFilter = () => {
  selectedValues.value = []
  onSelectionChange()
}

const toggleValue = (value: any) => {
  selectedValues.value = selectedValues.value.includes(value)
    ? selectedValues.value.filter((item) => item !== value)
    : [...selectedValues.value, value]
  onSelectionChange()
}

const clearSearch = () => {
  searchText.value = ''
}
</script>

<template>
  <div
    class="ag-community-set-filter p-4 min-w-[260px] max-w-[320px] bg-white border border-slate-200 shadow-2xl rounded-xl flex flex-col gap-4 font-sans text-slate-900"
    @mousedown.stop
    @click.stop
  >
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-2">
        <div class="w-1.5 h-1.5 rounded-full bg-blue-600 shadow-[0_0_8px_rgba(37,99,235,0.5)]"></div>
        <span class="text-[10px] font-bold text-slate-500 uppercase tracking-[0.1em]">筛选数值</span>
      </div>
      <button
        type="button"
        class="text-xs font-medium text-slate-400 hover:text-blue-600 transition-colors cursor-pointer"
        @click="resetFilter"
      >
        重置
      </button>
    </div>

    <!-- Search Box -->
    <div class="relative group">
      <Search
        :size="14"
        class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors"
      />
      <input
        v-model="searchText"
        type="text"
        class="w-full pl-9 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all placeholder:text-slate-400"
        placeholder="搜索..."
      />
      <button
        v-if="searchText"
        type="button"
        class="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 rounded-md hover:bg-slate-100 transition-colors"
        @click="clearSearch"
      >
        <X :size="14" />
      </button>
    </div>

    <!-- Options List -->
    <div class="flex flex-col gap-0.5 max-h-[220px] overflow-y-auto pr-1 custom-scrollbar">
      <label
        v-for="item in filteredValues"
        :key="String(item.value)"
        class="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-slate-50 cursor-pointer transition-colors group"
      >
        <div class="relative flex items-center justify-center">
          <input
            type="checkbox"
            class="peer appearance-none w-4 h-4 border border-slate-300 rounded bg-white checked:bg-blue-600 checked:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all cursor-pointer"
            :checked="selectedValues.includes(item.value)"
            @change="toggleValue(item.value)"
          />
          <svg
            class="absolute w-2.5 h-2.5 text-white opacity-0 peer-checked:opacity-100 pointer-events-none transition-opacity"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="4"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <span class="text-sm text-slate-600 group-hover:text-slate-900 truncate transition-colors">
          {{ item.label }}
        </span>
      </label>

      <div v-if="filteredValues.length === 0" class="py-4 text-center">
        <p class="text-xs text-slate-400">没有匹配的数值</p>
      </div>
    </div>

    <!-- Footer -->
    <div class="pt-3 border-t border-slate-100">
      <p class="text-[10px] text-slate-400 italic leading-relaxed">
        提示: 自动识别当前列中已有的 {{ uniqueValues.length }} 个唯一值
      </p>
    </div>
  </div>
</template>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  width: 4px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: #e2e8f0;
  border-radius: 10px;
}
.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: #cbd5e1;
}
</style>
