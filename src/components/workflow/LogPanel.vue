<script setup lang="ts">
import { useWorkflowStore } from '@/stores/workflowStore'
import {
  Terminal,
  Trash2,
  List,
  Download,
  Search,
  X,
  Info,
  AlertTriangle,
  AlertCircle,
  CircleDot,
} from 'lucide-vue-next'
import { ref, watch, nextTick, computed } from 'vue'

const store = useWorkflowStore()
const logContainer = ref<HTMLElement | null>(null)
const searchQuery = ref('')
const selectedLevel = ref<'all' | 'info' | 'warn' | 'error'>('all')
const isSearchVisible = ref(false)

const levels = [
  {
    value: 'all',
    label: '全部',
    icon: CircleDot,
    color: 'text-slate-400',
    activeBg: 'bg-slate-100',
    activeText: 'text-slate-700',
  },
  {
    value: 'info',
    label: '信息',
    icon: Info,
    color: 'text-emerald-500',
    activeBg: 'bg-emerald-50',
    activeText: 'text-emerald-700',
  },
  {
    value: 'warn',
    label: '警告',
    icon: AlertTriangle,
    color: 'text-amber-500',
    activeBg: 'bg-amber-50',
    activeText: 'text-amber-700',
  },
  {
    value: 'error',
    label: '错误',
    icon: AlertCircle,
    color: 'text-rose-500',
    activeBg: 'bg-rose-50',
    activeText: 'text-rose-700',
  },
] as const

const filteredLogs = computed(() => {
  return store.logs.filter((log) => {
    const matchesLevel = selectedLevel.value === 'all' || log.level === selectedLevel.value
    const matchesSearch =
      !searchQuery.value ||
      log.message.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
      (log.nodeId && log.nodeId.toLowerCase().includes(searchQuery.value.toLowerCase()))
    return matchesLevel && matchesSearch
  })
})

watch(
  () => filteredLogs.value.length,
  async () => {
    await nextTick()
    if (logContainer.value) {
      logContainer.value.scrollTop = logContainer.value.scrollHeight
    }
  },
)

const clearLogs = () => {
  store.logs = []
}

const toggleSearch = () => {
  isSearchVisible.value = !isSearchVisible.value
  if (!isSearchVisible.value) searchQuery.value = ''
}

