<script setup lang="ts">
import { ref, onMounted } from 'vue'
import type { IFilterParams } from 'ag-grid-community'
import MultiSelect from 'primevue/multiselect'

const props = defineProps<{
  params: IFilterParams
}>()

const selectedValues = ref<any[]>([])
const uniqueValues = ref<{ label: string; value: any }[]>([])

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
</script>

<template>
  <div class="ag-community-set-filter p-3 min-w-[240px] bg-white border border-slate-200 shadow-xl rounded-xl flex flex-col gap-3">
    <div class="flex items-center justify-between">
      <span class="text-[11px] font-bold text-slate-400 uppercase tracking-widest">筛选值</span>
      <button 
        type="button"
        class="text-[11px] text-blue-600 font-semibold hover:text-blue-700 transition-colors"
        @click="resetFilter"
      >
        重置
      </button>
    </div>
    
    <MultiSelect
      v-model="selectedValues"
      :options="uniqueValues"
      option-label="label"
      option-value="value"
      placeholder="全部数值"
      class="w-full !border-slate-200 !shadow-sm !rounded-lg"
      display="chip"
      :max-selected-labels="2"
      filter
      @change="onSelectionChange"
    />
    
    <div class="text-[10px] text-slate-400 italic">
      提示: 自动识别当前列中已有的 {{ uniqueValues.length }} 个唯一值
    </div>
  </div>
</template>

<style scoped>
.ag-community-set-filter :deep(.p-multiselect-label) {
  padding: 6px 10px;
  font-size: 13px;
}
.ag-community-set-filter :deep(.p-multiselect-panel) {
  border-radius: 12px;
  box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
}
</style>
