<script setup lang="ts">
import { ref, computed } from 'vue'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import InputNumber from 'primevue/inputnumber'
import { X, BarChart3, Database, Download, FileJson, Layers, ChevronRight } from 'lucide-vue-next'
import DataChart from './DataChart.vue'
import ReportViewer from './viewers/ReportViewer.vue'
import ChartViewer from './viewers/ChartViewer.vue'
import ExportViewer from './viewers/ExportViewer.vue'

const props = defineProps<{
  visible: boolean
  title: string
  data: any
}>()

const emit = defineEmits(['close'])

const previewLimit = ref(10)

// 提取实际的数据数组
const normalizedData = computed(() => {
  if (!props.data) return []
  if (Array.isArray(props.data)) return props.data
  if (props.data.data && Array.isArray(props.data.data)) return props.data.data
  return []
})

// 截断用于预览的 JSON
const previewJson = computed(() => {
  const data = normalizedData.value
  if (!data || data.length === 0) return props.data // Fallback to raw data if not a dataset
  const displayData = data.slice(0, previewLimit.value ?? 10)
  
  // 构造展示对象，保留原有的非 data 属性（如果是对象的话）
  if (!Array.isArray(props.data) && props.data) {
    const { data: _, ...rest } = props.data
    return {
      ...rest,
      data: displayData,
      _previewInfo: `Showing ${displayData.length} of ${data.length} records`
    }
  }
  
  return displayData
})

const exportData = () => {
  const blob = new Blob([JSON.stringify(props.data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `data_analysis_${props.title.replace(/\s+/g, '_')}_${Date.now()}.json`
  a.click()
}
</script>

<template>
  <Dialog 
    :visible="visible" 
    modal 
    @update:visible="emit('close')"
    class="analysis-dialog"
    :style="{ width: '90vw', height: '90vh' }"
    :closable="false"
  >
    <template #header>
      <div class="flex items-center justify-between w-full px-4 py-2">
        <div class="flex items-center gap-4">
          <div class="flex -space-x-2">
             <div class="w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center text-white shadow-lg shadow-slate-200/50 border-2 border-white relative z-10">
                <BarChart3 size="20" />
             </div>
             <div class="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center text-slate-400 border-2 border-white">
                <Database size="18" />
             </div>
          </div>
          <div>
            <div class="flex items-center gap-2 text-slate-400 text-[10px] font-black uppercase tracking-[0.2em] mb-0.5">
               <span>工作流节点</span>
               <ChevronRight size="10" />
               <span class="text-slate-800">{{ props.data?.viewType === 'report' ? '分析报告' : (props.data?.viewType === 'export' ? '数据导出' : '数据深度分析') }}</span>
            </div>
            <h2 class="text-xl font-black text-slate-800 tracking-tight">{{ title }}</h2>
          </div>
        </div>
        
        <div class="flex items-center gap-3">
          <button @click="exportData" class="group flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 transition-all active:scale-95 cursor-pointer">
             <Download size="16" class="text-slate-500 group-hover:text-slate-900 transition-colors" />
             <span class="text-xs font-bold text-slate-600 group-hover:text-slate-900">导出原始数据</span>
          </button>
          <div class="w-[1px] h-8 bg-slate-100 mx-2"></div>
          <button @click="emit('close')" class="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-red-50 text-slate-400 hover:text-red-500 transition-all cursor-pointer">
             <X size="24" />
          </button>
        </div>
      </div>
    </template>

    <div class="flex h-full overflow-hidden bg-slate-50/50 p-4 gap-4">
      <!-- Left: Data Preview Panel -->
      <div class="w-80 flex flex-col gap-4">
         <div class="flex-1 bg-white rounded-2xl border border-slate-200/60 shadow-sm flex flex-col overflow-hidden">
            <div class="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
               <div class="flex items-center gap-2">
                  <FileJson size="14" class="text-slate-500" />
                  <span class="text-[10px] font-black text-slate-400 uppercase tracking-widest">数据预览</span>
               </div>
               <div class="flex items-center gap-2" v-if="normalizedData.length > 0">
                  <span class="text-[9px] font-bold text-slate-400 uppercase">显示数量</span>
                  <InputNumber v-model="previewLimit" :min="1" :max="100" class="preview-limit-input" :useGrouping="false" />
               </div>
            </div>
            <div class="flex-1 overflow-auto p-5 font-mono text-[11px] leading-relaxed text-slate-600 custom-scrollbar bg-[#fafafa]">
               <pre>{{ JSON.stringify(previewJson, null, 2) }}</pre>
            </div>
            <div v-if="normalizedData.length > 0" class="px-5 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
               <span class="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Total: {{ normalizedData.length }} Records</span>
               <Layers size="12" class="text-slate-400" />
            </div>
         </div>
         
         <div class="bg-slate-900 rounded-2xl p-5 text-slate-100 shadow-xl shadow-slate-200/50 relative overflow-hidden group border border-slate-800">
            <div class="relative z-10">
               <div class="flex items-center gap-2 mb-2 opacity-80">
                  <BarChart3 size="12" class="text-slate-300" />
                  <h4 class="text-[10px] font-black uppercase tracking-widest text-slate-300">系统提示</h4>
               </div>
               <p class="text-[11px] leading-relaxed font-medium text-slate-300">根据节点输出类型，系统已自动匹配最佳可视化视图。</p>
            </div>
            <div class="absolute -right-4 -bottom-4 opacity-[0.03] group-hover:scale-110 transition-transform duration-700 pointer-events-none">
               <BarChart3 size="80" class="text-white" />
            </div>
         </div>
      </div>

      <!-- Right: Main Analysis Area -->
      <div class="flex-1 flex flex-col min-w-0 bg-white rounded-2xl border border-slate-200/60 shadow-sm overflow-hidden">
         <template v-if="props.data?.viewType === 'report'">
           <ReportViewer :data="props.data" />
         </template>
         <template v-else-if="props.data?.viewType === 'chart'">
           <ChartViewer :data="props.data" />
         </template>
         <template v-else-if="props.data?.viewType === 'export'">
           <ExportViewer :data="props.data" />
         </template>
         <template v-else>
           <DataChart :data="normalizedData" />
         </template>
      </div>
    </div>
  </Dialog>
</template>

<style scoped>
.analysis-dialog :deep(.p-dialog-content) { 
  padding: 0; 
  display: flex; 
  flex-direction: column; 
  overflow: hidden; 
  background: #f8fafc;
}

.custom-scrollbar::-webkit-scrollbar { width: 5px; }
.custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
.custom-scrollbar::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; }
.custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #cbd5e1; }

:deep(.preview-limit-input .p-inputnumber-input) {
  padding: 2px 6px;
  font-size: 10px;
  width: 40px;
  border: 1px solid #f1f5f9;
  background: #fff;
  border-radius: 6px;
  text-align: center;
  font-family: monospace;
}
</style>
