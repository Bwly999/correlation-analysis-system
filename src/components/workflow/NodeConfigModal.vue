<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { Edge } from '@vue-flow/core'
import { Loader2, Bug, HelpCircle } from 'lucide-vue-next'
import { useWorkflowStore } from '@/stores/workflowStore'
import { getNodeDefinition } from '@/nodes/registry'
import type { WorkflowNode } from '@/utils/storage'

// Sub Components
import DataDisplayPanel from './DataDisplayPanel.vue'
import DataAnalysisModal from './DataAnalysisModal.vue'
import ConfigHeader from './config/ConfigHeader.vue'
import ConfigFooter from './config/ConfigFooter.vue'
import ConfigForm from './config/ConfigForm.vue'
import RuntimeInputs from './config/RuntimeInputs.vue'
import NodeHelpPanel from './help/NodeHelpPanel.vue'
import {
  getResultRows,
  getResultSchemaFields,
  normalizeWorkflowResult,
} from './resultView'
import { useVerticalResize } from './composables/useVerticalResize'

// PrimeVue Components
import Dialog from 'primevue/dialog'

const props = defineProps<{
  nodeId: string | null
  visible: boolean
}>()

const emit = defineEmits<{
  close: []
}>()
const store = useWorkflowStore()
const workflowNodes = computed<WorkflowNode[]>(() => store.nodes as WorkflowNode[])
const workflowEdges = computed<Edge[]>(() => store.edges as Edge[])

const findWorkflowNode = (nodeId: string | null | undefined): WorkflowNode | null => {
  if (!nodeId) return null
  return workflowNodes.value.find((currentNode) => currentNode.id === nodeId) ?? null
}

// 直接从 Store 中获取响应式节点对象
const node = computed<WorkflowNode | null>(() => findWorkflowNode(props.nodeId))

// 状态管理
const config = ref<any>({})
const activeTab = ref('parameters')
const editedName = ref('')
const localIsPinned = ref(false)
const localUseManualInput = ref(false)
const localManualInput = ref('')
const isHelpDialogVisible = ref(false)

// 深度分析弹窗状态
const analysisModal = ref({ visible: false, title: '', data: null })

// 左侧边栏比例调节逻辑
const { paneHeight: topPaneHeight, isResizing: isResizingLeft, startResizing: startResizingLeft } =
  useVerticalResize(400, { min: 150, max: 600 })

// 获取当前节点的定义
const nodeDefinition = computed(() => (node.value ? getNodeDefinition(node.value.data.type) ?? null : null))
const nodeHelpSummary = computed(() => {
  if (!nodeDefinition.value) {
    return {
      title: '未找到节点定义',
      summary: '暂时无法展示帮助，请先检查节点类型是否有效。',
      tone: 'warning',
    } as const
  }

  return {
    title: '节点简介',
    summary: nodeDefinition.value.help?.summary ?? nodeDefinition.value.description,
    tone: 'default',
  } as const
})

const runtimeProperties = computed(
  () => nodeDefinition.value?.properties.filter((p) => p.isRuntimeInput) || [],
)
const staticProperties = computed(
  () => nodeDefinition.value?.properties.filter((p) => !p.isRuntimeInput) || [],
)

// 数据同步逻辑
watch(
  () => props.nodeId,
  (newId) => {
    if (newId && node.value) {
      editedName.value = node.value.data.label
      localIsPinned.value = node.value.data.isPinned || false
      localUseManualInput.value = node.value.data.useManualInput || false
      localManualInput.value = node.value.data.manualInput || ''
      activeTab.value = 'parameters'
      isHelpDialogVisible.value = false

      const baseConfig = { ...node.value.data.config }
      nodeDefinition.value?.properties.forEach((p) => {
        if (baseConfig[p.name] === undefined) baseConfig[p.name] = p.default
      })
      config.value = baseConfig
    } else {
      config.value = {}
    }
  },
  { immediate: true },
)

// 同步回 Store
watch(localIsPinned, (val) => {
  if (node.value) node.value.data.isPinned = val
})
watch(localUseManualInput, (val) => {
  if (node.value) node.value.data.useManualInput = val
})
watch(localManualInput, (val) => {
  if (node.value) node.value.data.manualInput = val
})

