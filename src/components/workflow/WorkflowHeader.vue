<script setup lang="ts">
import { ref } from 'vue'
import { useWorkflowStore } from '@/stores/workflowStore'
import {
  LayoutGrid,
  ChevronRight,
  Edit2,
  Save,
  FileUp,
  Activity,
  History,
  XCircle,
  Clock,
  CheckCircle2,
  AlertCircle,
} from 'lucide-vue-next'
import Button from 'primevue/button'
import Menu from 'primevue/menu'
import Popover from 'primevue/popover'

const emit = defineEmits(['open-projects'])
const store = useWorkflowStore()

// 过滤当前工作流的历史记录
const filteredHistory = computed(() => {
  if (store.currentWorkflowId) {
    return store.executionHistory.filter((r) => r.workflowId === store.currentWorkflowId)
  }
  // 如果是新建未保存的工作流，显示 temp 或 null 的记录
  return store.executionHistory.filter((r) => !r.workflowId || r.workflowId === 'temp')
})

const menu = ref()
const historyPopover = ref()
const menuItems = ref([
  {
    label: '文件操作',
    items: [
      { label: '导出 JSON 文件', icon: 'pi pi-download', command: () => store.exportWorkflow() },
      { label: '从 JSON 导入', icon: 'pi pi-upload', command: () => triggerImport() },
      {
        label: '清空运行历史',
        icon: 'pi pi-trash',
        class: 'text-red-500',
        command: () => store.clearHistory(),
      },
    ],
  },
])

const toggleMenu = (event: any) => menu.value.toggle(event)
const toggleHistory = (event: any) => {
  store.loadHistory()
  historyPopover.value.toggle(event)
}

const fileInput = ref<HTMLInputElement | null>(null)
const triggerImport = () => fileInput.value?.click()
const handleImport = (event: any) => {
  const file = event.target.files[0]
  if (file) {
    store.importWorkflow(file)
  }
}

const selectHistory = (record: any) => {
  store.enterHistoryMode(record.id)
  historyPopover.value.hide()
}

const formatDuration = (ms: number) => {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}
</script>

<template>
  <header
    class="absolute top-0 left-0 right-0 h-[56px] bg-white border-b border-slate-200 z-[100] flex items-center justify-between px-6"
  >
    <input ref="fileInput" type="file" class="hidden" accept=".json" @change="handleImport" />

    <div class="flex items-center gap-4">
      <!-- 导航/面包屑 -->
      <div
        class="flex items-center gap-2 text-slate-500 hover:text-slate-900 transition-colors cursor-pointer group px-2 py-1.5 rounded-md hover:bg-slate-100"
        @click="emit('open-projects')"
      >
        <LayoutGrid size="16" class="opacity-70 group-hover:opacity-100" />
        <span class="text-[13px] font-medium">Projects</span>
        <ChevronRight size="14" class="opacity-40" />
      </div>

      <!-- 项目名称编辑 -->
      <div class="flex items-center gap-2 group relative">
        <input
          v-model="store.workflowName"
          :disabled="store.isHistoryMode"
          class="font-semibold text-[14px] text-slate-900 border border-transparent hover:border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 bg-transparent focus:bg-white rounded-md px-2.5 py-1 transition-all w-[300px] outline-none disabled:opacity-70 disabled:cursor-not-allowed"
          placeholder="Untitled Workflow"
        />
        <Edit2
          v-if="!store.isHistoryMode"
          size="12"
          class="text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity absolute right-2 pointer-events-none"
        />

        <!-- 历史记录触发图标 -->
        <button
          class="p-1.5 rounded-md hover:bg-slate-100 text-slate-400 hover:text-indigo-600 transition-all ml-1 outline-none cursor-pointer"
          title="查看运行历史"
          @click="toggleHistory"
        >
          <History :size="18" :class="{ 'text-indigo-600': store.isHistoryMode }" />
        </button>

        <Popover
          ref="historyPopover"
          class="w-[320px] shadow-2xl border border-slate-200 rounded-xl overflow-hidden mt-2"
        >
          <div class="p-3 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
            <span class="text-[12px] font-bold text-slate-700 uppercase tracking-wider"
              >运行历史 (最近20条)</span
            >
            <Clock :size="14" class="text-slate-400" />
          </div>
          <div class="max-h-[400px] overflow-y-auto scrollbar-thin">
            <div v-if="filteredHistory.length === 0" class="p-8 text-center">
              <Activity :size="24" class="mx-auto text-slate-200 mb-2" />
              <p class="text-[12px] text-slate-400">暂无运行记录</p>
            </div>
            <div
              v-for="record in filteredHistory"
              :key="record.id"
              class="p-3 border-b border-slate-100 hover:bg-indigo-50 cursor-pointer transition-colors group"
              @click="selectHistory(record)"
            >
              <div class="flex items-center justify-between mb-1">
                <div class="flex items-center gap-2">
                  <CheckCircle2
                    v-if="record.status === 'success'"
                    :size="14"
                    class="text-emerald-500"
                  />
                  <AlertCircle
                    v-else-if="record.status === 'error'"
                    :size="14"
                    class="text-rose-500"
                  />
                  <XCircle v-else :size="14" class="text-amber-500" />
                  <span class="text-[13px] font-medium text-slate-700">{{
                    new Date(record.startTime).toLocaleTimeString()
                  }}</span>
                </div>
                <span class="text-[11px] text-slate-400 font-mono">{{
                  formatDuration(record.duration)
                }}</span>
              </div>
              <div class="text-[11px] text-slate-500 flex justify-between items-center">
                <span>{{ new Date(record.startTime).toLocaleDateString() }}</span>
                <span
                  class="opacity-0 group-hover:opacity-100 text-indigo-600 font-semibold transition-opacity"
                  >查看详情 →</span
                >
              </div>
            </div>
          </div>
        </Popover>
      </div>
    </div>

    <div class="flex items-center gap-3">
      <!-- 在线状态 / 历史模式状态 -->
      <div
        class="flex items-center gap-2 px-3 py-1 rounded-md border transition-all"
        :class="
          store.isHistoryMode
            ? 'bg-amber-50 border-amber-200 shadow-sm'
            : 'bg-slate-50 border-slate-200'
        "
      >
        <div
          class="w-2 h-2 rounded-full"
          :class="store.isHistoryMode ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'"
        ></div>
        <span
          class="text-[11px] font-bold"
          :class="store.isHistoryMode ? 'text-amber-700' : 'text-slate-600'"
        >
          {{ store.isHistoryMode ? 'HISTORY VIEW' : 'Connected' }}
        </span>
      </div>

      <div class="h-4 w-[1px] bg-slate-200 mx-1"></div>

      <!-- 操作按钮 -->
      <Button
        v-if="!store.isHistoryMode"
        severity="secondary"
        text
        class="h-8 px-4 text-[12px] font-medium flex gap-2 items-center rounded-md bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-700 transition-colors shadow-sm outline-none"
        @click="store.saveWorkflow()"
      >
        <Save :size="15" class="text-slate-500" />
        Save
      </Button>

      <button
        v-if="!store.isHistoryMode"
        class="w-8 h-8 flex items-center justify-center rounded-md border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-600 transition-colors shadow-sm bg-white outline-none cursor-pointer"
        @click="toggleMenu"
      >
        <FileUp :size="16" />
      </button>
      <Menu ref="menu" :model="menuItems" :popup="true" class="n8n-popup-menu" />
    </div>
  </header>
</template>

<style scoped>
.n8n-popup-menu {
  border-radius: 12px !important;
  border: 1px solid #e2e8f0 !important;
  box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1) !important;
}
</style>
