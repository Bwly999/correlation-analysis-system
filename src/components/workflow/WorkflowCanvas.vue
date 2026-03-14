<script setup lang="ts">
import { VueFlow, useVueFlow, type Connection } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import { useWorkflowStore, type WorkflowNode } from '@/stores/workflowStore'
import NodeSidebar from './NodeSidebar.vue'
import WorkflowHeader from './WorkflowHeader.vue'
import BaseNode from './nodes/BaseNode.vue'
import LogPanel from './LogPanel.vue'
import NodeConfigModal from './NodeConfigModal.vue'
import RuntimeInputModal from './RuntimeInputModal.vue'
import DataAnalysisModal from './DataAnalysisModal.vue'
import WorkflowManagerModal from './WorkflowManagerModal.vue'
import Button from 'primevue/button'
import N8nEdge from './edges/N8nEdge.vue'
import {
  ChevronUp,
  ChevronDown,
  Play,
  Terminal,
  Square,
  Focus,
  AlertTriangle,
  Undo2,
  ChevronLeft,
  ChevronRight,
} from 'lucide-vue-next'
import ConfirmDialog from 'primevue/confirmdialog'

const { onConnect, addEdges, project, findNode, fitView } = useVueFlow()
const store = useWorkflowStore()

const selectedNode = ref<WorkflowNode | null>(null)
const isConfigVisible = ref(false)
const isLogExpanded = ref(true)
const isWorkflowListVisible = ref(false)
const isSidebarVisible = ref(true)

// 初始化加载
onMounted(async () => {
  const workflows = await store.getSavedWorkflows()
  // 如果没有工作流，自动打开管理中心
  if (workflows.length === 0) {
    isWorkflowListVisible.value = true
  }
})

// 深度分析弹窗状态
const analysisModal = ref({ visible: false, title: '', data: null as any })

const openWorkflowList = async () => {
  isWorkflowListVisible.value = true
}

const resetView = async () => {
  await nextTick()
  fitView({ padding: 0.2, duration: 800 })
}

// 监听视图复位信号
watch(
  () => store.needsViewReset,
  (val) => {
    if (val) {
      resetView()
      store.needsViewReset = false
    }
  },
)

const resumeExecution = async () => {
  if (store.pendingExecution) {
    store.pendingExecution = null
    await store.runGlobal()
  }
}

watch(
  () => store.lastExecutedTerminalNodeId,
  (nodeId) => {
    if (nodeId) {
      const node = findNode(nodeId) as WorkflowNode
      if (node && node.data.output) {
        analysisModal.value = {
          visible: true,
          title: `${node.data.label} 分析结果`,
          data: node.data.output,
        }
        store.lastExecutedTerminalNodeId = null
      }
    }
  },
)

watch(
  () => store.activeConfigNodeId,
  (nodeId) => {
    if (nodeId) {
      const node = findNode(nodeId)
      if (node) {
        selectedNode.value = node as WorkflowNode
        isConfigVisible.value = true
      }
    }
  },
)

watch(
  () => store.pendingConnection,
  (pending) => {
    if (pending) {
      isSidebarVisible.value = true
    }
  },
)

const toggleSidebar = () => {
  isSidebarVisible.value = !isSidebarVisible.value
}

watch(isConfigVisible, (visible) => {
  if (!visible) store.activeConfigNodeId = null
})

onConnect((params: Connection) => {
  const { valid } = store.validateConnection(params.source, params.target)
  if (valid) addEdges(params)
})

const onDragOverLocal = (event: DragEvent) => {
  event.preventDefault()
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
}

const onDropLocal = (event: DragEvent) => {
  const type = event.dataTransfer?.getData('application/vueflow')
  const label = event.dataTransfer?.getData('application/label')
  if (!type || !label) return

  const { left, top } = (event.target as HTMLElement).getBoundingClientRect()
  const position = project({ x: event.clientX - left, y: event.clientY - top })
  store.addAndConnectNode(type, label, position)
}

onMounted(() => {
  if (store.nodes.length > 0) {
    resetView()
  } else {
    openWorkflowList()
  }
})
</script>