const inputData = computed(() => {
  const currentNode = node.value
  if (!currentNode) return null

  const currentEdges = workflowEdges.value
  const currentNodes = workflowNodes.value
  const incomingEdges = currentEdges.filter((edge) => edge.target === currentNode.id)
  if (incomingEdges.length === 0) return null

  if (nodeDefinition.value?.inputMode === 'multiple') {
    return {
      inputs: incomingEdges.map((edge, index) => {
        const sourceNode = currentNodes.find((item) => item.id === edge.source)
        const payload = sourceNode?.data.output ?? null
        const normalized = normalizeWorkflowResult(payload)
        const rows = getResultRows(payload)
        const schemaFields = getResultSchemaFields(payload)

        return {
          sourceNodeId: edge.source,
          sourceNodeLabel: sourceNode?.data.label ?? edge.source,
          edgeId: edge.id,
          order: index,
          payload,
          result: normalized,
          summary: {
            rowCount: normalized?.meta?.rowCount ?? rows.length,
            fields: schemaFields.map((field) => field.name),
            kind: normalized?.kind ?? 'unknown',
          },
        }
      }),
    }
  }

  return currentNodes.find((item) => item.id === incomingEdges[0]?.source)?.data.output ?? null
})

const upstreamFactors = computed(() => {
  let data = localUseManualInput.value ? localManualInput.value : inputData.value
  if (!data && node.value?.data.output) data = node.value.data.output
  if (!data) return []
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data)
    } catch {
      return []
    }
  }
  const schemaFields = getResultSchemaFields(data)
  if (schemaFields.length > 0) {
    return schemaFields.map((field) => ({ name: field.name, value: field.name }))
  }

  const rows = getResultRows(data)
  const sample = rows[0]
  if (sample && typeof sample === 'object') {
    return Object.keys(sample).map((key) => ({ name: key, value: key }))
  }

  if (Array.isArray(data) && data[0] && typeof data[0] === 'object') {
    return Object.keys(data[0]).map((key) => ({ name: key, value: key }))
  }

  return []
})

const runCurrentNode = async () => {
  if (node.value) {
    node.value.data.config = { ...config.value }
    node.value.data.label = editedName.value
    node.value.data.useManualInput = localUseManualInput.value
    node.value.data.manualInput = localManualInput.value
    await store.executeNode(node.value.id, true)
  }
}

const saveAndClose = () => {
  if (node.value) {
    node.value.data.label = editedName.value
    node.value.data.config = { ...config.value }
    node.value.data.useManualInput = localUseManualInput.value
    node.value.data.manualInput = localManualInput.value
  }
  emit('close')
}

const openAnalysis = (title: string, data: any) => {
  analysisModal.value = { visible: true, title, data }
}
</script>

