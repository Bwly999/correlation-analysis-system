<script setup lang="ts">
import { computed, ref } from 'vue'
import { useLocalStorage } from '@vueuse/core'
import Dialog from 'primevue/dialog'
import InputNumber from 'primevue/inputnumber'
import { X, BarChart3, Database, Download, FileJson, Layers, ChevronRight, PanelLeftClose, PanelLeftOpen } from 'lucide-vue-next'
import DataChart from './DataChart.vue'
import StructuredDataPreview from './StructuredDataPreview.vue'
import { DEFAULT_STRUCTURED_PREVIEW_OPTIONS, createStructuredPreview } from './previewSerialization'
import { workflowViewerRegistry } from './viewers/registry'
import {
  getResultGroups,
  getResultKindLabel,
  getResultRows,
  getResultViewerKey,
  normalizeWorkflowResult,
} from './resultView'

const props = defineProps<{
  visible: boolean
  title: string
  data: any
  appendTo?: HTMLElement | 'body' | 'self'
}>()

const emit = defineEmits(['close'])

const previewLimit = ref(3)
const sidebarCollapsed = useLocalStorage('data-analysis-modal:sidebar-collapsed', false)

const normalizedResult = computed(() => normalizeWorkflowResult(props.data))
const viewerKey = computed(() => getResultViewerKey(props.data))
const activeViewer = computed(() => {
  const key = viewerKey.value as keyof typeof workflowViewerRegistry | null
  return key ? workflowViewerRegistry[key] : null
})

const normalizedRows = computed(() => getResultRows(props.data))
const normalizedGroups = computed(() => getResultGroups(props.data))

const previewCount = computed(() => {
  if (normalizedResult.value?.kind === 'table') return normalizedRows.value.length
  if (normalizedResult.value?.kind === 'tableCollection') {
    return normalizedGroups.value.reduce((sum, group) => sum + group.data.length, 0)
  }
  if (Array.isArray(props.data)) return props.data.length
  return 0
})

const fallbackChartData = computed(() => {
  if (normalizedRows.value.length > 0) return normalizedRows.value
  if (normalizedGroups.value.length > 0) return normalizedGroups.value
  return []
})

const viewLabel = computed(() => getResultKindLabel(props.data))
const structuredPreview = computed(() =>
  createStructuredPreview(props.data, {
    ...DEFAULT_STRUCTURED_PREVIEW_OPTIONS,
    maxRows: Math.min(3, previewLimit.value),
    maxColumns: 12,
    maxStringLength: 18,
    maxGroups: 4,
    maxGroupRows: Math.max(1, Math.min(3, previewLimit.value)),
    maxObjectEntries: 8,
    maxTextLength: 3600,
  }),
)

