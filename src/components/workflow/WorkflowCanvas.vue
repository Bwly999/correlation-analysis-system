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

const executionTabs = [
  { id: 'execution', label: '执行流', testId: 'execution-workspace-tab-canvas' },
  { id: 'result', label: '结果', testId: 'execution-workspace-tab-result' },
  { id: 'report', label: '报告', testId: 'execution-workspace-tab-report' },
] as const

const layoutMetrics = computed(() => getWorkflowLayoutMetrics(viewportWidth.value))
const logHeight = computed(() =>
  isLogExpanded.value ? layoutMetrics.value.logExpandedHeight : layoutMetrics.value.logCollapsedHeight,
)
const runBarBottom = computed(() => logHeight.value + 20)
const activeExecutionTab = computed({
  get: () => aiStore.activeExecutionTab,
  set: (tab) => aiStore.setActiveExecutionTab(tab),
})
const isAgentMode = computed(() => isAiPanelVisible.value)
const resultNodes = computed(() => resultDashboardModal.value.summary?.nodes ?? [])
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

const openWorkflowList = async (initialTab = '0') => {
  workflowManagerInitialTab.value = initialTab
  isWorkflowListVisible.value = true
}

const openTemplateLibrary = async () => {
  await openWorkflowList('2')
}

const focusExecutionTab = (tab: 'execution' | 'result' | 'report') => {
  activeExecutionTab.value = tab
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
    if (!aiStore.sessionState) return
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
          @focus-report="focusExecutionTab('report')"
        />

        <section class="execution-workspace">
          <header v-if="isAgentMode" class="execution-workspace__header">
            <div>
              <strong>执行工作区</strong>
              <p>查看执行流、分析结果与最终报告</p>
            </div>
            <div class="execution-workspace__tabs">
              <button
                v-for="tab in executionTabs"
                :key="tab.id"
                :data-testid="tab.testId"
                :data-active="activeExecutionTab === tab.id"
                type="button"
                class="execution-workspace__tab"
                :class="{ 'is-active': activeExecutionTab === tab.id }"
                @click="focusExecutionTab(tab.id)"
              >
                {{ tab.label }}
              </button>
            </div>
          </header>

          <div v-show="!isAgentMode || activeExecutionTab === 'execution'" class="execution-workspace__panel">
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

              <aside
                v-if="!store.isHistoryMode"
                class="execution-canvas-shell__sidebar"
                :class="isSidebarVisible ? 'translate-x-0' : 'translate-x-full'"
                :style="{ width: `${layoutMetrics.sidebarWidth}px` }"
              >
                <NodeSidebar @close="isSidebarVisible = false" />
              </aside>
            </div>
          </div>

          <div
            v-show="isAgentMode && activeExecutionTab === 'result'"
            class="execution-workspace__panel execution-workspace__panel--insight"
          >
            <section class="execution-card">
              <header class="execution-card__header">
                <strong>结果概览</strong>
                <span>{{ resultDashboardModal.summary?.workflowName || '尚未运行工作流' }}</span>
              </header>
              <div v-if="resultDashboardModal.summary" class="execution-metrics">
                <div class="execution-metric">
                  <span>产出节点</span>
                  <strong>{{ resultDashboardModal.summary.metrics.outputCount }}</strong>
                </div>
                <div class="execution-metric">
                  <span>错误节点</span>
                  <strong>{{ resultDashboardModal.summary.metrics.errorCount }}</strong>
                </div>
                <div class="execution-metric">
                  <span>终端结果</span>
                  <strong>{{ resultDashboardModal.summary.metrics.terminalOutputCount }}</strong>
                </div>
              </div>
              <p v-else class="execution-empty">运行后将在这里汇总关键结果与证据节点。</p>
            </section>

            <section class="execution-card">
              <header class="execution-card__header">
                <strong>节点结果</strong>
                <span>按本次执行范围聚合</span>
              </header>
              <div v-if="resultNodes.length" class="execution-node-list">
                <article v-for="node in resultNodes" :key="node.nodeId" class="execution-node-card">
                  <div class="execution-node-card__top">
                    <strong>{{ node.label }}</strong>
                    <span>{{ node.resultKindLabel }}</span>
                  </div>
                  <p>{{ node.summary }}</p>
                </article>
              </div>
              <p v-else class="execution-empty">暂无节点结果。</p>
            </section>
          </div>

          <div
            v-show="isAgentMode && activeExecutionTab === 'report'"
            class="execution-workspace__panel execution-workspace__panel--insight"
          >
            <section class="execution-card execution-card--report">
              <header class="execution-card__header">
                <strong>分析报告</strong>
                <span>{{ aiStore.analysisAgentSession?.phase === 'completed' ? '已完成' : '持续更新中' }}</span>
              </header>
              <p class="execution-report__lead">
                {{ aiStore.plan?.summary || aiStore.analysisAgentSession?.workflowSession.draft.summary || '分析报告将在代理形成结论后展示。' }}
              </p>
              <div v-if="aiStore.plan?.assumptions?.length" class="execution-report__section">
                <strong>关键发现</strong>
                <ul>
                  <li v-for="item in aiStore.plan.assumptions" :key="item">{{ item }}</li>
                </ul>
              </div>
              <div v-if="aiStore.plan?.warnings?.length" class="execution-report__section">
                <strong>风险与限制</strong>
                <ul>
                  <li v-for="item in aiStore.plan.warnings" :key="item">{{ item }}</li>
                </ul>
              </div>
              <div class="execution-report__section">
                <strong>工作流协同摘要</strong>
                <p>{{ aiStore.analysisAgentSession?.workflowSummary || '当前还没有同步画布摘要。' }}</p>
              </div>
            </section>
          </div>
        </section>
      </div>
    </main>

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
      class="absolute bottom-0 left-0 right-0 z-[120] transition-all duration-300 ease-in-out flex flex-col"
      :style="{ height: `${logHeight}px` }"
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
          class="flex items-center gap-4 text-[10px] font-bold text-[#a3acb9] uppercase tracking-widest"
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
        <LogPanel />
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
  height: 100%;
  min-height: 0;
}

