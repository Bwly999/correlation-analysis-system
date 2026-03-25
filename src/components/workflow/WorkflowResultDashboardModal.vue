<script setup lang="ts">
import { computed, onBeforeUnmount, ref, useTemplateRef, watch } from 'vue'
import { VueDraggable } from 'vue-draggable-plus'
import Dialog from 'primevue/dialog'
import {
  LayoutGrid,
  Grip,
  BarChart3,
  AlertTriangle,
  Clock3,
  SquareDashedMousePointer,
  X,
  Maximize2,
  Minimize2,
  PanelLeftClose,
  PanelLeftOpen,
  Rows3,
} from 'lucide-vue-next'
import DataAnalysisModal from './DataAnalysisModal.vue'
import WorkflowResultPanel from './WorkflowResultPanel.vue'
import {
  buildResultDashboardGroups,
  type ResultDashboardNode,
  type WorkflowResultDashboardSummary,
} from './resultDashboard'

type LayoutMode = 'grid' | 'free-grid'
type FreeGridItemLayout = {
  width: number
  height: number
}

const props = defineProps<{
  visible: boolean
  summary: WorkflowResultDashboardSummary | null
}>()

const emit = defineEmits<{
  close: []
}>()

const selectedNodeIds = ref<string[]>([])
const gridColumns = ref(2)
const layoutMode = ref<LayoutMode>('grid')
const freeGridOrder = ref<string[]>([])
const freeGridLayouts = ref<Record<string, FreeGridItemLayout>>({})
const detailNode = ref<ResultDashboardNode | null>(null)
const isFullscreen = ref(false)
const isNodeSidebarCollapsed = ref(false)
const showOverviewInFullscreen = ref(false)
const resizeState = ref<{
  nodeId: string
  startX: number
  startY: number
  startWidth: number
  startHeight: number
} | null>(null)

const FREE_GRID_DEFAULT_WIDTH = 420
const FREE_GRID_DEFAULT_HEIGHT = 320
const FREE_GRID_GAP = 16
const FREE_GRID_MIN_WIDTH = 280
const FREE_GRID_MIN_HEIGHT = 220
const GRID_PANEL_MIN_HEIGHT = 320
const dashboardShellRef = useTemplateRef<HTMLElement>('dashboardShell')

const dashboardGroups = computed(() =>
  props.summary ? buildResultDashboardGroups(props.summary.nodes) : { withOutput: [], withError: [], withoutOutput: [] },
)

const isFocusMode = computed(() => isFullscreen.value)
const showOverview = computed(() => !isFocusMode.value || showOverviewInFullscreen.value)
const workspaceHint = computed(() => {
  if (layoutMode.value === 'free-grid') {
    return `自由栅格 | ${selectedNodes.value.length} 个结果面板`
  }
  return `标准网格 | ${selectedNodes.value.length} 个结果面板 | ${gridColumns.value} 列`
})
const canShowOverviewToggle = computed(() => isFocusMode.value)
const nodeSidebarWidthClass = computed(() => (isNodeSidebarCollapsed.value ? 'w-[72px]' : 'w-[280px]'))

const selectedNodes = computed(() => {
  const allNodes = props.summary?.nodes ?? []
  const map = new Map(allNodes.map((node) => [node.nodeId, node]))
  const baseNodes = selectedNodeIds.value
    .map((nodeId) => map.get(nodeId))
    .filter((node): node is ResultDashboardNode => Boolean(node))

  const order = freeGridOrder.value
  const ordered: ResultDashboardNode[] = []
  order.forEach((nodeId) => {
    const node = baseNodes.find((item) => item.nodeId === nodeId)
    if (node) ordered.push(node)
  })
  baseNodes.forEach((node) => {
    if (!ordered.some((item) => item.nodeId === node.nodeId)) {
      ordered.push(node)
    }
  })
  return ordered
})

const orderedSelectedNodes = computed<ResultDashboardNode[]>({
  get: () => selectedNodes.value,
  set: (nextNodes) => {
    freeGridOrder.value = nextNodes.map((node) => node.nodeId)
  },
})

const gridLayoutStyle = computed(() => ({
  gridTemplateColumns: `repeat(${gridColumns.value}, minmax(0, 1fr))`,
  gridAutoRows: `minmax(${GRID_PANEL_MIN_HEIGHT}px, auto)`,
}))

const gridItemStyle = computed(() => ({
  minHeight: `${GRID_PANEL_MIN_HEIGHT}px`,
}))

