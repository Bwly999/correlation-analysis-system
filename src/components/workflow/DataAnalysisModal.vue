<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import { X, BarChart3, PieChart, Table as TableIcon, FileJson, Download } from 'lucide-vue-next'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { BarChart, LineChart, ScatterChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, TitleComponent, LegendComponent } from 'echarts/components'

use([CanvasRenderer, BarChart, LineChart, ScatterChart, GridComponent, TooltipComponent, TitleComponent, LegendComponent])

const props = defineProps<{
  visible: boolean
  title: string
  data: any
}>()

const emit = defineEmits(['close'])

const activeView = ref<'json' | 'chart'>('json')

// 提取数据用于图表
const chartOption = computed(() => {
  if (!props.data) return {}
  
  let rows = []
  if (Array.isArray(props.data)) rows = props.data
  else if (props.data.data && Array.isArray(props.data.data)) rows = props.data.data
  
  if (rows.length === 0) return {}

  // 提取数值型字段作为 X 轴
  const firstRow = rows[0]
  const numericKeys = Object.keys(firstRow).filter(k => typeof firstRow[k] === 'number')
  
  if (numericKeys.length === 0) return {}

  return {
    title: { text: '数据因子分布预览', left: 'center', textStyle: { fontSize: 14 } },
    tooltip: { trigger: 'axis' },
    legend: { bottom: 0 },
    grid: { left: '3%', right: '4%', bottom: '10%', containLabel: true },
    xAxis: { type: 'category', data: rows.map((_, i) => `Row ${i + 1}`) },
    yAxis: { type: 'value' },
    series: numericKeys.slice(0, 5).map(key => ({
      name: key,
      type: 'line',
      smooth: true,
      data: rows.map(r => r[key])
    }))
  }
})

const exportData = () => {
  const blob = new Blob([JSON.stringify(props.data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `data_export_${Date.now()}.json`
  a.click()
}
</script>

<template>
  <Dialog 
    :visible="visible" 
    modal 
    @update:visible="emit('close')"
    class="analysis-dialog"
    :style="{ width: '85vw', height: '85vh' }"
    :closable="false"
  >
    <template #header>
      <div class="flex items-center justify-between w-full px-2">
        <div class="flex items-center gap-3">
          <div class="p-2 bg-indigo-50 rounded-xl text-indigo-600"><BarChart3 size="20" /></div>
          <div>
            <h2 class="text-lg font-bold text-slate-800">深度数据分析 - {{ title }}</h2>
            <p class="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Data Insight Explorer</p>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <Button @click="exportData" severity="secondary" text class="flex gap-2 items-center text-xs font-bold">
            <Download size="16" /> 导出数据
          </Button>
          <div class="w-[1px] h-6 bg-slate-200 mx-2"></div>
          <Button severity="secondary" text @click="emit('close')"><X size="24"/></Button>
        </div>
      </div>
    </template>

    <div class="flex flex-col h-full overflow-hidden border-t -mx-6 -mb-6 bg-slate-50">
      <!-- Top Navigation -->
      <div class="flex bg-white px-6 border-b">
        <button 
          @click="activeView = 'json'"
          :class="['px-6 py-4 text-xs font-black uppercase tracking-widest flex items-center gap-2 border-b-2 transition-all', activeView === 'json' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-400']"
        >
          <FileJson size="14" /> 完整 JSON
        </button>
        <button 
          @click="activeView = 'chart'"
          :class="['px-6 py-4 text-xs font-black uppercase tracking-widest flex items-center gap-2 border-b-2 transition-all', activeView === 'chart' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-400']"
        >
          <BarChart3 size="14" /> 可视化图表
        </button>
      </div>

      <!-- Main Content Area -->
      <div class="flex-1 overflow-hidden p-6">
        <div v-if="activeView === 'json'" class="h-full bg-slate-900 rounded-2xl shadow-2xl p-6 overflow-auto custom-scrollbar font-mono text-[12px] text-indigo-300">
           <pre>{{ JSON.stringify(data, null, 2) }}</pre>
        </div>
        
        <div v-else-if="activeView === 'chart'" class="h-full bg-white rounded-2xl shadow-xl p-8 flex flex-col gap-6 overflow-auto custom-scrollbar">
           <div v-if="Object.keys(chartOption).length > 0" class="flex-1 min-h-[400px]">
              <VChart :option="chartOption" autoresize />
           </div>
           <div v-else class="h-full flex flex-col items-center justify-center text-slate-300 italic">
              <BarChart3 size="64" class="opacity-10 mb-4" />
              <p>当前数据结构不支持自动生成预览图表</p>
           </div>
        </div>
      </div>
    </div>
  </Dialog>
</template>

<style scoped>
.analysis-dialog .p-dialog-content { padding: 0; display: flex; flex-direction: column; overflow: hidden; }
.custom-scrollbar::-webkit-scrollbar { width: 6px; }
.custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
</style>