<template>
  <Dialog
    :visible="visible"
    modal
    class="ndv-dialog"
    :style="{ width: '92vw', maxWidth: '1600px', height: '88vh' }"
    :closable="false"
    @update:visible="emit('close')"
  >
    <template #header>
      <ConfigHeader
        v-if="node"
        v-model:node-label="editedName"
        v-model:is-pinned="localIsPinned"
        :node-type="node.data.type"
        @close="emit('close')"
        @save="saveAndClose"
      />
    </template>

    <div v-if="node" class="ndv-body flex h-full bg-white border-t -mx-6 overflow-hidden" :class="{ 'cursor-row-resize select-none': isResizingLeft }">
      <!-- 左侧边栏 -->
      <div class="w-[320px] bg-[#f1f5f9] border-r flex flex-col overflow-hidden shrink-0">
        <!-- 上部分：输入数据 -->
        <div class="shrink-0 min-h-0 p-4 pb-2 flex flex-col" :style="{ height: topPaneHeight + 'px' }">
          <DataDisplayPanel
            v-model:use-manual-input="localUseManualInput"
            v-model:manual-input-str="localManualInput"
            title="输入数据 (INPUT)"
            :data="inputData"
            type="input"
            allow-mock
            @open-detail="
              openAnalysis('输入数据', localUseManualInput ? localManualInput : inputData)
            "
            @generate-mock="
              localManualInput = JSON.stringify({ data: [{ f1: 10, f2: 20, target: 1 }] }, null, 2)
            "
          />
        </div>

        <!-- 拖拽分割线 -->
        <div 
          class="group flex items-center justify-center h-4 cursor-row-resize select-none shrink-0"
          @mousedown="startResizingLeft"
        >
          <div class="w-12 h-1 bg-slate-200 rounded-full group-hover:bg-blue-400 transition-colors" />
        </div>

        <!-- 下部分：运行时输入 -->
        <div class="flex min-h-0 flex-1 flex-col overflow-hidden">
          <RuntimeInputs
            v-model:config="config"
            :properties="runtimeProperties"
            :upstream-factors="upstreamFactors"
            :node-id="node?.id"
            :input-data="inputData"
          />
        </div>
      </div>

      <!-- 中心配置区域 -->
      <div class="flex-1 flex flex-col bg-white border-r relative min-w-0">
        <div
          class="flex items-center justify-between border-b px-4 bg-white sticky top-0 z-10 shrink-0"
        >
          <div class="flex">
            <button
              v-for="tab in [
                { id: 'parameters', label: '参数设置' },
                { id: 'settings', label: '系统选项' },
              ]"
              :key="tab.id"
              :class="[
                'px-8 py-4 text-xs font-bold uppercase border-b-2 transition-all cursor-pointer',
                activeTab === tab.id
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-slate-400',
              ]"
              @click="activeTab = tab.id"
            >
              {{ tab.label }}
            </button>
          </div>
          <button
            :disabled="node.data.status === 'running'"
            class="n8n-debug-btn h-9 px-5 rounded-lg border-none shadow-sm hover:shadow-md active:scale-95 transition-all flex items-center gap-2 cursor-pointer outline-none disabled:opacity-70"
            @click="runCurrentNode"
          >
            <Loader2
              v-if="node.data.status === 'running'"
              :size="16"
              class="text-white animate-spin"
            />
            <Bug v-else :size="16" class="text-white" />
            <span class="text-[12px] font-bold text-white uppercase tracking-wider">
              {{ node.data.status === 'running' ? '正在调试...' : '调试节点' }}
            </span>
          </button>
        </div>

        <div class="flex-1 p-8 overflow-y-auto custom-scrollbar bg-white min-h-0">
          <div v-if="activeTab === 'parameters'" class="mx-auto max-w-3xl space-y-6">
            <div
              class="flex items-center gap-3 rounded-2xl border px-4 py-3"
              :class="
                nodeHelpSummary.tone === 'warning'
                  ? 'border-amber-200 bg-amber-50'
                  : 'border-slate-200 bg-slate-50/85'
              "
            >
              <div
                class="shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em]"
                :class="
                  nodeHelpSummary.tone === 'warning'
                    ? 'bg-amber-100 text-amber-700'
                    : 'bg-white text-slate-500 border border-slate-200'
                "
              >
                {{ nodeHelpSummary.title }}
              </div>

              <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-medium text-slate-700">
                  <span class="text-slate-900">{{ nodeDefinition?.displayName ?? node?.data.label }}</span>
                  <span class="mx-2 text-slate-300">·</span>
                  <span>{{ nodeHelpSummary.summary }}</span>
                </p>
              </div>

              <button
                v-if="nodeDefinition"
                data-testid="node-help-trigger"
                class="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:border-blue-200 hover:text-blue-600"
                @click="isHelpDialogVisible = true"
              >
                <HelpCircle :size="16" />
              </button>
            </div>
            <ConfigForm
              v-model:config="config"
              :properties="staticProperties"
              :upstream-factors="upstreamFactors"
              :node-id="node?.id"
              :input-data="inputData"
              @save="saveAndClose"
            />
          </div>
          <div
            v-else
            class="flex flex-col items-center justify-center h-full text-slate-400 italic"
          >
            暂无系统选项配置
          </div>
        </div>

        <ConfigFooter class="shrink-0" @close="emit('close')" @save="saveAndClose" />
      </div>

      <!-- 右侧边栏 -->
      <div class="w-[320px] bg-[#f1f5f9] flex flex-col overflow-hidden shrink-0">
        <div class="flex-1 p-4 flex flex-col min-h-0">
          <DataDisplayPanel
            title="节点输出 (OUTPUT)"
            :data="node.data.output"
            type="output"
            :is-pinned="node.data.isPinned"
            @open-detail="openAnalysis('输出数据', node.data.output)"
          />
        </div>
      </div>
    </div>

    <DataAnalysisModal
      :visible="analysisModal.visible"
      :title="analysisModal.title"
      :data="analysisModal.data"
      @close="analysisModal.visible = false"
    />

    <Dialog
      :visible="isHelpDialogVisible"
      modal
      class="node-help-dialog"
      :style="{ width: 'min(840px, 88vw)', maxHeight: '80vh' }"
      @update:visible="isHelpDialogVisible = false"
    >
      <template #header>
        <div class="flex items-center gap-3">
          <div class="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
            <HelpCircle :size="18" />
          </div>
          <div>
            <div class="text-base font-semibold text-slate-900">节点使用帮助</div>
            <p class="mt-1 text-sm text-slate-500">
              {{ nodeDefinition?.displayName ?? node?.data.label }}
            </p>
          </div>
        </div>
      </template>

      <div class="max-h-[62vh] overflow-y-auto pr-1">
        <NodeHelpPanel :node-definition="nodeDefinition" />
      </div>
    </Dialog>
  </Dialog>
</template>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  width: 4px;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  border-radius: 10px;
}
.n8n-debug-btn {
  background: #ff6d5a !important;
}
.n8n-debug-btn:hover {
  background: #ff523d !important;
}
</style>