const createDefaultFreeGridLayout = (_index: number): FreeGridItemLayout => {
  return {
    width: FREE_GRID_DEFAULT_WIDTH,
    height: FREE_GRID_DEFAULT_HEIGHT,
  }
}

const initializeSessionState = (summary: WorkflowResultDashboardSummary | null) => {
  if (!summary) {
    selectedNodeIds.value = []
    freeGridOrder.value = []
    freeGridLayouts.value = {}
    detailNode.value = null
    isFullscreen.value = false
    isNodeSidebarCollapsed.value = false
    showOverviewInFullscreen.value = false
    return
  }

  selectedNodeIds.value = [...summary.selectedDefaultNodeIds]
  freeGridOrder.value = [...summary.selectedDefaultNodeIds]
  freeGridLayouts.value = Object.fromEntries(
    summary.selectedDefaultNodeIds.map((nodeId, index) => [nodeId, createDefaultFreeGridLayout(index)]),
  )
  gridColumns.value = 2
  layoutMode.value = 'grid'
  isFullscreen.value = false
  isNodeSidebarCollapsed.value = false
  showOverviewInFullscreen.value = false
}

watch(
  () => [props.visible, props.summary?.startTime] as const,
  ([visible]) => {
    if (visible) initializeSessionState(props.summary)
  },
  { immediate: true },
)

watch(selectedNodeIds, (nextSelected) => {
  const selectedSet = new Set(nextSelected)
  freeGridOrder.value = [
    ...freeGridOrder.value.filter((nodeId) => selectedSet.has(nodeId)),
    ...nextSelected.filter((nodeId) => !freeGridOrder.value.includes(nodeId)),
  ]

  nextSelected.forEach((nodeId) => {
    if (!freeGridLayouts.value[nodeId]) {
      freeGridLayouts.value[nodeId] = createDefaultFreeGridLayout(freeGridOrder.value.indexOf(nodeId))
    }
  })
})

const toggleNodeSelection = (nodeId: string, checked: boolean) => {
  if (checked) {
    if (!selectedNodeIds.value.includes(nodeId)) selectedNodeIds.value = [...selectedNodeIds.value, nodeId]
    return
  }
  selectedNodeIds.value = selectedNodeIds.value.filter((id) => id !== nodeId)
}

const openDetail = (node: ResultDashboardNode) => {
  detailNode.value = node
}

const enterFocusMode = () => {
  isFullscreen.value = true
  isNodeSidebarCollapsed.value = true
  showOverviewInFullscreen.value = false
}

const exitFocusMode = () => {
  isFullscreen.value = false
  isNodeSidebarCollapsed.value = false
  showOverviewInFullscreen.value = false
}

const toggleNodeSidebar = () => {
  isNodeSidebarCollapsed.value = !isNodeSidebarCollapsed.value
}

const syncFullscreenState = () => {
  const active = document.fullscreenElement === dashboardShellRef.value
  if (active) {
    enterFocusMode()
    return
  }
  exitFocusMode()
}

const toggleFullscreen = async () => {
  const shell = dashboardShellRef.value
  if (!shell) return

  if (document.fullscreenElement === shell) {
    exitFocusMode()
    await document.exitFullscreen?.()
    return
  }

  enterFocusMode()
  await shell.requestFullscreen?.()
}

const handleResizeMove = (event: MouseEvent) => {
  if (!resizeState.value) return

  const { nodeId, startX, startY, startWidth, startHeight } = resizeState.value
  const deltaX = event.clientX - startX
  const deltaY = event.clientY - startY
  const currentLayout = freeGridLayouts.value[nodeId]
  if (!currentLayout) return
  const nextWidth = Math.max(FREE_GRID_MIN_WIDTH, startWidth + deltaX)
  const nextHeight = Math.max(FREE_GRID_MIN_HEIGHT, startHeight + deltaY)

  freeGridLayouts.value[nodeId] = {
    ...currentLayout,
    width: nextWidth,
    height: nextHeight,
  }
}

const stopResize = () => {
  resizeState.value = null
}

const startResize = (nodeId: string, event: MouseEvent) => {
  event.preventDefault()
  event.stopPropagation()

  const currentLayout = freeGridLayouts.value[nodeId] ?? createDefaultFreeGridLayout(0)
  resizeState.value = {
    nodeId,
    startX: event.clientX,
    startY: event.clientY,
    startWidth: currentLayout.width,
    startHeight: currentLayout.height,
  }
}

