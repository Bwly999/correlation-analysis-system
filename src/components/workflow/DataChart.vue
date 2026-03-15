<script setup lang="ts">
import { ref, computed, watch, markRaw, shallowRef } from 'vue'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { LineChart, BoxplotChart } from 'echarts/charts'
import {
  GridComponent,
  TooltipComponent,
  TitleComponent,
  LegendComponent,
  DataZoomComponent,
  DatasetComponent,
  TransformComponent,
} from 'echarts/components'
import Select from 'primevue/select'
import MultiSelect from 'primevue/multiselect'
import InputNumber from 'primevue/inputnumber'
import {
  Settings2,
  ListChecks,
  LineChart as LineChartIcon,
  BoxSelect,
  Layers,
} from 'lucide-vue-next'
import { calculateBoxValues } from '@/utils/stats'

use([
  CanvasRenderer,
  LineChart,
  BoxplotChart,
  GridComponent,
  TooltipComponent,
  TitleComponent,
  LegendComponent,
  DataZoomComponent,
  DatasetComponent,
  TransformComponent,
])

const props = defineProps<{
  data: any[]
}>()

const chartType = ref('line')
const maxPoints = ref(5000)
const selectedKeys = ref<string[]>([])
const chartRef = shallowRef<any>(null)

// 检查是否为 Parallel Collection 格式
const isGroupedData = computed(() => {
  return (
    Array.isArray(props.data) &&
    props.data.length > 0 &&
    props.data[0] &&
    typeof props.data[0] === 'object' &&
    'name' in props.data[0] &&
    'data' in props.data[0]
  )
})

const chartTypes = computed(() => {
  if (isGroupedData.value) {
    return [{ label: '多组因子对比', value: 'boxplot', icon: markRaw(Layers) }]
  }
  return [
    { label: '折线云图', value: 'line', icon: markRaw(LineChartIcon) },
    { label: '箱线分布', value: 'boxplot', icon: markRaw(BoxSelect) },
  ]
})

// 初始化时，如果数据是分组的，强制设为 boxplot
watch(
  isGroupedData,
  (grouped) => {
    if (grouped) chartType.value = 'boxplot'
  },
  { immediate: true },
)

const availableKeys = computed(() => {
  if (!Array.isArray(props.data) || props.data.length === 0) return []

  if (isGroupedData.value) {
    // 提取所有分组中共同拥有的数值字段
    const groupFields = props.data
      .map((g) => {
        const firstRow = Array.isArray(g.data) ? g.data[0] : null
        return firstRow ? Object.keys(firstRow).filter((k) => typeof firstRow[k] === 'number') : []
      })
      .filter((fields) => fields.length > 0)

    if (groupFields.length === 0) return []
    // 取交集
    return groupFields.reduce((a, b) => a.filter((c) => b.includes(c)))
  }

  return Object.keys(props.data[0]).filter((k) => typeof props.data[0][k] === 'number')
})

watch(
  availableKeys,
  (newKeys) => {
    if (newKeys.length > 0 && selectedKeys.value.length === 0) {
      selectedKeys.value = [newKeys[0]]
    }
  },
  { immediate: true },
)

const chartOption = computed(() => {
  const sourceData = props.data || []
  const keys = selectedKeys.value.length > 0 ? selectedKeys.value : availableKeys.value.slice(0, 1)
  if (keys.length === 0) return {}

  const option: any = {
    animation: false,
    useDirtyRect: true,
    backgroundColor: 'transparent',
    hoverLayer: true,
    color: ['#4f46e5', '#10b981', '#f59e0b', '#ec4899', '#06b6d4', '#8b5cf6', '#ef4444', '#14b8a6'],
    tooltip: {
      trigger: 'item',
      confine: true,
      extraCssText: 'box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1); border-radius: 12px;',
    },
    legend: {
      show: true,
      top: 0,
      icon: 'roundRect',
      textStyle: { color: '#64748b', fontSize: 11, fontWeight: '600' },
    },
    grid: { left: '3%', right: '3%', top: '15%', bottom: '20%', containLabel: true },
    dataZoom: [
      { type: 'inside', xAxisIndex: [0] },
      {
        type: 'slider',
        xAxisIndex: [0],
        bottom: 10,
        height: 20,
        borderColor: 'transparent',
        backgroundColor: '#f8fafc',
        fillerColor: 'rgba(79, 70, 229, 0.1)',
        handleStyle: { color: '#4f46e5' },
        textStyle: { color: '#94a3b8', fontSize: 10 },
      },
    ],
    xAxis: {
      type: 'category',
      data: keys, // X轴显示选中的因子
      axisLabel: { fontSize: 11, color: '#64748b', fontWeight: '500' },
      axisLine: { lineStyle: { color: '#e2e8f0' } },
    },
    yAxis: {
      type: 'value',
      scale: true,
      boundaryGap: ['15%', '15%'],
      axisLabel: { fontSize: 10, color: '#94a3b8' },
      splitLine: { lineStyle: { color: '#f1f5f9', type: 'dashed' } },
    },
    series: [],
  }

  if (isGroupedData.value) {
    // 分组模式：每个数据源一个 Series
    option.series = sourceData.map((group: any) => ({
      name: group.name,
      type: 'boxplot',
      data: keys.map((key) => calculateBoxValues(group.data || [], key)),
      itemStyle: {
        borderWidth: 1.5,
      },
      emphasis: {
        itemStyle: {
          borderWidth: 2,
          shadowBlur: 10,
          shadowColor: 'rgba(0,0,0,0.1)',
        },
      },
    }))
  } else {
    // 单表模式
    if (chartType.value === 'boxplot') {
      option.series = [
        {
          name: '数据分布',
          type: 'boxplot',
          data: keys.map((key) => calculateBoxValues(sourceData, key)),
          itemStyle: { color: '#f8fafc', borderColor: '#4f46e5', borderWidth: 1.5 },
        },
      ]
    } else {
      // 折线模式
      const rows = sourceData.slice(0, maxPoints.value)
      option.tooltip.trigger = 'axis'
      option.xAxis.data = Array.from({ length: rows.length }, (_, i) => i + 1)
      option.series = keys.map((key) => ({
        name: key,
        type: 'line',
        data: rows.map((r) => (typeof r[key] === 'number' ? r[key] : 0)),
        showSymbol: false,
        lineStyle: { width: 2.5 },
        sampling: 'lttb',
        large: true,
      }))
    }
  }

  return markRaw(option)
})
</script>

