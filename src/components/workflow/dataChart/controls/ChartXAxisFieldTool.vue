<script setup lang="ts">
import SearchAppendSelect from '../../common/SearchAppendSelect.vue'

const model = defineModel<string | null>({ required: true })

defineProps<{
  options: string[]
  appendTo?: HTMLElement | string
}>()
</script>

<template>
  <div class="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-100 rounded-lg shadow-sm">
    <span class="text-[10px] font-black text-slate-400 uppercase tracking-widest">X轴</span>
    <SearchAppendSelect
      v-model="model"
      :options="options"
      :append-to="appendTo"
      placeholder="选择X轴字段"
      select-class="property-select chart-axis-select"
      select-test-id="chart-x-field-select"
      clear-button-test-id="chart-x-field-clear"
    />
  </div>
</template>