.workflow-workspace--agent {
  display: grid;
  grid-template-columns: minmax(0, 42%) minmax(0, 58%);
}

.execution-workspace {
  min-width: 0;
  min-height: 0;
  display: grid;
  grid-template-rows: 1fr;
  background:
    radial-gradient(120% 140% at 100% 0%, rgba(148, 163, 184, 0.08) 0%, rgba(255, 255, 255, 0) 42%),
    linear-gradient(180deg, #f8fafc 0%, #eef2f7 100%);
}

.workflow-workspace--agent .execution-workspace {
  grid-template-rows: auto 1fr;
}

.execution-workspace__header {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: center;
  padding: 16px 18px;
  border-bottom: 1px solid #dbe4ef;
  background: rgba(255, 255, 255, 0.86);
  backdrop-filter: blur(12px);
}

.execution-workspace__header strong {
  display: block;
  font-size: 15px;
  color: #0f172a;
}

.execution-workspace__header p {
  margin: 4px 0 0;
  color: #64748b;
  font-size: 12px;
}

.execution-workspace__tabs {
  display: inline-flex;
  padding: 4px;
  border-radius: 16px;
  border: 1px solid #dbe4ef;
  background: #ffffff;
  gap: 4px;
}

.execution-workspace__tab {
  height: 34px;
  padding: 0 14px;
  border: none;
  border-radius: 12px;
  background: transparent;
  color: #475569;
  cursor: pointer;
  font-size: 12px;
  font-weight: 800;
}

.execution-workspace__tab.is-active {
  background: #0f172a;
  color: #ffffff;
  box-shadow: 0 10px 18px -14px rgba(15, 23, 42, 0.85);
}

.execution-workspace__panel {
  min-height: 0;
  position: relative;
}

.execution-workspace__panel--insight {
  overflow-y: auto;
  padding: 18px;
  display: grid;
  align-content: start;
  gap: 16px;
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

.execution-canvas-shell__sidebar {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  z-index: 130;
  transition: transform 0.5s ease;
  box-shadow: -20px 0 50px rgba(0, 0, 0, 0.03);
}

.execution-card {
  border-radius: 22px;
  border: 1px solid #dbe4ef;
  background: rgba(255, 255, 255, 0.92);
  padding: 18px;
  box-shadow: 0 18px 36px -28px rgba(15, 23, 42, 0.28);
}

.execution-card--report {
  background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
}

.execution-card__header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
  align-items: center;
}

.execution-card__header strong {
  color: #0f172a;
  font-size: 14px;
}

.execution-card__header span,
.execution-empty {
  color: #64748b;
  font-size: 12px;
}

.execution-metrics {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.execution-metric {
  border-radius: 16px;
  background: #f8fafc;
  padding: 14px;
}

.execution-metric span {
  display: block;
  color: #64748b;
  font-size: 11px;
  margin-bottom: 6px;
}

.execution-metric strong {
  color: #0f172a;
  font-size: 22px;
}

.execution-node-list {
  display: grid;
  gap: 12px;
}

.execution-node-card {
  border-radius: 16px;
  border: 1px solid #e2e8f0;
  background: #ffffff;
  padding: 14px;
}

.execution-node-card__top {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}

.execution-node-card__top strong {
  color: #0f172a;
  font-size: 12px;
}

.execution-node-card__top span,
.execution-node-card p,
.execution-report__section p,
.execution-report__section li {
  color: #475569;
  font-size: 12px;
  line-height: 1.7;
}

.execution-node-card p {
  margin: 0;
}

.execution-report__lead {
  margin: 0 0 14px;
  color: #0f172a;
  font-size: 14px;
  line-height: 1.8;
}

.execution-report__section {
  margin-top: 16px;
}

.execution-report__section strong {
  display: block;
  color: #0f172a;
  font-size: 12px;
  margin-bottom: 8px;
}

.execution-report__section p,
.execution-report__section ul {
  margin: 0;
}

.execution-report__section ul {
  padding-left: 18px;
}

@media (max-width: 1280px) {
  .workflow-workspace--agent {
    grid-template-columns: 1fr;
  }

  .execution-workspace {
    min-height: 420px;
  }
}
</style>
