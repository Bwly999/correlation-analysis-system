<script setup lang="ts">
import type { NormalizationMethod } from '../types'
import { CHART_VIEW_MODE_OPTIONS, NORMALIZATION_METHOD_OPTIONS } from '../constants'

const viewMode = defineModel<'raw' | 'normalized'>('viewMode', { required: true })
const normalizationMethod = defineModel<NormalizationMethod>('normalizationMethod', { required: true })

defineProps<{
  isNormalizedView: boolean
}>()
</script>

<template>
  <template>
    <div class="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-100 rounded-lg shadow-sm">
      <span class="text-[10px] font-black text-slate-400 uppercase tracking-widest">对比</span>
      <div class="segmented-toggle-group">
        <button
          v-for="modeOption in CHART_VIEW_MODE_OPTIONS"
          :key="modeOption.value"
          :data-test="`chart-view-mode-${modeOption.value}`"
          class="segmented-toggle-button"
          :class="{ 'segmented-toggle-button--active': viewMode === modeOption.value }"
          :data-state="viewMode === modeOption.value ? 'active' : 'inactive'"
          type="button"
          @click="viewMode = modeOption.value"
        >
          {{ modeOption.label }}
        </button>
      </div>
    </div>

    <div
      v-if="isNormalizedView"
      class="flex items-center gap-2 px-3 py-1.5 bg-blue-50 border border-blue-100 rounded-lg shadow-sm"
    >
      <span class="text-[10px] font-black text-blue-600 uppercase tracking-widest">方式</span>
      <div class="segmented-toggle-group">
        <button
          v-for="methodOption in NORMALIZATION_METHOD_OPTIONS"
          :key="methodOption.value"
          :data-test="`chart-normalization-method-${methodOption.value}`"
          class="segmented-toggle-button segmented-toggle-button--compact"
          :class="{ 'segmented-toggle-button--active': normalizationMethod === methodOption.value }"
          :data-state="normalizationMethod === methodOption.value ? 'active' : 'inactive'"
          type="button"
          @click="normalizationMethod = methodOption.value"
        >
          {{ methodOption.label }}
        </button>
      </div>
      <span class="text-[10px] font-bold text-blue-600/80 whitespace-nowrap">仅图表显示归一化，过滤仍按原始值生效</span>
    </div>
  </template>
</template>

<style scoped>
.segmented-toggle-group {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px;
  border-radius: 10px;
  background: #f8fafc;
}

.segmented-toggle-button {
  border: none;
  border-radius: 8px;
  padding: 6px 10px;
  background: transparent;
  color: #64748b;
  font-size: 11px;
  font-weight: 800;
  cursor: pointer;
}

.segmented-toggle-button--compact {
  padding: 5px 8px;
}

.segmented-toggle-button--active {
  background: #2563eb;
  color: #ffffff;
}
</style>
