<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { VueFlow, useVueFlow, type Connection } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import { useWorkflowStore } from '@/stores/workflowStore'
import { useWorkflowAiStore } from '@/stores/workflowAiStore'
import NodeSidebar from './NodeSidebar.vue'
import WorkflowHeader from './WorkflowHeader.vue'
import AgentWorkspace from '../agent/AgentWorkspace.vue'
import BaseNode from './nodes/BaseNode.vue'
import LogPanel from './LogPanel.vue'
import NodeConfigModal from './NodeConfigModal.vue'
import DataAnalysisModal from './DataAnalysisModal.vue'
import RuntimeInputModal from './RuntimeInputModal.vue'
import WorkflowResultDashboardModal from './WorkflowResultDashboardModal.vue'
import WorkflowManagerModal from './WorkflowManagerModal.vue'
import HelpCenterModal from './HelpCenterModal.vue'
import WorkflowHistoryBanner from './WorkflowHistoryBanner.vue'
import WorkflowFloatingControls from './WorkflowFloatingControls.vue'
import { getWorkflowLayoutMetrics } from './layout'
import { buildResultDashboardSummary, type WorkflowResultDashboardSummary } from './resultDashboard'
import N8nEdge from './edges/N8nEdge.vue'
import {
  ChevronUp,
  ChevronDown,
  Terminal,
  Focus,
  ChevronLeft,
  ChevronRight,
} from 'lucide-vue-next'
import ConfirmDialog from 'primevue/confirmdialog'
import Toast from 'primevue/toast'
import { useToast } from 'primevue/usetoast'
import UnsavedWorkflowDialog from './UnsavedWorkflowDialog.vue'

const { onConnect, addEdges, project, findNode, fitView, getViewport, setViewport } = useVueFlow()
const store = useWorkflowStore()
const aiStore = useWorkflowAiStore()
const toast = useToast()

const isConfigVisible = ref(false)
const isLogExpanded = ref(true)
const isWorkflowListVisible = ref(false)
const workflowManagerInitialTab = ref('0')
const isSidebarVisible = ref(true)
const isAiPanelVisible = ref(false)
const isHelpCenterVisible = ref(false)
const viewportWidth = ref(typeof window === 'undefined' ? 1920 : window.innerWidth)
const isUnsavedDialogVisible = ref(false)
const pendingWorkflowAction = ref<(() => Promise<void> | void) | null>(null)
const isResettingView = ref(false)

const layoutMetrics = computed(() => getWorkflowLayoutMetrics(viewportWidth.value))
const logHeight = computed(() =>
  isLogExpanded.value ? layoutMetrics.value.logExpandedHeight : layoutMetrics.value.logCollapsedHeight,
)
const runBarBottom = computed(() => logHeight.value + 20)
const executionRecordRightInset = computed(() => {
  if (store.isHistoryMode || !isSidebarVisible.value) {
    return 0
  }

  return layoutMetrics.value.sidebarWidth
})
const executionRecordStyle = computed(() => ({
  height: `${logHeight.value}px`,
  right: '0px',
}))
const executionRecordHeaderStyle = computed(() => ({
  paddingRight: `${24 + executionRecordRightInset.value}px`,
}))
const executionRecordBodyStyle = computed(() => ({
  marginRight: `${executionRecordRightInset.value}px`,
}))
const isAgentMode = computed(() => isAiPanelVisible.value)
const executionWorkspaceBanner = computed(() => {
  const hasAppliedPlan = Boolean(aiStore.lastAppliedSnapshotId) || aiStore.autoApplyResult.status === 'applied'
  const hasFailedApply = aiStore.autoApplyResult.status === 'failed'
  const isAgentStreaming = aiStore.streamStatus === 'streaming'

  if (!isAgentStreaming && !hasAppliedPlan && !hasFailedApply) {
    return null
  }

  return {
    tone: isAgentStreaming ? 'running' : hasFailedApply ? 'failed' : 'applied',
    headline:
      aiStore.streamHeadline
      || aiStore.projectionSnapshot?.analysis.summary
      || '自动分析已完成',
    detail: hasFailedApply
      ? (aiStore.autoApplyResult.message || '最终计划已生成，但同步到画布失败。')
      : hasAppliedPlan
        ? '已自动同步到画布'
        : '系统正在自动执行并分析当前流程',
  }
})
const runBarState = computed<'idle' | 'running' | 'pending'>(() => {
  if (store.pendingExecution) return 'pending'
  if (store.isRunning) return 'running'
  return 'idle'
})
const runButtonTitle = computed(() => {
  if (runBarState.value === 'pending') return '等待继续执行'
  if (runBarState.value === 'running') return '工作流运行中'
  return '开始运行工作流'
})
const runButtonSubtitle = computed(() => {
  if (runBarState.value === 'pending') return '请先补全缺失输入后继续执行当前链路'
  if (runBarState.value === 'running') return '系统正在按顺序执行整条工作流'
  return '从触发节点启动整条工作流链路'
})
const isMacLikePlatform =
  typeof navigator !== 'undefined' && /(Mac|iPhone|iPod|iPad)/i.test(navigator.platform)