<template>
  <div
    class="flex flex-col h-full bg-white rounded-2xl overflow-hidden border border-slate-100 shadow-sm"
  >
    <!-- Toolbar -->
    <div
      class="flex items-center justify-between px-6 py-4 border-b border-slate-50 bg-slate-50/30"
    >
      <div class="flex items-center gap-4">
        <div
          class="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-100 rounded-lg shadow-sm"
        >
          <ListChecks size="14" class="text-indigo-500" />
          <span class="text-[10px] font-black text-slate-400 uppercase tracking-widest"
            >分析因子</span
          >
          <MultiSelect
            v-model="selectedKeys"
            :options="availableKeys"
            placeholder="选择对比因子"
            class="property-select"
            :filter="true"
            :max-selected-labels="3"
          />
        </div>

        <div
          v-if="!isGroupedData"
          class="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-100 rounded-lg shadow-sm"
        >
          <Settings2 size="14" class="text-slate-400" />
          <span class="text-[10px] font-black text-slate-400 uppercase tracking-widest">采样</span>
          <InputNumber
            v-model="maxPoints"
            :min="100"
            :max="50000"
            class="filter-input w-20"
            :use-grouping="false"
          />
        </div>
      </div>

      <Select
        v-model="chartType"
        :options="chartTypes"
        option-label="label"
        option-value="value"
        class="chart-type-select"
        :disabled="isGroupedData"
      >
        <template #value="slotProps">
          <div v-if="slotProps.value" class="flex items-center gap-2 text-slate-800">
            <component
              :is="chartTypes.find((c) => c.value === slotProps.value)?.icon"
              size="14"
              stroke-width="2.5"
            />
            <span>{{ chartTypes.find((c) => c.value === slotProps.value)?.label }}</span>
          </div>
        </template>
        <template #option="slotProps">
          <div
            class="flex items-center gap-2 font-bold text-[11px] uppercase tracking-widest text-slate-500 w-full"
          >
            <component :is="slotProps.option.icon" size="14" class="text-slate-700" />
            <span>{{ slotProps.option.label }}</span>
          </div>
        </template>
      </Select>
    </div>

    <!-- Chart -->
    <div class="flex-1 p-4 relative">
      <div v-if="isGroupedData || (props.data && props.data.length > 0)" class="h-full w-full">
        <VChart ref="chartRef" :option="chartOption" autoresize />
      </div>
    </div>
  </div>
</template>

<style scoped>
:deep(.filter-input .p-inputnumber-input) {
  padding: 2px 8px;
  font-size: 11px;
  width: 60px;
  border: none;
  background: #f8fafc;
  border-radius: 4px;
  font-family: monospace;
}
:deep(.chart-type-select) {
  height: 32px;
  font-size: 11px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border: 1px solid #e2e8f0;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
  border-radius: 8px;
  background: #fdfdfe;
  transition: all 0.2s ease;
}
:deep(.chart-type-select:hover:not(.p-disabled)) {
  border-color: #94a3b8;
  background: #f8fafc;
}
:deep(.chart-type-select .p-select-label) {
  padding: 4px 12px;
  display: flex;
  align-items: center;
}
:deep(.chart-type-select .p-select-dropdown) {
  width: 28px;
  color: #94a3b8;
}
:deep(.property-select) {
  height: 28px;
  min-width: 160px;
  max-width: 300px;
  font-size: 11px;
  font-weight: 700;
  border-color: #f1f5f9;
  background: #f8fafc;
}
:deep(.property-select .p-multiselect-label) {
  padding: 2px 8px;
  display: flex;
  align-items: center;
}
</style>