watch(
  resizeState,
  (active) => {
    if (active) {
      window.addEventListener('mousemove', handleResizeMove)
      window.addEventListener('mouseup', stopResize)
      return
    }

    window.removeEventListener('mousemove', handleResizeMove)
    window.removeEventListener('mouseup', stopResize)
  },
  { flush: 'post' },
)

onBeforeUnmount(() => {
  window.removeEventListener('mousemove', handleResizeMove)
  window.removeEventListener('mouseup', stopResize)
  document.removeEventListener('fullscreenchange', syncFullscreenState)
})

watch(
  () => props.visible,
  (visible) => {
    if (!visible && document.fullscreenElement === dashboardShellRef.value) {
      document.exitFullscreen?.()
    }
  },
)

watch(
  () => dashboardShellRef.value,
  (shell, previous) => {
    if (previous) {
      document.removeEventListener('fullscreenchange', syncFullscreenState)
    }
    if (shell) {
      document.addEventListener('fullscreenchange', syncFullscreenState)
    }
  },
  { immediate: true },
)

const formatDuration = (duration: number) => {
  if (duration < 1000) return `${duration}ms`
  return `${(duration / 1000).toFixed(1)}s`
}
</script>

<template>
  <Dialog
    :visible="visible"
    modal
    :closable="false"
    class="workflow-result-dashboard"
    :style="{ width: '96vw', height: '94vh' }"
    @update:visible="emit('close')"
  >
    <template #header>
      <div class="w-full px-5 py-3 flex items-center justify-between gap-4">
        <div>
          <div class="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-slate-400 font-black">
            <BarChart3 :size="13" />
            <span>工作流结果看板</span>
          </div>
          <h2 class="mt-0.5 text-[22px] font-black text-slate-900 leading-tight">
            {{ summary?.workflowName || '当前工作流' }}
          </h2>
          <p v-if="isFullscreen" class="mt-1 text-[11px] font-semibold text-blue-600">
            按 Esc 退出全屏模式
          </p>
        </div>
        <div class="flex items-center gap-2">
          <button
            type="button"
            class="dashboard-close-button"
            :aria-label="isFullscreen ? '退出全屏专注模式' : '进入全屏专注模式'"
            @click="toggleFullscreen"
          >
            <Minimize2 v-if="isFullscreen" :size="18" />
            <Maximize2 v-else :size="18" />
          </button>
          <button type="button" class="dashboard-close-button" aria-label="关闭结果看板" @click="emit('close')">
            <X :size="18" />
          </button>
        </div>
      </div>
    </template>

    <div
      ref="dashboardShell"
      class="dashboard-shell h-full min-h-0 flex flex-col bg-slate-50"
      :class="{ 'dashboard-shell--focus': isFocusMode }"
    >
      <section
        v-if="isFullscreen"
        class="focus-mode-banner px-4 py-2 border-b border-blue-100 bg-blue-50/90 flex items-center justify-between gap-3"
      >
        <div class="min-w-0">
          <p class="text-[11px] font-bold text-blue-700">按 Esc 退出全屏模式</p>
          <p class="text-[11px] text-blue-600/80 truncate">当前处于专注模式，已优先为分析报告释放展示空间。</p>
        </div>
        <button
          type="button"
          class="focus-mode-exit-button"
          aria-label="退出全屏专注模式"
          @click="toggleFullscreen"
        >
          <Minimize2 :size="14" />
          退出全屏
        </button>
      </section>

      <section v-if="showOverview" class="dashboard-overview px-5 py-2.5 border-b border-slate-200 bg-white">
        <div class="grid gap-3 dashboard-overview-grid">
          <div class="overview-card">
            <span class="overview-label">运行状态</span>
            <strong
              class="overview-value"
              :class="
                summary?.status === 'error'
                  ? 'text-rose-600'
                  : summary?.status === 'stopped'
                    ? 'text-amber-600'
                    : 'text-emerald-600'
              "
            >
              {{ summary?.status === 'error' ? '运行异常' : summary?.status === 'stopped' ? '已停止' : '运行成功' }}
            </strong>
          </div>
          <div class="overview-card">
            <span class="overview-label">运行耗时</span>
            <strong class="overview-value text-slate-900">
              <Clock3 :size="14" class="inline mr-1" />{{ formatDuration(summary?.duration ?? 0) }}
            </strong>
          </div>
          <div class="overview-card">
            <span class="overview-label">结果节点</span>
            <strong class="overview-value text-slate-900">{{ summary?.metrics.outputCount ?? 0 }}</strong>
          </div>
          <div class="overview-card">
            <span class="overview-label">异常提示</span>
            <strong class="overview-value text-rose-600 flex items-center gap-1">
              <AlertTriangle :size="14" />{{ summary?.metrics.errorCount ?? 0 }} 个异常节点
            </strong>
          </div>
        </div>
      </section>

      <div class="flex-1 min-h-0 flex">
        <aside
          class="dashboard-sidebar border-r border-slate-200 bg-white flex flex-col min-h-0 transition-all duration-200"
          :class="[nodeSidebarWidthClass, { 'dashboard-sidebar--collapsed': isNodeSidebarCollapsed }]"
        >
          <div class="px-4 py-3 border-b border-slate-100">
            <div class="flex items-center justify-between gap-3">
              <div v-if="!isNodeSidebarCollapsed" class="min-w-0">
                <h3 class="text-sm font-black text-slate-900">节点选择</h3>
                <p class="mt-1 text-[11px] text-slate-500">默认选中终止节点，可手动加入其他节点结果。</p>
              </div>
              <div v-else class="mx-auto">
                <span class="sidebar-rail-label">节点</span>
              </div>
              <button
                type="button"
                class="sidebar-toggle-button"
                :aria-label="isNodeSidebarCollapsed ? '展开节点选择' : '收起节点选择'"
                @click="toggleNodeSidebar"
              >
                <PanelLeftOpen v-if="isNodeSidebarCollapsed" :size="16" />
                <PanelLeftClose v-else :size="16" />
              </button>
            </div>
          </div>

          <div
            v-if="!isNodeSidebarCollapsed"
            class="flex-1 overflow-auto px-4 py-4 space-y-5 custom-scrollbar"
          >
            <section>
              <div class="group-title">有结果节点</div>
              <label
                v-for="node in dashboardGroups.withOutput"
                :key="node.nodeId"
                class="node-option"
              >
                <input
                  :checked="selectedNodeIds.includes(node.nodeId)"
                  type="checkbox"
                  class="mt-1"
                  @change="toggleNodeSelection(node.nodeId, ($event.target as HTMLInputElement).checked)"
                />
                <div class="min-w-0">
                  <div class="flex items-center gap-2">
                    <span class="font-bold text-slate-800 truncate">{{ node.label }}</span>
                    <span v-if="node.isTerminal" class="node-badge">终止节点</span>
                  </div>
                  <p class="text-xs text-slate-500 mt-1">{{ node.summary || node.resultKindLabel }}</p>
                </div>
              </label>
            </section>

            <section v-if="dashboardGroups.withError.length > 0">
              <div class="group-title text-rose-600">异常节点</div>
              <div v-for="node in dashboardGroups.withError" :key="node.nodeId" class="node-meta-card node-meta-card--error">
                <div class="font-bold">{{ node.label }}</div>
                <p class="mt-1 text-xs">{{ node.error || '本次运行失败' }}</p>
              </div>
            </section>

            <section v-if="dashboardGroups.withoutOutput.length > 0">
              <div class="group-title text-slate-400">未产出结果节点</div>
              <div v-for="node in dashboardGroups.withoutOutput" :key="node.nodeId" class="node-meta-card">
                <div class="font-bold text-slate-600">{{ node.label }}</div>
                <p class="mt-1 text-xs text-slate-400">本次运行未产出可展示结果</p>
              </div>
            </section>
          </div>

          <div v-else class="flex-1 flex flex-col items-center gap-3 px-2 py-4">
            <div class="sidebar-rail-count">{{ selectedNodes.length }}</div>
          </div>
        </aside>

        <section class="flex-1 min-w-0 flex flex-col">
          <div class="px-4 py-3 border-b border-slate-200 bg-white flex items-center justify-between gap-3">
            <div class="min-w-0">
              <h3 class="text-sm font-black text-slate-900">聚合分析工作台</h3>
              <p class="mt-1 text-[11px] text-slate-500 truncate">
                {{ workspaceHint }}
              </p>
            </div>

            <div class="flex items-center gap-2 shrink-0 flex-wrap justify-end">
              <button
                v-if="canShowOverviewToggle"
                type="button"
                class="toolbar-button"
                :class="{ 'toolbar-button--active': showOverviewInFullscreen }"
                @click="showOverviewInFullscreen = !showOverviewInFullscreen"
              >
                <Rows3 :size="14" />
                {{ showOverviewInFullscreen ? '隐藏运行概览' : '显示运行概览' }}
              </button>
              <button
                type="button"
                class="toolbar-button"
                :class="{ 'toolbar-button--active': layoutMode === 'grid' }"
                @click="layoutMode = 'grid'"
              >
                <LayoutGrid :size="14" />
                标准网格
              </button>
              <button
                type="button"
                class="toolbar-button"
                :class="{ 'toolbar-button--active': layoutMode === 'free-grid' }"
                @click="layoutMode = 'free-grid'"
              >
                <SquareDashedMousePointer :size="14" />
                自由栅格
              </button>
              <div v-if="layoutMode === 'grid'" class="flex items-center gap-1 ml-2">
                <button
                  v-for="count in [1, 2, 3, 4]"
                  :key="count"
                  type="button"
                  class="toolbar-button"
                  :class="{ 'toolbar-button--active': gridColumns === count }"
                  @click="gridColumns = count"
                >
                  {{ count }}列
                </button>
              </div>
              <div v-else class="ml-2 text-[11px] text-slate-500 flex items-center gap-1">
                <Grip :size="14" />
                拖拽重排，右下角调尺寸
              </div>
            </div>
          </div>

          <div class="flex-1 min-h-0 overflow-auto p-4 custom-scrollbar">
            <div v-if="selectedNodes.length === 0" class="empty-state">
              <p class="text-lg font-black text-slate-700">当前还没有选中要展示的节点</p>
              <p class="mt-2 text-sm text-slate-500">请从左侧勾选至少一个有结果节点，右侧会自动加入对应分析面板。</p>
            </div>

            <VueDraggable
              v-else-if="layoutMode === 'grid'"
              v-model="orderedSelectedNodes"
              class="dashboard-grid"
              item-key="nodeId"
              tag="div"
              handle=".dashboard-panel__drag-handle"
              :animation="180"
              ghost-class="dashboard-sort-ghost"
              chosen-class="dashboard-sort-chosen"
              drag-class="dashboard-sort-drag"
              :style="gridLayoutStyle"
            >
              <div
                v-for="node in orderedSelectedNodes"
                :key="node.nodeId"
                class="dashboard-grid__item"
                :style="gridItemStyle"
              >
                <WorkflowResultPanel
                  :node="node"
                  show-drag-handle
                  @open-detail="openDetail"
                />
              </div>
            </VueDraggable>

            <VueDraggable
              v-else
              v-model="orderedSelectedNodes"
              class="dashboard-free-grid"
              item-key="nodeId"
              tag="div"
              handle=".dashboard-panel__drag-handle"
              :animation="180"
              ghost-class="dashboard-sort-ghost"
              chosen-class="dashboard-sort-chosen"
              drag-class="dashboard-sort-drag"
            >
              <div
                v-for="node in orderedSelectedNodes"
                :key="node.nodeId"
                class="dashboard-free-grid__item"
                :style="{
                  width: `${freeGridLayouts[node.nodeId]?.width ?? FREE_GRID_DEFAULT_WIDTH}px`,
                  height: `${freeGridLayouts[node.nodeId]?.height ?? FREE_GRID_DEFAULT_HEIGHT}px`,
                }"
              >
                <WorkflowResultPanel
                  :node="node"
                  show-drag-handle
                  @open-detail="openDetail"
                />
                <button
                  type="button"
                  class="dashboard-free-grid__resize-handle"
                  @mousedown="startResize(node.nodeId, $event)"
                />
              </div>
            </VueDraggable>
          </div>
        </section>
      </div>
    </div>

    <DataAnalysisModal
      :visible="!!detailNode"
      :title="detailNode ? `${detailNode.label} 结果详情` : ''"
      :data="detailNode?.output"
      @close="detailNode = null"
    />
  </Dialog>