const isCanvasShortcutBlocked = computed(
  () =>
    isConfigVisible.value ||
    !!store.pendingExecution ||
    resultDashboardModal.value.visible ||
    isWorkflowListVisible.value ||
    isUnsavedDialogVisible.value ||
    isHelpCenterVisible.value,
)
const deleteKeyCode = computed(() => (isCanvasShortcutBlocked.value ? null : 'Backspace'))
const selectionKeyCode = computed(() => (isCanvasShortcutBlocked.value ? false : 'Shift'))
const multiSelectionKeyCode = computed(() =>
  isCanvasShortcutBlocked.value ? null : isMacLikePlatform ? 'Meta' : 'Control',
)
const zoomActivationKeyCode = computed(() =>
  isCanvasShortcutBlocked.value ? null : isMacLikePlatform ? 'Meta' : 'Control',
)
const panActivationKeyCode = computed(() => (isCanvasShortcutBlocked.value ? null : 'Space'))

const onWindowResize = () => {
  viewportWidth.value = window.innerWidth
}

const handleOpenLogPanel = () => {
  isLogExpanded.value = true
}

const saveWorkflowWithToast = async () => {
  try {
    await store.saveWorkflow()
    toast.add({
      severity: 'success',
      summary: '保存成功',
      detail: `工作流“${store.workflowName}”已保存。`,
      life: 2500,
    })
    return true
  } catch (error) {
    console.error('保存工作流失败', error)
    toast.add({
      severity: 'error',
      summary: '保存失败',
      detail: '保存当前工作流时发生错误，请稍后重试。',
      life: 4000,
    })
    return false
  }
}

const clearPendingWorkflowAction = () => {
  pendingWorkflowAction.value = null
  isUnsavedDialogVisible.value = false
}

const executePendingWorkflowAction = async () => {
  const action = pendingWorkflowAction.value
  clearPendingWorkflowAction()
  if (action) {
    await action()
  }
}

const runWorkflowActionWithGuard = async (action: () => Promise<void> | void) => {
  if (store.isHistoryMode || !store.hasUnsavedChanges) {
    await action()
    return
  }

  pendingWorkflowAction.value = action
  isUnsavedDialogVisible.value = true
}

const handleCreateWorkflow = async () => {
  await runWorkflowActionWithGuard(async () => {
    isWorkflowListVisible.value = false
    store.createNewWorkflow()
  })
}

const handleCreateWorkflowFromTemplate = async (templateId: string) => {
  await runWorkflowActionWithGuard(async () => {
    isWorkflowListVisible.value = false
    store.createWorkflowFromTemplate(templateId)
  })
}

const handleLoadWorkflow = async (id: string) => {
  await runWorkflowActionWithGuard(async () => {
    isWorkflowListVisible.value = false
    await nextTick()
    await store.loadWorkflow(id)
  })
}

const handleImportWorkflow = async (file: File) => {
  await runWorkflowActionWithGuard(async () => {
    store.importWorkflow(file)
  })
}

const handleSaveBeforeContinue = async () => {
  const saved = await saveWorkflowWithToast()
  if (!saved) return
  await executePendingWorkflowAction()
}

const handleDiscardBeforeContinue = async () => {
  await executePendingWorkflowAction()
}