const exportData = () => {
  const blob = new Blob([JSON.stringify(props.data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `data_analysis_${props.title.replace(/\s+/g, '_')}_${Date.now()}.json`
  anchor.click()
  URL.revokeObjectURL(url)
}
</script>

<template>
  <Dialog
    :visible="visible"
    modal
    :append-to="appendTo"
    class="analysis-dialog"
    :style="{ width: '90vw', height: '90vh' }"
    :closable="false"
    @update:visible="emit('close')"
  >
    <template #header>
      <div class="flex items-center justify-between w-full px-4 py-2">
        <div class="flex items-center gap-4">
          <div class="flex -space-x-2">
            <div
              class="w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center text-white shadow-lg shadow-slate-200/50 border-2 border-white relative z-10"
            >
              <BarChart3 :size="20" />
            </div>
            <div
              class="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center text-slate-400 border-2 border-white"
            >
              <Database :size="18" />
            </div>
          </div>
          <div>
            <div
              class="flex items-center gap-2 text-slate-400 text-[10px] font-black uppercase tracking-[0.2em] mb-0.5"
            >
              <span>工作流节点</span>
              <ChevronRight :size="10" />
              <span class="text-slate-800">{{ viewLabel }}</span>
            </div>
            <h2 class="text-xl font-black text-slate-800 tracking-tight">{{ title }}</h2>
          </div>
        </div>

        <div class="flex items-center gap-3">
          <button
            class="group flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 transition-all active:scale-95 cursor-pointer"
            @click="exportData"
          >
            <Download
              :size="16"
              class="text-slate-500 group-hover:text-slate-900 transition-colors"
            />
            <span class="text-xs font-bold text-slate-600 group-hover:text-slate-900"
              >导出原始结果</span
            >
          </button>
          <div class="w-[1px] h-8 bg-slate-100 mx-2"></div>
          <button
            class="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-red-50 text-slate-400 hover:text-red-500 transition-all cursor-pointer"
            @click="emit('close')"
          >
            <X :size="24" />
          </button>
        </div>
      </div>
    </template>

    <div class="flex h-full overflow-hidden bg-slate-50/50 p-4 gap-4">
      <!-- 折叠态：竖向图标条 -->
      <div
        v-if="sidebarCollapsed"
        class="flex flex-col items-center gap-3 py-3 w-11 shrink-0"
      >
        <button
          class="sidebar-toggle-btn"
          title="展开预览面板"
          @click="sidebarCollapsed = false"
        >
          <PanelLeftOpen :size="16" />
        </button>
        <div class="w-6 h-px bg-slate-200 my-1"></div>
        <button
          class="sidebar-icon-btn"
          title="结果预览"
          @click="sidebarCollapsed = false"
        >
          <FileJson :size="16" />
        </button>
      </div>

      <!-- 展开态：完整侧栏 -->
      <div
        v-else
        class="sidebar-expanded"
      >
        <div
          class="flex-1 bg-white rounded-2xl border border-slate-200/60 shadow-sm flex flex-col overflow-hidden"
        >
          <div class="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <div class="flex items-center gap-2">
              <FileJson :size="14" class="text-slate-500" />
              <span class="text-[10px] font-black text-slate-400 uppercase tracking-widest"
                >结果预览</span
              >
            </div>
            <div class="flex items-center gap-1.5">
              <div v-if="previewCount > 0" class="flex items-center gap-2">
                <span class="text-[9px] font-bold text-slate-400 uppercase">显示数量</span>
                <InputNumber
                  v-model="previewLimit"
                  :min="1"
                  :max="3"
                  class="preview-limit-input"
                  :use-grouping="false"
                />
              </div>
              <button
                class="sidebar-toggle-btn"
                title="收起预览面板"
                @click="sidebarCollapsed = true"
              >
                <PanelLeftClose :size="16" />
              </button>
            </div>
          </div>
          <div
            class="flex-1 overflow-auto p-5 font-mono text-[11px] leading-relaxed text-slate-600 custom-scrollbar bg-[#fafafa]"
          >
            <StructuredDataPreview
              :preview="structuredPreview"
              :text-max-length="3600"
              prefix="analysis-preview"
              allow-text-toggle
            />
          </div>
          <div
            v-if="previewCount > 0"
            class="px-5 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between"
          >
            <span class="text-[9px] font-bold text-slate-400 uppercase tracking-wider"
              >Total: {{ previewCount }} Records</span
            >
            <Layers :size="12" class="text-slate-400" />
          </div>
        </div>

        <div
          class="bg-slate-900 rounded-2xl p-5 text-slate-100 shadow-xl shadow-slate-200/50 relative overflow-hidden group border border-slate-800"
        >
          <div class="relative z-10">
            <div class="flex items-center gap-2 mb-2 opacity-80">
              <BarChart3 :size="12" class="text-slate-300" />
              <h4 class="text-[10px] font-black uppercase tracking-widest text-slate-300">
                系统提示
              </h4>
            </div>
            <p class="text-[11px] leading-relaxed font-medium text-slate-300">
              系统会优先根据 `NodeResult.preview.viewer` 自动选择最合适的结果查看器。
            </p>
          </div>
          <div
            class="absolute -right-4 -bottom-4 opacity-[0.03] group-hover:scale-110 transition-transform duration-700 pointer-events-none"
          >
            <BarChart3 :size="80" class="text-white" />
          </div>
        </div>
      </div>

      <div
        class="flex-1 flex flex-col min-w-0 bg-white rounded-2xl border border-slate-200/60 shadow-sm overflow-hidden"
      >
        <Suspense v-if="activeViewer" :timeout="0">
          <component :is="activeViewer" :key="String(viewerKey ?? viewLabel)" :data="props.data" />
          <template #fallback>
            <div
              data-test="result-viewer-loading"
              class="h-full flex flex-col items-center justify-center gap-4 bg-slate-50 px-6"
            >
              <div class="flex items-center gap-3">
                <span class="viewer-loading-dot viewer-loading-dot--primary" />
                <span class="viewer-loading-dot viewer-loading-dot--secondary" />
                <span class="viewer-loading-dot viewer-loading-dot--tertiary" />
              </div>
              <div class="text-center">
                <p class="text-sm font-bold text-slate-700">正在加载结果视图</p>
                <p class="mt-1 text-xs text-slate-500">图表或表格组件已命中按需加载，请稍候片刻。</p>
              </div>
            </div>
          </template>
        </Suspense>
        <DataChart v-else :data="fallbackChartData" />
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

.custom-scrollbar::-webkit-scrollbar {
  width: 5px;
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

.viewer-loading-dot {
  width: 10px;
  height: 10px;
  border-radius: 999px;
  background: #cbd5e1;
  animation: viewer-loading-bounce 1s ease-in-out infinite;
}

.viewer-loading-dot--primary {
  background: #2563eb;
}

.viewer-loading-dot--secondary {
  animation-delay: 0.12s;
}

.viewer-loading-dot--tertiary {
  animation-delay: 0.24s;
}

@keyframes viewer-loading-bounce {
  0%,
  80%,
  100% {
    transform: translateY(0);
    opacity: 0.45;
  }
  40% {
    transform: translateY(-5px);
    opacity: 1;
  }
}

.sidebar-expanded {
  width: 20rem;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.sidebar-toggle-btn {
  width: 2rem;
  height: 2rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 0.625rem;
  color: #64748b;
  cursor: pointer;
  transition: all 0.15s ease;
  background: transparent;
  border: none;
}
.sidebar-toggle-btn:hover {
  background: #f1f5f9;
  color: #0f172a;
}
.sidebar-toggle-btn:active {
  transform: scale(0.92);
}

.sidebar-icon-btn {
  width: 2rem;
  height: 2rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 0.625rem;
  color: #94a3b8;
  cursor: pointer;
  transition: all 0.15s ease;
  background: transparent;
  border: none;
}
.sidebar-icon-btn:hover {
  background: #f1f5f9;
  color: #2563eb;
}
</style>