</template>

<style scoped>
.workflow-result-dashboard :deep(.p-dialog-content) {
  padding: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.dashboard-shell {
  min-height: 0;
}

.dashboard-shell--focus {
  background: #f8fafc;
}

.dashboard-overview-grid {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.focus-mode-banner {
  backdrop-filter: blur(10px);
}

.focus-mode-exit-button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex: 0 0 auto;
  padding: 7px 10px;
  border-radius: 10px;
  border: 1px solid rgba(37, 99, 235, 0.18);
  background: #ffffff;
  color: #1d4ed8;
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
  transition:
    border-color 0.2s ease,
    background-color 0.2s ease,
    color 0.2s ease;
}

.focus-mode-exit-button:hover {
  border-color: rgba(37, 99, 235, 0.35);
  background: #eff6ff;
  color: #1e40af;
}

.overview-card {
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  padding: 12px 14px;
  background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
}

.overview-label {
  display: block;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #94a3b8;
}

.overview-value {
  display: inline-flex;
  align-items: center;
  margin-top: 6px;
  font-size: 20px;
  font-weight: 900;
}

.dashboard-sidebar {
  flex: 0 0 auto;
}

.sidebar-toggle-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 10px;
  border: 1px solid #e2e8f0;
  background: #fff;
  color: #475569;
  cursor: pointer;
  transition:
    border-color 0.2s ease,
    background-color 0.2s ease,
    color 0.2s ease;
}