const handleCancelWorkflowTransition = () => {
  clearPendingWorkflowAction()
}

const handleBeforeUnload = (event: BeforeUnloadEvent) => {
  if (store.isHistoryMode || !store.hasUnsavedChanges) return
  event.preventDefault()
  event.returnValue = ''
}

onMounted(async () => {
  window.addEventListener('resize', onWindowResize)
  window.addEventListener('beforeunload', handleBeforeUnload)
  window.addEventListener('workflow:open-log-panel', handleOpenLogPanel)
  await store.getSavedWorkflows()

  if (store.nodes.length > 0) {
    store.needsViewReset = true
    return
  }

  openWorkflowList()
})

const resultDashboardModal = ref<{
  visible: boolean
  summary: WorkflowResultDashboardSummary | null
}>({
  visible: false,
  summary: null,
})

const activePreviewNode = computed(() =>
  store.nodes.find((node) => node.id === store.activePreviewNodeId) ?? null,
)
const activePreviewTitle = computed(() => {
  if (!activePreviewNode.value) return ''
  return `${activePreviewNode.value.data.label} · 结果预览`
})

const openWorkflowList = async (initialTab = '0') => {
  workflowManagerInitialTab.value = initialTab
  isWorkflowListVisible.value = true
}

const openTemplateLibrary = async () => {
  await openWorkflowList('2')
}

const waitForViewportStabilized = async () => {
  await nextTick()
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
}

const resetView = async () => {
  if (isResettingView.value) return

  isResettingView.value = true
  try {
    await waitForViewportStabilized()
    const initialViewport = getViewport()

    await fitView({ padding: 0.2, duration: 0 })

    const fittedViewport = getViewport()
    const targetViewport = isSidebarVisible.value
      ? {
          ...fittedViewport,
          x: fittedViewport.x - layoutMetrics.value.sidebarWidth / 2,
        }
      : fittedViewport

    await setViewport(initialViewport, { duration: 0 })
    await setViewport(targetViewport, { duration: 800 })
  } finally {
    isResettingView.value = false
  }
}

watch(
  [() => store.needsViewReset, () => isWorkflowListVisible.value],
  async ([needsViewReset, workflowListVisible]) => {
    if (needsViewReset && !workflowListVisible) {
      store.needsViewReset = false
      await resetView()
    }
  },
)

const resumeExecution = async (payload?: {
  config: Record<string, any>
  reuseLastRuntimeInputs: boolean
}) => {
  if (store.pendingExecution) {
    const pendingNode = store.nodes.find((node) => node.id === store.pendingExecution?.nodeId)
    if (pendingNode && payload) {
      pendingNode.data.config = { ...pendingNode.data.config, ...payload.config }
      pendingNode.data.reuseLastRuntimeInputs = payload.reuseLastRuntimeInputs
    }
    await store.resumePendingExecution()
  }
}

watch(
  () => store.lastRunDashboard,
  (dashboard) => {
    if (!dashboard) {
      resultDashboardModal.value = {
        visible: false,
        summary: null,
      }
      return
    }

    const scopedNodes = store.nodes.filter((node) =>
      dashboard.executionScopeNodeIds.includes(node.id),
    )

    resultDashboardModal.value = {
      visible: true,
      summary: buildResultDashboardSummary({
        workflowName: dashboard.workflowName,
        status: dashboard.status,
        startTime: dashboard.startTime,
        duration: dashboard.duration,
        executionTargetIds: dashboard.executionTargetIds,
        terminalNodeIds: dashboard.terminalNodeIds,
        nodes: scopedNodes,
      }),
    }
  },
  { immediate: true },
)

watch(
  () => store.activeConfigNodeId,
  (nodeId: string | null) => {
    if (nodeId) {
      const node = findNode(nodeId)
      if (node) {
        isConfigVisible.value = true
      }
    }
  },
)

watch(
  () => store.pendingConnection,
  (pending: any) => {
    if (pending) {
      isSidebarVisible.value = true
    }
  },
)

watch(
  () => `${store.nodes.map((node) => node.id).join('|')}::${store.edges.map((edge) => edge.id).join('|')}`,
  () => {
    if (!aiStore.activeSession) return
    aiStore.syncAnalysisCanvas(store as any)
  },
)

