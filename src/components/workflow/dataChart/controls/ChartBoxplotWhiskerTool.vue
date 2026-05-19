<script setup lang="ts">
import type { BoxplotWhiskerMode } from '@/utils/stats'
import { BOXPLOT_WHISKER_MODE_OPTIONS } from '../constants'

const model = defineModel<BoxplotWhiskerMode>({ required: true })
</script>

<template>
  <div
    data-test="boxplot-whisker-mode-toggle"
    class="absolute right-3 top-3 z-10 flex items-center gap-1 rounded-xl border border-slate-200 bg-white/95 p-1 shadow-sm backdrop-blur"
  >
    <button
      v-for="modeOption in BOXPLOT_WHISKER_MODE_OPTIONS"
      :key="modeOption.value"
      :data-test="`boxplot-whisker-mode-${modeOption.value}`"
      class="boxplot-mode-button"
      :class="{ 'boxplot-mode-button--active': model === modeOption.value }"
      :data-state="model === modeOption.value ? 'active' : 'inactive'"
      type="button"
      @click="model = modeOption.value"
    >
      {{ modeOption.label }}
    </button>
  </div>
</template>

<style scoped>
.boxplot-mode-button {
  border: none;
  border-radius: 10px;
  padding: 6px 10px;
  background: transparent;
  color: #64748b;
  font-size: 11px;
  font-weight: 800;
  cursor: pointer;
}

.boxplot-mode-button--active {
  background: #0f172a;
  color: #ffffff;
}
</style>
