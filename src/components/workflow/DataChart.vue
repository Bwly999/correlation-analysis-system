<script setup lang="ts">
import { ref, computed, watch, markRaw, onUnmounted, shallowRef } from 'vue'
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
  DatasetComponent, // 引入数据管理组件
  TransformComponent
} from 'echarts/components'
import Select from 'primevue/select'
import MultiSelect from 'primevue/multiselect'
import InputNumber from 'primevue/inputnumber'
import { Settings2, Filter, ListChecks, LineChart as LineChartIcon, BoxSelect } from 'lucide-vue-next'

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
  TransformComponent
])

const props = defineProps<{
  data: any[]
}>()

const chartType = ref('line')
const maxPoints = ref(5000)
const minFilter = ref<number | null>(null)
const maxFilter = ref<number | null>(null)
const selectedKeys = ref<string[]>([])
const chartRef = shallowRef<any>(null)

const chartTypes = [
  { label: '折线云图', value: 'line', icon: markRaw(LineChartIcon) },
  { label: '箱线分布', value: 'boxplot', icon: markRaw(BoxSelect) }
]

const availableKeys = computed(() => {
  if (!Array.isArray(props.data) || props.data.length === 0) return []
  return Object.keys(props.data[0]).filter(k => typeof props.data[0][k] === 'number')
})

watch(availableKeys, (newKeys) => {
  if (newKeys.length > 0 && selectedKeys.value.length === 0) {
    selectedKeys.value = [newKeys[0]]
  }
}, { immediate: true })

// 极速数据预处理
const processedData = computed(() => {
  const sourceData = props.data || []
  if (sourceData.length === 0) return { rows: [], keys: [], yExtent: [0, 100] }
  
  const limit = maxPoints.value
  const keys = selectedKeys.value.length > 0 ? selectedKeys.value : (availableKeys.value.length > 0 ? [availableKeys.value[0]] : [])
  
  // 采样减少计算量
  let rows = sourceData.slice(0, limit)
  
  // 过滤逻辑
  if (minFilter.value !== null || maxFilter.value !== null) {
    rows = rows.filter(item => {
      return keys.some(key => {
        const val = item[key]
        return (minFilter.value === null || val >= minFilter.value) && 
               (maxFilter.value === null || val <= maxFilter.value)
      })
    })
  }

  // 预计算 Y 轴极值以稳定坐标轴
  let min = Infinity, max = -Infinity
  for (let i = 0; i < rows.length; i++) {
    for (let j = 0; j < keys.length; j++) {
      const val = rows[i][keys[j]]
      if (val < min) min = val
      if (val > max) max = val
    }
  }
  
  // 性能与视觉双重优化：增加 20% 的上下缓冲。
  // 1. 视觉上让图形不“顶天立地”，增加呼吸感。
  // 2. 性能上，保证剧烈波动的连线绝对处于 Canvas 渲染区内部，彻底免除底层极其昂贵的边缘裁剪(Clipping)计算。
  const padding = (max - min) * 0.2 || 1
  return { 
    rows, 
    keys, 
    yExtent: [min - padding, max + padding] 
  }
})

// 使用 Dataset API 构建配置
const chartOption = computed(() => {
  const { rows, keys, yExtent } = processedData.value
  if (rows.length === 0 || keys.length === 0) return {}

  const isBoxplot = chartType.value === 'boxplot'
  const count = rows.length
  
  // 核心优化配置
  const option: any = {
    animation: false,
    useDirtyRect: true,
    backgroundColor: 'transparent',
    hoverLayer: true,
    color: ['#4f46e5', '#10b981', '#f59e0b', '#ec4899', '#06b6d4', '#8b5cf6', '#ef4444', '#14b8a6', '#f97316', '#6366f1'],
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'line', animation: false, lineStyle: { width: 1.5, type: 'dashed', color: '#94a3b8' } },
      confine: true,
      transitionDuration: 0,
      showDelay: 0,
      extraCssText: 'box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1); border-radius: 12px; pointer-events: none;'
    },
    legend: { top: 0, icon: 'circle', textStyle: { color: '#64748b', fontSize: 10, fontWeight: 'bold' } },
    grid: { left: '10', right: '10', top: '50', bottom: '65', containLabel: true },
    dataZoom: [
      // 性能修复：使用 filterMode: 'empty' 避免缩放时 ECharts 重新遍历并过滤截断数组，大幅提升滚轮缩放帧率
      { type: 'inside', start: 0, end: 100, zoomOnMouseWheel: true, filterMode: 'empty' },
      { type: 'slider', bottom: 12, height: 18, brushSelect: false, filterMode: 'empty' }
    ],
    xAxis: {
      type: 'category', // 恢复类目轴，配合一维数组是 ECharts 渲染的最快路径
      data: isBoxplot ? keys : Array.from({ length: count }, (_, i) => i + 1),
      axisLabel: { fontSize: 10, color: '#94a3b8', hideOverlap: true },
      splitLine: { show: false },
      axisLine: { lineStyle: { color: '#e2e8f0' } },
      boundaryGap: isBoxplot
    },
    yAxis: {
      type: 'value',
      // 让箱线图也共享折线图的 20% 上下文留白（Padding），避免图形顶天立地
      min: yExtent[0],
      max: yExtent[1],
      scale: false,
      axisLabel: { fontSize: 10, color: '#94a3b8' },
      splitLine: { lineStyle: { color: '#f1f5f9', type: 'dashed' } },
      axisLine: { show: false }
    },
    series: isBoxplot ? [] : keys.map(key => ({
      name: key,
      type: 'line',
      data: rows.map(r => typeof r[key] === 'number' ? r[key] : 0), 
      showSymbol: false,
      smooth: false,
      // 性能致命点修复：绝对不能在 5万条高重叠数据上使用半透明 (opacity < 1)！
      // Canvas 在绘制半透明线段叠加时，需要对每一个相交像素进行昂贵的 Alpha 混合计算。
      // 用“极细的实线 (width: 0.5, opacity: 1)”来代替“半透明粗线”，既能达到“弱化全局视觉”的目的，又能绕过 GPU 混合瓶颈。
      lineStyle: { width: 0.5, opacity: 1, cap: 'butt', join: 'bevel' },
      sampling: 'lttb',
      large: true,
      largeThreshold: 500,
      progressive: 2000,
      silent: true,
      emphasis: { disabled: true }
    }))
  }

  // 独立处理箱线图逻辑
  if (isBoxplot) {
    const boxData = keys.map(key => {
      const values = rows.map(r => r[key]).filter(v => typeof v === 'number').sort((a, b) => a - b)
      if (values.length === 0) return [0, 0, 0, 0, 0]
      return [values[0], values[Math.floor(values.length * 0.25)], values[Math.floor(values.length * 0.5)], values[Math.floor(values.length * 0.75)], values[values.length - 1]]
    })
    option.series = [{
      name: '分布',
      type: 'boxplot',
      data: boxData,
      itemStyle: { color: '#eef2ff', borderColor: '#6366f1', borderWidth: 1.5 }
    }]
    option.tooltip.trigger = 'item'
  }

  return markRaw(option)
})
</script>