.sidebar-toggle-button:hover {
  border-color: #94a3b8;
  color: #0f172a;
  background: #f8fafc;
}

.sidebar-rail-label {
  writing-mode: vertical-rl;
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0.18em;
  color: #94a3b8;
  text-transform: uppercase;
}

.sidebar-rail-count {
  min-width: 28px;
  padding: 6px 8px;
  border-radius: 999px;
  background: #eff6ff;
  color: #2563eb;
  font-size: 11px;
  font-weight: 900;
  text-align: center;
}

.group-title {
  margin-bottom: 10px;
  font-size: 11px;
  font-weight: 900;
  color: #334155;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.node-option {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 14px;
  border: 1px solid #e2e8f0;
  background: #fff;
  cursor: pointer;
}

.node-option + .node-option {
  margin-top: 8px;
}

.node-badge {
  padding: 2px 8px;
  border-radius: 999px;
  background: #dbeafe;
  color: #2563eb;
  font-size: 10px;
  font-weight: 800;
}

.node-meta-card {
  padding: 10px 12px;
  border-radius: 14px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
}

.node-meta-card + .node-meta-card {
  margin-top: 8px;
}

.node-meta-card--error {
  background: #fff1f2;
  border-color: #fecdd3;
  color: #be123c;
}

.toolbar-button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border-radius: 12px;
  border: 1px solid #e2e8f0;
  background: #fff;
  color: #475569;
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
  transition:
    border-color 0.2s ease,
    background-color 0.2s ease,
    color 0.2s ease;
}

