<script setup lang="ts">
import { computed, ref } from 'vue'
import { useWorkflowStore } from '@/stores/workflowStore'
import {
  LayoutGrid,
  ChevronRight,
  ChevronDown,
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
  // 如果当前没有选中的工作流（如新建工作流时），展示所有历史以方便回溯
  return store.executionHistory
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
        command: async () => await store.clearHistory(),
      },
    ],
  },
])

const toggleMenu = (event: any) => menu.value.toggle(event)
const toggleHistory = async (event: any) => {
  // 必须在异步操作前记录事件或目标，否则 await 后 event 可能会失效导致定位到 (0,0)
  const target = event.currentTarget || event.target
  await store.loadHistory()
  historyPopover.value.toggle({ currentTarget: target })
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
    class="absolute top-0 left-0 right-0 h-[56px] bg-white/95 backdrop-blur border-b border-slate-200 z-[100] flex items-center justify-between px-5 xl:px-6"
  >
    <input ref="fileInput" type="file" class="hidden" accept=".json" @change="handleImport" />

    <div class="flex items-center gap-3.5">
      <!-- 导航/面包屑 -->
      <div
        class="flex items-center gap-2 text-slate-500 hover:text-slate-900 transition-colors cursor-pointer group px-2 py-1.5 rounded-md hover:bg-slate-100"
        @click="emit('open-projects')"
      >
        <LayoutGrid :size="16" class="opacity-70 group-hover:opacity-100" />
        <span class="text-[13px] font-medium">Projects</span>
        <ChevronRight :size="14" class="opacity-40" />
      </div>

      <!-- 项目名称编辑 -->
      <div class="flex items-center gap-2 group relative">
        <input
          v-model="store.workflowName"
          :disabled="store.isHistoryMode"
          class="font-semibold text-[14px] text-slate-900 border border-transparent hover:border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 bg-transparent focus:bg-white rounded-md px-2.5 py-1 transition-all w-[300px] outline-none disabled:opacity-70 disabled:cursor-not-allowed"
          placeholder="Untitled Workflow"
        />
        <Edit2
          v-if="!store.isHistoryMode"
          :size="12"
          class="text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity absolute right-2 pointer-events-none"
        />

        <!-- 历史记录触发图标 -->
        <button
          class="toolbar-icon-btn ml-1 relative z-20"
          title="查看运行历史"
          @click.stop="toggleHistory"
        >
          <History :size="17" :class="{ 'text-blue-600': store.isHistoryMode }" />
        </button>

        <Popover
          ref="historyPopover"
          append-to="body"
          class="w-[320px] shadow-2xl border border-slate-200 rounded-xl overflow-hidden mt-2 z-[9999]"
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

    <div class="action-deck">
      <div
        class="status-pill"
        :class="
          store.isHistoryMode
            ? 'bg-amber-50 border-amber-200 text-amber-700'
            : 'bg-white border-slate-200 text-slate-600'
        "
      >
        <div
          class="w-1.5 h-1.5 rounded-full"
          :class="store.isHistoryMode ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'"
        ></div>
        <span class="text-[10px] font-bold tracking-wide">
          {{ store.isHistoryMode ? 'HISTORY VIEW' : 'Connected' }}
        </span>
      </div>

      <div class="deck-divider"></div>

      <Button v-if="!store.isHistoryMode" class="save-btn" @click="async () => await store.saveWorkflow()">
        <Save :size="14" />
        <span>保存</span>
      </Button>

      <button v-if="!store.isHistoryMode" class="file-btn" @click="toggleMenu">
        <FileUp :size="14" />
        <span>文件</span>
        <ChevronDown :size="12" />
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

.toolbar-icon-btn {
  width: 2rem;
  height: 2rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 0.375rem;
  border: 1px solid #e2e8f0;
  background: #fff;
  color: #475569;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.06);
}

.toolbar-icon-btn:hover {
  border-color: #cbd5e1;
  background: #f8fafc;
  color: #2563eb;
}


.action-deck {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  height: 2.5rem;
  padding: 0.25rem 0.375rem;
  border-radius: 0.875rem;
  border: 1px solid #dbe4ef;
  background: linear-gradient(180deg, #f8fbff 0%, #f2f6fb 100%);
  box-shadow:
    0 6px 14px -10px rgba(15, 23, 42, 0.45),
    inset 0 1px 0 rgba(255, 255, 255, 0.95);
}

.status-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.375rem 0.625rem;
  border-radius: 0.625rem;
  border: 1px solid #e2e8f0;
}

.deck-divider {
  width: 1px;
  height: 18px;
  background: #d6dfeb;
}

.save-btn {
  height: 2rem;
  padding: 0 0.875rem;
  border-radius: 0.625rem;
  border: 1px solid #1d4ed8;
  background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
  color: #ffffff;
  font-size: 12px;
  font-weight: 700;
  display: inline-flex;
  gap: 0.375rem;
  align-items: center;
  box-shadow: 0 8px 18px -10px rgba(37, 99, 235, 0.85);
  transition: all 0.2s ease;
}

.save-btn:hover {
  transform: translateY(-0.5px);
  filter: saturate(1.08);
}

.file-btn {
  height: 2rem;
  padding: 0 0.625rem;
  border-radius: 0.625rem;
  border: 1px solid #d1dbe8;
  background: #ffffff;
  color: #334155;
  font-size: 12px;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  cursor: pointer;
  transition: all 0.2s ease;
}

.file-btn:hover {
  border-color: #b8c7da;
  background: #f8fafc;
  color: #0f172a;
}
</style>
