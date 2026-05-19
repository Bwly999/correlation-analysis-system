<script setup lang="ts">
import InputNumber from 'primevue/inputnumber'
import { PanelRightClose, PanelRightOpen } from 'lucide-vue-next'
import ChartFilterPresetPanel from './ChartFilterPresetPanel.vue'
import type { ChartFilterPreset } from '../types'

const lowerBound = defineModel<number | string | null>('lowerBound', { required: true })
const upperBound = defineModel<number | string | null>('upperBound', { required: true })
const isPresetPanelOpen = defineModel<boolean>('isPresetPanelOpen', { required: true })
const presetNameInput = defineModel<string>('presetNameInput', { required: true })

defineProps<{
  filteredSummary: number
  presets: ChartFilterPreset[]
  selectedPresetId: string | null
  defaultPresetId: string | 'none' | null
}>()

const emit = defineEmits<{
  savePreset: []
  applyPreset: [preset: ChartFilterPreset]
  deletePreset: [presetId: string]
  markDefault: []
  setNoDefault: []
}>()
</script>

<template>
  <div class="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-100 rounded-lg shadow-sm">
    <span class="text-[10px] font-black text-slate-400 uppercase tracking-widest">过滤</span>
    <InputNumber
      v-model="lowerBound"
      input-id="chart-lower-bound"
      class="filter-input w-24"
      :step="0.01"
      :max-fraction-digits="10"
      :use-grouping="false"
      placeholder="下限"
    />
    <span class="text-xs font-bold text-slate-300">~</span>
    <InputNumber
      v-model="upperBound"
      input-id="chart-upper-bound"
      class="filter-input w-24"
      :step="0.01"
      :max-fraction-digits="10"
      :use-grouping="false"
      placeholder="上限"
    />
    <span class="text-[10px] font-bold text-slate-400 whitespace-nowrap">{{ filteredSummary }} 条</span>
    <div class="relative flex items-center">
      <button
        data-test="chart-filter-presets-trigger"
        class="preset-trigger-button"
        :class="{ 'preset-trigger-button--active': isPresetPanelOpen }"
        :data-state="isPresetPanelOpen ? 'open' : 'closed'"
        type="button"
        @click="isPresetPanelOpen = !isPresetPanelOpen"
      >
        <PanelRightClose v-if="isPresetPanelOpen" :size="14" />
        <PanelRightOpen v-else :size="14" />
      </button>

      <ChartFilterPresetPanel
        v-if="isPresetPanelOpen"
        v-model:preset-name="presetNameInput"
        :presets="presets"
        :selected-preset-id="selectedPresetId"
        :default-preset-id="defaultPresetId"
        @save="emit('savePreset')"
        @apply="emit('applyPreset', $event)"
        @delete="emit('deletePreset', $event)"
        @mark-default="emit('markDefault')"
        @no-default="emit('setNoDefault')"
      />
    </div>
  </div>
</template>

<style scoped>
.preset-trigger-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 1px solid #dbeafe;
  border-radius: 8px;
  background: #eff6ff;
  color: #2563eb;
  cursor: pointer;
}

.preset-trigger-button--active {
  border-color: #1d4ed8;
  background: #2563eb;
  color: #ffffff;
  box-shadow: 0 8px 18px -12px rgba(37, 99, 235, 0.7);
}
</style>
