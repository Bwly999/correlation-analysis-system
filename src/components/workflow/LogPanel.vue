<script setup lang="ts">
import { useWorkflowStore } from '@/stores/workflowStore'
import { Terminal, Trash2, List, Filter, Download } from 'lucide-vue-next'
import { ref, watch, nextTick } from 'vue'

const store = useWorkflowStore()
const logContainer = ref<HTMLElement | null>(null)

watch(() => store.logs.length, async () => {
  await nextTick()
  if (logContainer.value) {
    logContainer.value.scrollTop = logContainer.value.scrollHeight
  }
})

const clearLogs = () => {
  store.logs = []
}
</script>

<template>
  <div class="h-full flex flex-col bg-white text-slate-600 font-sans border-t border-slate-200 shadow-2xl">
    <div class="flex items-center justify-between px-4 py-2 border-b border-slate-100 bg-slate-50/50">
      <div class="flex items-center gap-6">
        <div class="flex items-center gap-2">
          <List size="14" class="text-indigo-600" />
          <span class="font-bold text-slate-800 text-xs uppercase tracking-wider">执行日志</span>
        </div>
        <div class="h-4 w-[1px] bg-slate-200"></div>
        <div class="flex items-center gap-4 text-[11px] font-medium text-slate-400">
           <button class="hover:text-indigo-600 flex items-center gap-1.5"><Filter size="12" /> 过滤</button>
           <button class="hover:text-indigo-600 flex items-center gap-1.5"><Download size="12" /> 导出</button>
        </div>
      </div>
      <button @click="clearLogs" class="text-[11px] font-bold text-slate-400 hover:text-rose-500 flex items-center gap-1.5 transition-colors uppercase">
        <Trash2 size="12" /> 清空全部
      </button>
    </div>
    
    <div ref="logContainer" class="flex-1 overflow-y-auto custom-scrollbar">
      <div v-if="store.logs.length === 0" class="h-full flex flex-col items-center justify-center text-slate-300 py-10">
         <Terminal size="32" class="mb-2 opacity-20" />
         <span class="text-xs font-medium italic">暂无执行数据</span>
      </div>
      
      <div v-else class="divide-y divide-slate-50">
        <div v-for="(log, index) in store.logs" :key="index" 
          class="flex items-center gap-4 px-4 py-2.5 hover:bg-slate-50 transition-colors group border-l-4 border-transparent"
          :class="{
            'hover:border-emerald-400': log.level === 'info',
            'hover:border-rose-400': log.level === 'error',
            'hover:border-amber-400': log.level === 'warn'
          }"
        >
          <span class="text-[10px] font-mono text-slate-400 w-16 shrink-0">{{ log.time }}</span>
          
          <div class="flex items-center gap-2 w-20 shrink-0">
            <div class="w-1.5 h-1.5 rounded-full" :class="{
              'bg-emerald-500': log.level === 'info',
              'bg-rose-500': log.level === 'error',
              'bg-amber-500': log.level === 'warn'
            }"></div>
            <span class="text-[10px] font-bold uppercase tracking-tighter" :class="{
              'text-emerald-600': log.level === 'info',
              'text-rose-600': log.level === 'error',
              'text-amber-600': log.level === 'warn'
            }">{{ log.level === 'info' ? '信息' : log.level === 'error' ? '错误' : '警告' }}</span>
          </div>

          <span v-if="log.nodeId" class="px-1.5 py-0.5 bg-slate-100 rounded text-[9px] font-mono text-slate-500 border border-slate-200 shrink-0">
            #{{ log.nodeId.slice(-4) }}
          </span>

          <span class="text-xs font-medium text-slate-700 break-all leading-normal flex-1">{{ log.message }}</span>
          
          <button class="opacity-0 group-hover:opacity-100 p-1 hover:bg-white border border-transparent hover:border-slate-200 rounded shadow-sm transition-all">
             <List size="12" class="text-slate-400" />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.custom-scrollbar::-webkit-scrollbar { width: 6px; }
.custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
.custom-scrollbar::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; }
.custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #cbd5e1; }
</style>