<template>
  <div
    class="flex h-screen w-full bg-[#f1f5f9] text-[#1a1f36] overflow-hidden relative font-sans text-[13px] selection:bg-indigo-100"
  >
    <WorkflowHeader @open-projects="openWorkflowList" />

    <main
      :style="{ bottom: isLogExpanded ? '300px' : '44px' }"
      class="absolute inset-0 top-[56px] overflow-hidden shadow-[inset_0_2px_10px_rgba(0,0,0,0.05)] border-t border-slate-200 transition-all duration-300 ease-in-out"
    >
      <!-- 历史模式提示条 -->
      <div
        v-if="store.isHistoryMode"
        class="absolute top-0 left-0 right-0 z-[110] bg-amber-500 text-white px-6 py-2.5 flex items-center justify-between shadow-lg animate-in slide-in-from-top duration-300"
      >
        <div class="flex items-center gap-3">
          <div class="p-1.5 bg-white/20 rounded-lg">
            <AlertTriangle size="18" class="text-white" />
          </div>
          <div class="flex flex-col">
            <span class="font-bold text-[13px] tracking-tight">历史记录查看模式</span>
            <span class="text-[11px] opacity-90">当前工作流处于只读状态，编辑与运行功能已禁用</span>
          </div>
        </div>
        <Button
          severity="secondary"
          class="h-8 px-4 text-[11px] font-bold bg-white/20 hover:bg-white/30 border-none text-white rounded-lg flex items-center gap-2 transition-all active:scale-95"
          @click="store.exitHistoryMode()"
        >
          <Undo2 size="14" />
          返回编辑模式
        </Button>
      </div>

      <VueFlow
        v-model:nodes="store.nodes"
        v-model:edges="store.edges"
        :default-edge-options="{
          animated: true,
          style: { stroke: '#cbd5e1', strokeWidth: 2.5 },
          type: 'n8n',
        }"
        :nodes-draggable="!store.isHistoryMode"
        :nodes-connectable="!store.isHistoryMode"
        :elements-selectable="!store.isHistoryMode"
        :select-nodes-on-drag="!store.isHistoryMode"
        :pan-on-drag="true"
        :zoom-on-scroll="true"
        class="bg-[#f4f7fa] transition-colors duration-500"
        :class="{ 'grayscale-[0.2] sepia-[0.1]': store.isHistoryMode }"
        @dragover="onDragOverLocal"
        @drop="onDropLocal"
      >
        <template #node-custom="props"><BaseNode v-bind="props" /></template>
        <template #edge-n8n="props"><N8nEdge v-bind="props" /></template>

        <Background
          :gap="20"
          pattern-type="lines"
          :size="1"
          :pattern-color="store.isHistoryMode ? '#e5e7eb' : '#e2e8f0'"
        />
        <Background
          :gap="100"
          pattern-type="lines"
          :size="1"
          :pattern-color="store.isHistoryMode ? '#d1d5db' : '#cbd5e1'"
        />

        <Controls
          position="bottom-left"
          class="ml-6 mb-6 transition-all duration-300 !bg-white !border-[#efefef] !shadow-xl !rounded-2xl !p-1"
        >
          <template #control-button-reset></template>
        </Controls>

        <div
          v-if="!store.isHistoryMode"
          class="absolute right-0 top-1/2 -translate-y-1/2 z-[100] transition-all duration-500 ease-in-out"
          :style="{ right: isSidebarVisible ? '340px' : '0' }"
        >
          <button
            v-tooltip.left="isSidebarVisible ? '关闭节点库' : '打开节点库'"
            class="w-6 h-14 bg-white border border-[#efefef] border-r-0 rounded-l-xl shadow-[-5px_0_15px_rgba(0,0,0,0.05)] flex items-center justify-center text-[#3c4257] hover:text-indigo-600 hover:bg-indigo-50 transition-all cursor-pointer group"
            @click="toggleSidebar"
          >
            <component
              :is="isSidebarVisible ? ChevronRight : ChevronLeft"
              size="16"
              stroke-width="3"
            />
          </button>
        </div>

        <div class="absolute left-6 bottom-6 z-[100] flex flex-col gap-2">
          <button
            v-tooltip.right="'复位视图'"
            class="w-10 h-10 bg-white border border-[#efefef] rounded-xl shadow-xl flex items-center justify-center text-[#3c4257] hover:text-indigo-600 transition-all active:scale-90 group cursor-pointer"
            @click="resetView"
          >
            <Focus size="18" />
          </button>
        </div>
      </VueFlow>
    </main>

    <aside
      v-if="!store.isHistoryMode"
      class="absolute right-0 top-[60px] z-[130] transition-all duration-500 ease-in-out shadow-[-20px_0_50px_rgba(0,0,0,0.03)]"
      :class="isSidebarVisible ? 'translate-x-0' : 'translate-x-full'"
      :style="{ width: '340px', bottom: isLogExpanded ? '300px' : '44px' }"
    >
      <NodeSidebar @close="isSidebarVisible = false" />
    </aside>

    <div
      v-if="!store.isHistoryMode"
      class="absolute left-1/2 -translate-x-1/2 z-[90] transition-all duration-500 flex gap-3"
      :style="{ bottom: isLogExpanded ? '320px' : '64px' }"
    >
      <Button
        :disabled="store.isRunning || !!store.pendingExecution"
        class="n8n-execute-bar w-[280px] h-[52px] rounded-2xl shadow-[0_20px_50px_-10px_rgba(16,185,129,0.4)] hover:shadow-emerald-400/60 transform hover:-translate-y-1 transition-all active:scale-[0.97] border-none flex items-center justify-center text-white"
        @click="store.runGlobal"
      >
        <Play size="20" fill="currentColor" class="mr-3" />
        <span class="text-[14px] font-black tracking-widest uppercase">开始运行工作流</span>
      </Button>
      <Button
        v-if="store.isRunning || !!store.pendingExecution"
        v-tooltip.top="'停止执行'"
        severity="danger"
        class="w-[52px] h-[52px] rounded-2xl shadow-xl flex items-center justify-center animate-in fade-in zoom-in-75 duration-300"
        @click="store.stopExecution"
      >
        <Square size="20" fill="currentColor" />
      </Button>
    </div>

    <footer
      class="absolute bottom-0 left-0 right-0 z-[120] transition-all duration-300 ease-in-out flex flex-col"
      :style="{ height: isLogExpanded ? '300px' : '44px' }"
    >
      <div
        class="h-11 min-h-[44px] bg-white border-t border-[#efefef] flex items-center justify-between px-6 shadow-[0_-1px_3px_rgba(0,0,0,0.02)] relative z-10"
      >
        <div class="flex items-center gap-4 h-full">
          <button
            class="flex items-center gap-3 h-full px-4 -ml-6 hover:bg-[#f7f9fc] transition-colors group border-r border-[#f1f4f8] cursor-pointer"
            @click="isLogExpanded = !isLogExpanded"
          >
            <component
              :is="isLogExpanded ? ChevronDown : ChevronUp"
              size="16"
              class="text-indigo-600 transition-transform duration-300"
            />
            <div class="flex items-center gap-2.5">
              <Terminal size="14" :class="isLogExpanded ? 'text-indigo-600' : 'text-[#a3acb9]'" />
              <span
                class="text-[11px] font-black uppercase tracking-[0.1em]"
                :class="isLogExpanded ? 'text-[#1a1f36]' : 'text-[#8792a2]'"
                >执行记录</span
              >
            </div>
          </button>
        </div>
        <div
          class="flex items-center gap-4 text-[10px] font-bold text-[#a3acb9] uppercase tracking-widest"
        >
          <span class="flex items-center gap-1.5"
            ><div class="w-1.5 h-1.5 bg-emerald-500 rounded-full"></div>
            系统状态: 运行正常</span
          >
          <div class="w-[1px] h-3 bg-[#f1f4f8]"></div>
          <span>版本 v1.0.5</span>
        </div>
      </div>
      <div v-if="isLogExpanded" class="flex-1 w-full overflow-hidden bg-white shadow-inner">
        <LogPanel />
      </div>
    </footer>

    <WorkflowManagerModal :visible="isWorkflowListVisible" @close="isWorkflowListVisible = false" />
    <NodeConfigModal
      :visible="isConfigVisible"
      :node-id="store.activeConfigNodeId"
      @close="isConfigVisible = false"
    />
    <RuntimeInputModal
      :visible="!!store.pendingExecution"
      :node="store.nodes.find((n) => n.id === store.pendingExecution?.nodeId) || null"
      @close="store.pendingExecution = null"
      @confirm="resumeExecution"
    />
    <DataAnalysisModal
      :visible="analysisModal.visible"
      :title="analysisModal.title"
      :data="analysisModal.data"
      @close="analysisModal.visible = false"
    />
    <ConfirmDialog />
  </div>
</template>

<style>
@import '@vue-flow/core/dist/style.css';
@import '@vue-flow/core/dist/theme-default.css';

.vue-flow__node-custom {
  border: none;
  padding: 0;
  background: transparent;
}
.n8n-execute-bar {
  background: linear-gradient(135deg, #10b981 0%, #059669 100%) !important;
}
.n8n-execute-bar:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  transform: none;
}
</style>
