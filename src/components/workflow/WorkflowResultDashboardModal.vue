<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { VueDraggable } from 'vue-draggable-plus'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import { LayoutGrid, Grip, BarChart3, AlertTriangle, Clock3, SquareDashedMousePointer, X } from 'lucide-vue-next'
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

const dashboardGroups = computed(() =>
  props.summary ? buildResultDashboardGroups(props.summary.nodes) : { withOutput: [], withError: [], withoutOutput: [] },
)

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
    return
  }

  selectedNodeIds.value = [...summary.selectedDefaultNodeIds]
  freeGridOrder.value = [...summary.selectedDefaultNodeIds]
  freeGridLayouts.value = Object.fromEntries(
    summary.selectedDefaultNodeIds.map((nodeId, index) => [nodeId, createDefaultFreeGridLayout(index)]),
  )
  gridColumns.value = 2
  layoutMode.value = 'grid'
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
})

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
      <div class="w-full px-6 py-4 flex items-center justify-between gap-4">
        <div>
          <div class="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-slate-400 font-black">
            <BarChart3 :size="13" />
            <span>工作流结果看板</span>
          </div>
          <h2 class="mt-1 text-2xl font-black text-slate-900">
            {{ summary?.workflowName || '当前工作流' }}
          </h2>
        </div>
        <div class="flex items-center gap-2">
          <button type="button" class="dashboard-close-button" aria-label="关闭结果看板" @click="emit('close')">
            <X :size="18" />
          </button>
        </div>
      </div>
    </template>

    <div class="h-full min-h-0 flex flex-col bg-slate-50">
      <section class="px-6 py-4 border-b border-slate-200 bg-white">
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
        <aside class="w-[320px] border-r border-slate-200 bg-white flex flex-col min-h-0">
          <div class="px-5 py-4 border-b border-slate-100">
            <h3 class="text-sm font-black text-slate-900">节点选择</h3>
            <p class="mt-1 text-xs text-slate-500">默认选中所有终止节点，可手动加入其他节点结果。</p>
          </div>

          <div class="flex-1 overflow-auto px-4 py-4 space-y-5 custom-scrollbar">
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
        </aside>

        <section class="flex-1 min-w-0 flex flex-col">
          <div class="px-5 py-4 border-b border-slate-200 bg-white flex items-center justify-between gap-3">
            <div>
              <h3 class="text-sm font-black text-slate-900">聚合分析工作台</h3>
              <p class="mt-1 text-xs text-slate-500">
                右侧同时展示 {{ selectedNodes.length }} 个已选节点结果，可切换标准网格与自由栅格布局。
              </p>
            </div>

            <div class="flex items-center gap-2 shrink-0">
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
              <div v-else class="ml-2 text-xs text-slate-500 flex items-center gap-1">
                <Grip :size="14" />
                拖拽卡片可重排，面板右上角可调整宽高
              </div>
            </div>
          </div>

          <div class="flex-1 min-h-0 overflow-auto p-5 custom-scrollbar">
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
              :style="{ gridTemplateColumns: `repeat(${gridColumns}, minmax(0, 1fr))` }"
            >
              <div
                v-for="node in orderedSelectedNodes"
                :key="node.nodeId"
                class="dashboard-grid__item"
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

.dashboard-overview-grid {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.overview-card {
  border: 1px solid #e2e8f0;
  border-radius: 18px;
  padding: 16px 18px;
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
  margin-top: 10px;
  font-size: 22px;
  font-weight: 900;
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
  gap: 16px;
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
  gap: 16px;
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
