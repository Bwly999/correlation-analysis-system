<script setup lang="ts">
import { HelpCircle } from 'lucide-vue-next'

const model = defineModel<boolean>({ required: true })
</script>

<template>
  <div class="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-100 rounded-lg shadow-sm">
    <label
      data-test="chart-skip-invalid-label"
      class="chart-checkbox-label"
      :class="{ 'chart-checkbox-label--active': model }"
    >
      <input
        data-test="chart-skip-invalid-checkbox"
        v-model="model"
        type="checkbox"
        class="chart-checkbox-input"
      />
      <span class="text-[11px] font-bold text-slate-600 whitespace-nowrap">异常值过滤</span>
    </label>
    <HelpCircle
      data-test="chart-skip-invalid-help"
      title="开启后，折线图会按当前选中因子整行跳过异常样本；箱线图和正态分布仍按列单独忽略异常值。"
      :size="13"
      class="chart-help-icon"
    />
  </div>
</template>

<style scoped>
.chart-checkbox-label {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  user-select: none;
}

.chart-checkbox-label--active span {
  color: #0f172a;
}

.chart-checkbox-input {
  width: 14px;
  height: 14px;
  margin: 0;
  accent-color: #2563eb;
  cursor: pointer;
}

.chart-help-icon {
  color: #94a3b8;
  cursor: help;
  flex-shrink: 0;
}
</style>