.toolbar-button:hover {
  border-color: #94a3b8;
  color: #0f172a;
}

.toolbar-button--active {
  border-color: #2563eb;
  background: #eff6ff;
  color: #2563eb;
}

.dashboard-close-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 999px;
  border: 1px solid #e2e8f0;
  background: #fff;
  color: #475569;
  cursor: pointer;
  transition:
    border-color 0.2s ease,
    background-color 0.2s ease,
    color 0.2s ease;
}

.dashboard-close-button:hover {
  border-color: #94a3b8;
  background: #f8fafc;
  color: #0f172a;
}

.dashboard-grid {
  display: grid;
  gap: 14px;
  align-items: stretch;
}

.dashboard-grid__item {
  min-width: 0;
  min-height: 0;
}

.dashboard-free-grid {
  display: flex;
  flex-wrap: wrap;
  align-content: flex-start;
  gap: 14px;
  min-height: 320px;
}

.dashboard-free-grid__item {
  min-width: 0;
  min-height: 0;
  position: relative;
  flex: 0 0 auto;
}

.dashboard-sort-ghost {
  opacity: 0.35;
}

.dashboard-sort-chosen {
  z-index: 2;
}

.dashboard-sort-drag {
  transform: rotate(1deg);
  box-shadow: 0 18px 36px rgba(15, 23, 42, 0.18);
}

.dashboard-free-grid__resize-handle {
  position: absolute;
  right: 10px;
  bottom: 10px;
  width: 18px;
  height: 18px;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.35);
  background:
    linear-gradient(135deg, transparent 0 42%, rgba(37, 99, 235, 0.18) 42% 58%, transparent 58% 100%),
    #ffffff;
  box-shadow: 0 4px 12px rgba(15, 23, 42, 0.12);
  cursor: nwse-resize;
}

.dashboard-free-grid__resize-handle:hover {
  border-color: rgba(37, 99, 235, 0.4);
}

.empty-state {
  min-height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border: 1px dashed #cbd5e1;
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.7);
}

.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

.custom-scrollbar::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  border-radius: 999px;
}
</style>
