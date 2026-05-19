<script setup lang="ts">
import InputNumber from 'primevue/inputnumber'

const model = defineModel<number>({ required: true })
</script>

<template>
  <div class="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-100 rounded-lg shadow-sm">
    <span class="text-[10px] font-black text-slate-400 uppercase tracking-widest">采样</span>
    <InputNumber
      v-model="model"
      :min="100"
      :max="50000"
      class="filter-input w-20"
      :use-grouping="false"
    />
  </div>
</template>
