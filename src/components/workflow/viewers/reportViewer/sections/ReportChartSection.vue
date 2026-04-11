<script setup lang="ts">
import VChart from 'vue-echarts'
import type { ReportChartOption, ReportChartSection } from '../reportTypes'

defineProps<{
  section: ReportChartSection
  selectedValue: string
  labelTruncateLength: number
  toggleValue: boolean
  option: ReportChartOption
}>()

const emit = defineEmits<{
  updateSelectedValue: [value: string]
  updateLabelTruncateLength: [value: number]
  updateToggleValue: [value: boolean]
}>()

const handleSelectChange = (event: Event) => {
  emit('updateSelectedValue', String((event.target as HTMLSelectElement).value))
}

const handleLabelTruncateInput = (event: Event) => {
  emit('updateLabelTruncateLength', Number((event.target as HTMLInputElement).value || 0))
}

const handleToggleChange = (event: Event) => {
  emit('updateToggleValue', (event.target as HTMLInputElement).checked)
}
</script>

<template>
  <section class="space-y-4">
    <div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
      <div>
        <h2 class="text-lg font-bold text-slate-800">{{ section.title }}</h2>
        <p v-if="section.key === 'importance'" class="mt-1 text-sm text-slate-500">
          默认按 SHAP 重要性从高到低排序，可作为浏览全量因子的导航入口。
        </p>
      </div>
      <div
        v-if="section.controls?.select || section.controls?.labelTruncate || section.controls?.toggle"
        class="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2"
      >
        <label
          v-if="section.controls?.select"
          class="flex items-center gap-2 text-sm font-medium text-slate-600"
        >
          <span>{{ section.controls.select.label || '切换维度' }}</span>
          <select
            data-test="report-select"
            class="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none"
            :value="selectedValue"
            @change="handleSelectChange"
          >
            <option
              v-for="optionItem in section.controls.select.options || []"
              :key="optionItem"
              :value="optionItem"
            >
              {{ optionItem }}
            </option>
          </select>
        </label>
        <label
          v-if="section.controls?.labelTruncate"
          class="flex items-center gap-2 text-sm font-medium text-slate-600"
        >
          <span>{{ section.controls.labelTruncate.label || '标签截断' }}</span>
          <input
            data-test="report-label-truncate-input"
            type="number"
            min="1"
            class="w-20 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none"
            :value="labelTruncateLength"
            @input="handleLabelTruncateInput"
          />
        </label>
        <label
          v-if="section.controls?.toggle"
          class="flex items-center gap-2 text-sm font-medium text-slate-600"
        >
          <span>{{ section.controls.toggle.label || '显示数值' }}</span>
          <input
            :data-test="`report-toggle-${section.controls.toggle.modelKey || 'toggle'}`"
            type="checkbox"
            class="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            :checked="toggleValue"
            @change="handleToggleChange"
          />
        </label>
      </div>
    </div>
    <div class="h-[400px] w-full rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
      <VChart :option="option" autoresize />
    </div>
  </section>
</template>
