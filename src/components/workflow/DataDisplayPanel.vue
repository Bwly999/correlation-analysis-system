<script setup lang="ts">
import { Maximize, Zap, FileJson, Pin } from 'lucide-vue-next'
import ToggleSwitch from 'primevue/toggleswitch'
import MonacoEditor from './MonacoEditor.vue'

const _props = defineProps<{
  title: string
  data: any
  type: 'input' | 'output'
  allowMock?: boolean
  isPinned?: boolean
}>()

const useManualInput = defineModel<boolean>('useManualInput')
const manualInputStr = defineModel<string>('manualInputStr')

const emit = defineEmits(['openDetail', 'generateMock'])

const getSmartPreview = (data: any) => {
  if (!data) return '暂无数据可用。'
  
  // 检查是否为 Parallel Collection 格式: [{ name, data: [] }, ...]
  if (Array.isArray(data) && data.length > 0 && data[0] && typeof data[0] === 'object' && 'name' in data[0] && 'data' in data[0]) {
    const summary = data.map((group: any) => 
      `  - ${group.name}: ${Array.isArray(group.data) ? group.data.length : 0} 条数据`
    ).join('\n')
    
    // 截断预览
    const previewData = data.map((group: any) => ({
      name: group.name,
      data: Array.isArray(group.data) ? group.data.slice(0, 2) : group.data,
      _count: Array.isArray(group.data) ? group.data.length : 0
    }))
    
    return `// 分组集合预览 (${data.length} 个分组)\n${summary}\n\n${JSON.stringify(previewData, null, 2)}\n...`
  }

  if (Array.isArray(data))
    return `// 数组预览 (${data.length} 条)\n${JSON.stringify(data.slice(0, 5), null, 2)}\n...`
  if (data.data && Array.isArray(data.data))
    return `// 数据集预览 (${data.data.length} 条)\n${JSON.stringify({ ...data, data: data.data.slice(0, 3) }, null, 2)}\n...`
  const str = JSON.stringify(data, null, 2)
  return str.length > 1000 ? str.substring(0, 1000) + '\n\n// ... 已截断' : str
}
</script>

<template>
  <div
    class="flex flex-col h-full overflow-hidden bg-white rounded-xl border border-slate-200 shadow-sm"
  >
    <!-- Header (Light Theme) -->
    <div class="flex items-center justify-between px-4 py-2 bg-slate-50 border-b border-slate-100">
      <div class="flex items-center gap-2">
        <FileJson size="12" class="text-slate-400" />
        <span class="text-[10px] font-black text-slate-500 uppercase tracking-widest">{{
          title
        }}</span>
        <div
          v-if="isPinned"
          class="flex items-center gap-1 px-1.5 py-0.5 bg-amber-100 border border-amber-200 rounded text-[9px] text-amber-600 font-bold ml-1 animate-pulse"
        >
          <Pin size="8" fill="currentColor" /> 冻结
        </div>
      </div>
      <div class="flex items-center gap-3">
        <!-- 模拟开关 -->
        <div v-if="allowMock" class="flex items-center gap-2 border-r border-slate-200 pr-3 mr-1">
          <span class="text-[9px] font-bold text-slate-400 uppercase">模拟输入</span>
          <ToggleSwitch v-model="useManualInput" class="!scale-[0.6]" />
        </div>
        <button
          class="p-1.5 hover:bg-slate-200 rounded-lg transition-all text-slate-400 hover:text-slate-600 cursor-pointer"
          title="打开深度分析窗口"
          @click="emit('openDetail')"
        >
          <Maximize size="12" />
        </button>
      </div>
    </div>

    <!-- Content (Light Theme) -->
    <div class="flex-1 overflow-hidden relative bg-[#fcfcfd] min-h-0">
      <!-- 预览模式 -->
      <div
        v-if="!useManualInput"
        class="h-full overflow-y-auto p-4 font-mono text-[11px] text-slate-600 custom-scrollbar"
      >
        <pre class="whitespace-pre-wrap break-all leading-relaxed">{{ getSmartPreview(data) }}</pre>
      </div>

      <!-- 编辑模式 -->
      <div v-else class="h-full flex flex-col p-2 min-h-0">
        <MonacoEditor v-model="manualInputStr" height="100%" class="flex-1" />
        <div class="flex justify-end p-2 border-t border-indigo-50/50 mt-1 shrink-0">
          <button
            class="text-[9px] font-black text-indigo-500 hover:text-indigo-700 flex items-center gap-1 uppercase tracking-tighter cursor-pointer"
            @click="emit('generateMock')"
          >
            <Zap size="10" /> 生成模板
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  width: 4px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: #e2e8f0;
  border-radius: 10px;
}
.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: #cbd5e1;
}
</style>
