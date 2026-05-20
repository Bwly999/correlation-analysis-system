<script setup lang="ts">
import { TrendingUp } from 'lucide-vue-next'

const model = defineModel<boolean>({ required: true })
</script>

<template>
  <div
    data-test="trend-line-toggle"
    class="absolute right-3 top-3 z-20 flex items-center gap-1 rounded-xl border border-slate-200 bg-white/95 p-1 shadow-sm backdrop-blur pointer-events-auto"
  >
    <button
      :data-test="`trend-line-${model ? 'active' : 'inactive'}`"
      title="切换趋势线"
      class="trend-line-button"
      :class="{ 'trend-line-button--active': model }"
      type="button"
      aria-label="切换趋势线"
      @click="model = !model"
    >
      <TrendingUp :size="14" />
    </button>
  </div>
</template>

<style scoped>
.trend-line-button {
  border: none;
  border-radius: 10px;
  padding: 6px;
  background: transparent;
  color: #64748b;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.trend-line-button--active {
  background: #0f172a;
  color: #ffffff;
}
</style>