const exportLogs = () => {
  const content = JSON.stringify(store.logs, null, 2)
  const blob = new Blob([content], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `logs-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`
  a.click()
  URL.revokeObjectURL(url)
}

const selectNode = (nodeId: string) => {
  store.activeConfigNodeId = nodeId
}
</script>

<template>
  <div
    class="h-full flex flex-col bg-white text-slate-600 font-sans border-t border-slate-200 shadow-2xl"
  >
    <div
      class="log-toolbar flex items-center justify-between px-4 py-2 border-b border-slate-100 bg-slate-50/50"
    >
      <div class="flex items-center gap-6">
        <div class="flex items-center gap-2">
          <List :size="14" class="text-indigo-600" />
          <span class="font-bold text-slate-800 text-xs uppercase tracking-wider">执行日志</span>
        </div>
        <div class="h-4 w-[1px] bg-slate-200"></div>

        <!-- 过滤控制区 -->
        <div class="flex items-center gap-3">
          <!-- 级别过滤 -->
          <div class="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200">
            <button
              v-for="level in levels"
              :key="level.value"
              class="px-2.5 py-1 rounded-md text-[10px] font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5"
              :class="
                selectedLevel === level.value
                  ? `${level.activeBg} ${level.activeText} shadow-sm border border-slate-200/50`
                  : 'text-slate-400 hover:text-slate-600 hover:bg-slate-200/50 border border-transparent'
              "
              @click="selectedLevel = level.value"
            >
              <component :is="level.icon" :size="10" :class="level.color" />
              {{ level.label }}
            </button>
          </div>

          <!-- 搜索框 -->
          <div class="relative flex items-center">
            <div
              class="flex items-center gap-2 bg-slate-100 px-2 py-1 rounded-lg border border-slate-200 transition-all duration-300"
              :class="
                isSearchVisible
                  ? 'w-48 opacity-100'
                  : 'w-8 opacity-0 pointer-events-none absolute right-0'
              "
            >
              <Search :size="10" class="text-slate-400 shrink-0" />
              <input
                v-model="searchQuery"
                placeholder="搜索日志..."
                class="bg-transparent border-none outline-none w-full text-[10px] text-slate-700 placeholder:text-slate-300"
              />
              <button class="hover:text-rose-500 cursor-pointer" @click="toggleSearch">
                <X :size="10" />
              </button>
            </div>
            <button
              v-if="!isSearchVisible"
              class="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-indigo-600 transition-colors cursor-pointer"
              title="搜索日志"
              @click="toggleSearch"
            >
              <Search :size="12" />
            </button>
          </div>

          <button
            class="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-indigo-600 transition-colors cursor-pointer"
            title="导出日志"
            @click="exportLogs"
          >
            <Download :size="12" />
          </button>
        </div>
      </div>

      <button
        class="text-[11px] font-bold text-slate-400 hover:text-rose-500 flex items-center gap-1.5 transition-colors uppercase cursor-pointer"
        @click="clearLogs"
      >
        <Trash2 :size="12" /> 清空全部
      </button>
    </div>

    <div ref="logContainer" class="flex-1 overflow-y-auto custom-scrollbar">
      <div
        v-if="filteredLogs.length === 0"
        class="h-full flex flex-col items-center justify-center text-slate-300 py-10"
      >
        <Terminal :size="32" class="mb-2 opacity-20" />
        <span class="text-xs font-medium italic">
          {{ searchQuery || selectedLevel !== 'all' ? '未找到匹配的日志' : '暂无执行数据' }}
        </span>
      </div>

      <div v-else class="divide-y divide-slate-50">
        <div
          v-for="(log, index) in filteredLogs"
          :key="index"
          class="log-row flex items-center gap-4 px-4 py-2.5 hover:bg-slate-50 transition-colors group border-l-4 border-transparent"
          :class="{
            'hover:border-emerald-400': log.level === 'info',
            'hover:border-rose-400': log.level === 'error',
            'hover:border-amber-400': log.level === 'warn',
          }"
        >
          <span class="text-[10px] font-mono text-slate-400 w-16 shrink-0">{{ log.time }}</span>

          <div class="flex items-center gap-2 w-20 shrink-0">
            <component
              :is="levels.find((l) => l.value === log.level)?.icon || CircleDot"
              :size="12"
              :class="{
                'text-emerald-500': log.level === 'info',
                'text-rose-500': log.level === 'error',
                'text-amber-500': log.level === 'warn',
              }"
            />
            <span
              class="text-[10px] font-bold uppercase tracking-tighter"
              :class="{
                'text-emerald-600': log.level === 'info',
                'text-rose-600': log.level === 'error',
                'text-amber-600': log.level === 'warn',
              }"
              >{{ log.level === 'info' ? '信息' : log.level === 'error' ? '错误' : '警告' }}</span
            >
          </div>

          <button
            v-if="log.nodeId"
            class="px-1.5 py-0.5 bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-200 transition-colors rounded text-[9px] font-mono text-slate-500 border border-slate-200 shrink-0 cursor-pointer"
            @click="selectNode(log.nodeId)"
          >
            #{{ log.nodeId.slice(-4) }}
          </button>

          <span class="text-xs font-medium text-slate-700 break-all leading-normal flex-1">{{
            log.message
          }}</span>

          <div class="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-opacity">
            <button
              class="p-1 hover:bg-white border border-transparent hover:border-slate-200 rounded shadow-sm transition-all cursor-pointer"
            >
              <List :size="12" class="text-slate-400" />
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
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

@media (min-width: 1600px) {
  .log-toolbar {
    padding: 0.375rem 1rem;
  }

  .log-row {
    padding-top: 0.5rem;
    padding-bottom: 0.5rem;
  }
}
</style>
