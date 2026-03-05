<script setup lang="ts">
import { ref, computed } from 'vue'
import { Database, Maximize, Zap, Edit3, FileJson } from 'lucide-vue-next'
import ToggleSwitch from 'primevue/toggleswitch'
import Textarea from 'primevue/textarea'

const props = defineProps<{
  title: string
  data: any
  type: 'input' | 'output'
  allowMock?: boolean
  useManualInput?: boolean
  manualInputStr?: string
}>()

const emit = defineEmits(['update:useManualInput', 'update:manualInputStr', 'openDetail', 'generateMock'])

const getSmartPreview = (data: any) => {
  if (!data) return "暂无数据可用。"
  if (Array.isArray(data)) return `// 数组预览 (${data.length} 条)\n${JSON.stringify(data.slice(0, 5), null, 2)}\n...`
  if (data.data && Array.isArray(data.data)) return `// 数据集预览 (${data.data.length} 条)\n${JSON.stringify({ ...data, data: data.data.slice(0, 3) }, null, 2)}\n...`
  const str = JSON.stringify(data, null, 2)
  return str.length > 1000 ? str.substring(0, 1000) + "\n\n// ... 已截断" : str
}
</script>

<template>
  <div class="flex flex-col h-full overflow-hidden bg-white rounded-xl border border-slate-200 shadow-sm">
    <!-- Header (Light Theme) -->
    <div class="flex items-center justify-between px-4 py-2 bg-slate-50 border-b border-slate-100">
      <div class="flex items-center gap-2">
        <FileJson size="12" class="text-slate-400" />
        <span class="text-[10px] font-black text-slate-500 uppercase tracking-widest">{{ title }}</span>
      </div>
      <div class="flex items-center gap-3">
        <!-- 模拟开关 -->
        <div v-if="allowMock" class="flex items-center gap-2 border-r border-slate-200 pr-3 mr-1">
           <span class="text-[9px] font-bold text-slate-400 uppercase">模拟输入</span>
           <ToggleSwitch :modelValue="useManualInput" @update:modelValue="emit('update:useManualInput', $event)" class="!scale-[0.6]" />
        </div>
        <button @click="emit('openDetail')" class="p-1.5 hover:bg-slate-200 rounded-lg transition-all text-slate-400 hover:text-slate-600" title="打开深度分析窗口">
          <Maximize size="12" />
        </button>
      </div>
    </div>

    <!-- Content (Light Theme) -->
    <div class="flex-1 overflow-hidden relative bg-[#fcfcfd]">
      <!-- 预览模式 -->
      <div v-if="!useManualInput" class="h-full overflow-auto p-4 font-mono text-[11px] text-slate-600 custom-scrollbar">
        <pre class="whitespace-pre-wrap break-all leading-relaxed">{{ getSmartPreview(data) }}</pre>
      </div>

      <!-- 编辑模式 -->
      <div v-else class="h-full flex flex-col p-2">
        <Textarea 
          :modelValue="manualInputStr" 
          @update:modelValue="emit('update:manualInputStr', $event)"
          placeholder="输入 JSON 数据..." 
          class="flex-1 font-mono text-[11px] p-3 rounded-lg border border-indigo-100 focus:border-indigo-400 focus:ring-0 bg-indigo-50/10 text-indigo-900 custom-scrollbar resize-none" 
        />
        <div class="flex justify-end p-2 border-t border-indigo-50/50 mt-1">
           <button @click="emit('generateMock')" class="text-[9px] font-black text-indigo-500 hover:text-indigo-700 flex items-center gap-1 uppercase tracking-tighter">
              <Zap size="10" /> 生成模板
           </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.custom-scrollbar::-webkit-scrollbar { width: 4px; }
.custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
.custom-scrollbar::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; }
.custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #cbd5e1; }
</style>