const toggleSidebar = () => {
  isSidebarVisible.value = !isSidebarVisible.value
}

const toggleAiPanel = () => {
  isAiPanelVisible.value = !isAiPanelVisible.value
}

watch(isConfigVisible, (visible: boolean) => {
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

onBeforeUnmount(() => {
  window.removeEventListener('resize', onWindowResize)
  window.removeEventListener('beforeunload', handleBeforeUnload)
  window.removeEventListener('workflow:open-log-panel', handleOpenLogPanel)
})
</script>

<template>
  <div
    class="flex h-screen w-full overflow-hidden bg-slate-100 text-[13px] text-slate-900 relative font-sans selection:bg-blue-100"
  >
    <WorkflowHeader
      :is-ai-panel-visible="isAiPanelVisible"
      @open-projects="openWorkflowList"
      @open-template-library="openTemplateLibrary"
      @new-workflow="handleCreateWorkflow"
      @import-workflow="handleImportWorkflow"
      @open-help="isHelpCenterVisible = true"
      @toggle-ai="toggleAiPanel"
    />

    <main
      :style="{ bottom: `${logHeight}px` }"
      class="absolute inset-0 top-[56px] overflow-hidden border-t border-slate-200"
    >
      <WorkflowHistoryBanner v-if="store.isHistoryMode" @exit="store.exitHistoryMode()" />

      <div class="workflow-workspace" :class="{ 'workflow-workspace--agent': isAgentMode }">
        <AgentWorkspace
          :visible="isAiPanelVisible"
          @focus-report="() => undefined"
        />

        <section class="execution-workspace">
          <div class="execution-workspace__panel">
            <div
              v-if="executionWorkspaceBanner"
              data-testid="execution-workspace-banner"
              class="execution-workspace__banner"
              :class="`is-${executionWorkspaceBanner.tone}`"
            >
              <strong>{{ executionWorkspaceBanner.headline }}</strong>
              <span>{{ executionWorkspaceBanner.detail }}</span>
            </div>

            <div class="execution-canvas-shell">
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
                :elements-selectable="true"
                :select-nodes-on-drag="!store.isHistoryMode"
                :pan-on-drag="true"
                :zoom-on-scroll="true"
                :delete-key-code="deleteKeyCode"
                :selection-key-code="selectionKeyCode"
                :multi-selection-key-code="multiSelectionKeyCode"
                :zoom-activation-key-code="zoomActivationKeyCode"
                :pan-activation-key-code="panActivationKeyCode"
                class="execution-canvas-shell__flow"
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
                  class="transition-all duration-300 !bg-white !border-[#efefef] !shadow-xl !rounded-2xl !p-1"
                  :style="{
                    marginLeft: `${layoutMetrics.contentPadding}px`,
                    marginBottom: `${layoutMetrics.contentPadding}px`,
                  }"
                >
                  <template #control-button-reset></template>
                </Controls>

                <div
                  v-if="!store.isHistoryMode"
                  class="absolute right-0 top-1/2 -translate-y-1/2 z-[100] transition-all duration-500 ease-in-out"
                  :style="{ right: isSidebarVisible ? `${layoutMetrics.sidebarWidth}px` : '0' }"
                >
                  <button
                    v-tooltip.left="isSidebarVisible ? '收起节点库' : '打开节点库'"
                    class="w-6 h-14 bg-white border border-[#efefef] border-r-0 rounded-l-xl shadow-[-5px_0_15px_rgba(0,0,0,0.05)] flex items-center justify-center text-[#3c4257] hover:text-blue-600 hover:bg-blue-50 transition-all cursor-pointer group"
                    @click="toggleSidebar"
                  >
                    <component
                      :is="isSidebarVisible ? ChevronRight : ChevronLeft"
                      :size="16"
                      :stroke-width="3"
                    />
                  </button>
                </div>

                <div
                  class="absolute z-[100] flex flex-col gap-2 transition-all duration-300"
                  :style="{ left: `${layoutMetrics.contentPadding}px`, bottom: `${layoutMetrics.contentPadding}px` }"
                >
                  <button
                    v-tooltip.right="'复位视图'"
                    class="w-10 h-10 bg-white border border-[#efefef] rounded-xl shadow-xl flex items-center justify-center text-[#3c4257] hover:text-blue-600 transition-all active:scale-90 group cursor-pointer"
                    @click="resetView"
                  >
                    <Focus :size="18" />
                  </button>
                </div>
              </VueFlow>
            </div>
          </div>
        </section>
      </div>
    </main>

    <aside
      v-if="!store.isHistoryMode"
      class="workflow-page-sidebar"
      :class="{ 'workflow-page-sidebar--collapsed': !isSidebarVisible }"
      :style="{ width: `${layoutMetrics.sidebarWidth}px` }"
    >
      <NodeSidebar @close="isSidebarVisible = false" />
    </aside>

    <WorkflowFloatingControls
      :visible="!store.isHistoryMode || !!resultDashboardModal.summary"
      :show-run-actions="!store.isHistoryMode"
      :is-running="store.isRunning"
      :has-pending-execution="!!store.pendingExecution"
      :has-result-dashboard="!!resultDashboardModal.summary"
      :run-bar-bottom="runBarBottom"
      :run-button-title="runButtonTitle"
      :run-button-subtitle="runButtonSubtitle"
      :run-bar-state="runBarState"
      @run="store.runGlobal"
      @stop="store.stopExecution"
      @open-dashboard="resultDashboardModal.visible = true"
    />

    <footer
      class="absolute bottom-0 left-0 z-[80] transition-all duration-300 ease-in-out flex flex-col"
      :style="executionRecordStyle"
    >
      <div
        data-testid="execution-record-header"
        class="execution-record-header h-11 min-h-[44px] bg-white border-t border-[#efefef] flex items-center justify-between gap-3 px-6 shadow-[0_-1px_3px_rgba(0,0,0,0.02)] relative z-10"
        :style="executionRecordHeaderStyle"
      >
        <div class="flex items-center gap-4 h-full">
          <button
            class="flex items-center gap-3 h-full px-4 -ml-6 hover:bg-[#f7f9fc] transition-colors group border-r border-[#f1f4f8] cursor-pointer"
            @click="isLogExpanded = !isLogExpanded"
          >
            <component
              :is="isLogExpanded ? ChevronDown : ChevronUp"
              :size="16"
              class="text-blue-600 transition-transform duration-300"
            />
            <div class="flex items-center gap-2.5">
              <Terminal :size="14" :class="isLogExpanded ? 'text-blue-600' : 'text-[#a3acb9]'" />
              <span
                class="text-[11px] font-black uppercase tracking-[0.1em]"
                :class="isLogExpanded ? 'text-[#1a1f36]' : 'text-[#8792a2]'"
                >执行记录</span
              >
            </div>
          </button>
        </div>
        <div
          class="flex max-w-full flex-wrap items-center justify-end gap-x-4 gap-y-1 text-[10px] font-bold text-[#a3acb9] uppercase tracking-widest text-right"
        >
          <span class="flex items-center gap-1.5"
            ><div class="w-1.5 h-1.5 bg-emerald-500 rounded-full"></div>
            系统状态 · 运行正常</span
          >
          <div class="w-[1px] h-3 bg-[#f1f4f8]"></div>
          <span>版本 v1.0.5</span>
        </div>
      </div>
      <div v-if="isLogExpanded" class="flex-1 w-full overflow-hidden bg-white shadow-inner">
        <div class="execution-record-body h-full" :style="executionRecordBodyStyle">
          <LogPanel />
        </div>
      </div>
    </footer>

    <WorkflowManagerModal
      :initial-tab="workflowManagerInitialTab"
      :visible="isWorkflowListVisible"
      @close="isWorkflowListVisible = false"
      @create-workflow="handleCreateWorkflow"
      @create-workflow-from-template="handleCreateWorkflowFromTemplate"
      @load-workflow="handleLoadWorkflow"
    />
    <NodeConfigModal
      :visible="isConfigVisible"
      :node-id="store.activeConfigNodeId"
      @close="isConfigVisible = false"
    />
    <DataAnalysisModal
      :visible="!!activePreviewNode"
      :title="activePreviewTitle"
      :data="activePreviewNode?.data.output ?? null"
      @close="store.setActivePreviewNodeId(null)"
    />
    <RuntimeInputModal
      :visible="!!store.pendingExecution"
      :node="store.nodes.find((n) => n.id === store.pendingExecution?.nodeId) || null"
      @close="store.cancelPendingExecution()"
      @confirm="resumeExecution"
    />
    <WorkflowResultDashboardModal
      :visible="resultDashboardModal.visible"
      :summary="resultDashboardModal.summary"
      @close="resultDashboardModal.visible = false"
    />
    <UnsavedWorkflowDialog
      :visible="isUnsavedDialogVisible"
      @save="handleSaveBeforeContinue"
      @discard="handleDiscardBeforeContinue"
      @cancel="handleCancelWorkflowTransition"
    />
    <HelpCenterModal :visible="isHelpCenterVisible" @close="isHelpCenterVisible = false" />
    <ConfirmDialog />
    <Toast />
    <Toast group="node-config" position="bottom-left" />
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

.workflow-workspace {
  position: relative;
  height: 100%;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: minmax(0, 1fr);
}

.workflow-workspace--agent {
  display: grid;
  grid-template-columns: minmax(0, 42%) minmax(0, 58%);
  grid-template-rows: minmax(0, 1fr);
}

.execution-workspace {
  height: 100%;
  min-width: 0;
  min-height: 0;
  position: relative;
  background:
    radial-gradient(120% 140% at 100% 0%, rgba(148, 163, 184, 0.08) 0%, rgba(255, 255, 255, 0) 42%),
    linear-gradient(180deg, #f8fafc 0%, #eef2f7 100%);
}

.execution-workspace__panel {
  height: 100%;
  min-height: 0;
  position: relative;
}

.execution-workspace__banner {
  position: absolute;
  top: 18px;
  left: 18px;
  right: 18px;
  z-index: 120;
  display: grid;
  gap: 4px;
  padding: 14px 16px;
  border-radius: 18px;
  border: 1px solid #dbe4ef;
  background: rgba(255, 255, 255, 0.94);
  backdrop-filter: blur(12px);
  box-shadow: 0 24px 40px -34px rgba(15, 23, 42, 0.45);
}

.execution-workspace__banner strong {
  color: #0f172a;
  font-size: 13px;
}

.execution-workspace__banner span {
  color: #475569;
  font-size: 12px;
  line-height: 1.6;
}

.execution-workspace__banner.is-running {
  border-color: #bfdbfe;
  background: rgba(239, 246, 255, 0.96);
}

.execution-workspace__banner.is-applied {
  border-color: #bbf7d0;
  background: rgba(240, 253, 244, 0.96);
}

.execution-workspace__banner.is-failed {
  border-color: #fecaca;
  background: rgba(254, 242, 242, 0.96);
}

.execution-canvas-shell {
  position: relative;
  height: 100%;
  min-height: 0;
}

.execution-canvas-shell__flow {
  height: 100%;
  background: #f4f7fa;
  transition: color 0.5s ease;
}

.workflow-page-sidebar {
  position: absolute;
  top: 56px;
  right: 0;
  bottom: 0;
  z-index: 130;
  overflow: hidden;
  transition:
    transform 0.5s ease,
    opacity 0.35s ease;
  box-shadow: -20px 0 50px rgba(0, 0, 0, 0.03);
}

.workflow-page-sidebar--collapsed {
  transform: translateX(calc(100% + 20px));
  opacity: 0;
  pointer-events: none;
}

.execution-record-header,
.execution-record-body {
  transition:
    padding-right 0.5s ease,
    margin-right 0.5s ease;
  will-change: padding-right, margin-right;
}

@media (max-width: 1280px) {
  .workflow-workspace--agent {
    display: block;
  }

  .workflow-workspace--agent .agent-workspace {
    position: absolute;
    top: 0;
    left: 0;
    bottom: 0;
    width: min(440px, calc(100vw - 32px));
    max-width: calc(100vw - 24px);
    z-index: 140;
    box-shadow: 20px 0 48px rgba(15, 23, 42, 0.16);
  }

  .workflow-workspace--agent .execution-workspace {
    height: 100%;
  }
}
</style>
