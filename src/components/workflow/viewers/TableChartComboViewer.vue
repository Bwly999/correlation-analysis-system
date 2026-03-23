<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { BarChart3, LayoutPanelTop, Rows3 } from 'lucide-vue-next'
import ChartViewer from './ChartViewer.vue'
import TableViewer from './TableViewer.vue'
import DataChart from '../DataChart.vue'
import {
  getResultChartOption,
  getResultGroups,
  getResultRows,
  normalizeWorkflowResult,
} from '../resultView'

const props = defineProps<{
  data: unknown
}>()

type ComboMode = 'chart' | 'table' | 'split'

const mode = ref<ComboMode>('split')
const normalizedResult = computed(() => normalizeWorkflowResult(props.data))
const explicitChartOption = computed(() => getResultChartOption(props.data))
const groups = computed(() => getResultGroups(props.data))
const rows = computed(() => getResultRows(props.data))
const fallbackChartData = computed(() => {
  if (groups.value.length > 0) return groups.value
  if (rows.value.length > 0) return rows.value
  return []
})
const hasChart = computed(() => Boolean(explicitChartOption.value) || fallbackChartData.value.length > 0)
const hasTable = computed(() => {
  const normalized = normalizedResult.value
  if (normalized?.kind === 'tableCollection') return true
  return rows.value.length > 0
})

watch(
  [hasChart, hasTable],
  ([nextHasChart, nextHasTable]) => {
    if (nextHasChart && nextHasTable) {
      if (!['chart', 'table', 'split'].includes(mode.value)) mode.value = 'split'
      return
    }

    if (nextHasTable) {
      mode.value = 'table'
      return
    }

    if (nextHasChart) {
      mode.value = 'chart'
    }
  },
  { immediate: true },
)
</script>

<template>
  <div class="h-full w-full p-4">
    <div class="h-full w-full bg-white rounded-xl border border-slate-200 overflow-hidden flex flex-col">
      <div class="px-4 py-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between gap-3">
        <div class="text-xs font-bold text-slate-500">
          组合预览
          <span v-if="hasChart && hasTable" class="text-slate-400">同时支持图表与表格</span>
        </div>
        <div class="flex items-center gap-2">
          <button
            data-test="combo-mode-chart"
            class="combo-mode-button"
            :class="{ 'combo-mode-button--active': mode === 'chart' }"
            :disabled="!hasChart"
            @click="mode = 'chart'"
          >
            <BarChart3 :size="14" />
            图表
          </button>
          <button
            data-test="combo-mode-table"
            class="combo-mode-button"
            :class="{ 'combo-mode-button--active': mode === 'table' }"
            :disabled="!hasTable"
            @click="mode = 'table'"
          >
            <Rows3 :size="14" />
            表格
          </button>
          <button
            data-test="combo-mode-split"
            class="combo-mode-button"
            :class="{ 'combo-mode-button--active': mode === 'split' }"
            :disabled="!hasChart || !hasTable"
            @click="mode = 'split'"
          >
            <LayoutPanelTop :size="14" />
            分屏
          </button>
        </div>
      </div>

      <div v-if="mode === 'split' && hasChart && hasTable" class="flex-1 min-h-0 grid grid-cols-2 gap-px bg-slate-200">
        <div class="min-h-0 bg-slate-50">
          <ChartViewer v-if="explicitChartOption" :data="props.data" />
          <DataChart v-else :data="fallbackChartData" />
        </div>
        <div class="min-h-0 bg-slate-50">
          <TableViewer :data="props.data" />
        </div>
      </div>

      <div v-else-if="mode === 'chart' && hasChart" class="flex-1 min-h-0 bg-slate-50">
        <ChartViewer v-if="explicitChartOption" :data="props.data" />
        <DataChart v-else :data="fallbackChartData" />
      </div>

      <div v-else-if="mode === 'table' && hasTable" class="flex-1 min-h-0 bg-slate-50">
        <TableViewer :data="props.data" />
      </div>

      <div v-else class="flex-1 min-h-0 flex items-center justify-center text-sm font-medium text-slate-400 bg-slate-50">
        当前结果缺少可展示的图表或表格数据
      </div>
    </div>
  </div>
</template>

<style scoped>
.combo-mode-button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border: 1px solid #cbd5e1;
  border-radius: 10px;
  background: #fff;
  color: #475569;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.combo-mode-button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.combo-mode-button--active {
  border-color: #2563eb;
  background: #eff6ff;
  color: #2563eb;
}
</style>