<template>
  <div class="flex flex-col h-full bg-white rounded-2xl overflow-hidden border border-slate-100 shadow-sm">
    <!-- Toolbar -->
    <div class="flex items-center justify-between px-6 py-4 border-b border-slate-50 bg-slate-50/30">
      <div class="flex items-center gap-4">
        <div class="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-100 rounded-lg shadow-sm">
          <ListChecks size="14" class="text-indigo-500" />
          <span class="text-[10px] font-black text-slate-400 uppercase tracking-widest">展示因子</span>
          <MultiSelect v-model="selectedKeys" :options="availableKeys" placeholder="选择因子" :maxSelectedLabels="2" class="property-select" :filter="true" />
        </div>
        <div class="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-100 rounded-lg shadow-sm">
          <Filter size="14" class="text-indigo-500" />
          <span class="text-[10px] font-black text-slate-400 uppercase tracking-widest">数据过滤</span>
          <div class="flex items-center gap-1 ml-2">
            <InputNumber v-model="minFilter" placeholder="下限" class="filter-input" :useGrouping="false" />
            <span class="text-slate-300">-</span>
            <InputNumber v-model="maxFilter" placeholder="上限" class="filter-input" :useGrouping="false" />
          </div>
        </div>
        <div class="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-100 rounded-lg shadow-sm">
          <Settings2 size="14" class="text-slate-400" />
          <span class="text-[10px] font-black text-slate-400 uppercase tracking-widest">限制</span>
          <InputNumber v-model="maxPoints" :min="100" :max="50000" class="filter-input w-20" :useGrouping="false" />
        </div>
      </div>
      <Select v-model="chartType" :options="chartTypes" optionLabel="label" optionValue="value" class="chart-type-select">
        <template #value="slotProps">
          <div v-if="slotProps.value" class="flex items-center gap-2 text-slate-800">
            <component :is="chartTypes.find(c => c.value === slotProps.value)?.icon" size="14" stroke-width="2.5" />
            <span>{{ chartTypes.find(c => c.value === slotProps.value)?.label }}</span>
          </div>
        </template>
        <template #option="slotProps">
          <div class="flex items-center gap-2 font-bold text-[11px] uppercase tracking-widest text-slate-500 w-full">
            <component :is="slotProps.option.icon" size="14" class="text-slate-700" />
            <span>{{ slotProps.option.label }}</span>
          </div>
        </template>
      </Select>
    </div>

    <!-- Chart -->
    <div class="flex-1 p-4 relative">
      <div v-if="processedData.rows.length > 0" class="h-full w-full">
        <VChart ref="chartRef" :option="chartOption" autoresize />
      </div>
      <div v-else class="h-full flex flex-col items-center justify-center text-slate-300">
        <div class="p-6 rounded-full bg-slate-50 mb-4 animate-pulse"><Filter size="48" class="opacity-20 text-slate-900" /></div>
        <p class="font-bold text-xs uppercase tracking-widest">无符合条件的数据</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
:deep(.filter-input .p-inputnumber-input) { padding: 2px 8px; font-size: 11px; width: 60px; border: none; background: #f8fafc; border-radius: 4px; font-family: monospace; }
:deep(.chart-type-select) { 
  height: 32px; 
  font-size: 11px; 
  font-weight: 800; 
  text-transform: uppercase; 
  letter-spacing: 0.05em; 
  border: 1px solid #e2e8f0; 
  box-shadow: 0 1px 2px rgba(0,0,0,0.05); 
  border-radius: 8px;
  background: #fdfdfe;
  transition: all 0.2s ease;
}
:deep(.chart-type-select:hover) {
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
:deep(.property-select) { height: 28px; min-width: 140px; max-width: 240px; font-size: 11px; font-weight: 700; border-color: #f1f5f9; background: #f8fafc; }
:deep(.property-select .p-multiselect-label) { padding: 2px 8px; display: flex; align-items: center; }
:deep(.property-select .p-multiselect-chip) { padding: 1px 6px; font-size: 10px; background: #f1f5f9; color: #334155; border: 1px solid #e2e8f0; }
</style>
