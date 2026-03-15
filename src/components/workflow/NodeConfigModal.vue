<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { Loader2, Bug } from 'lucide-vue-next'
import { useWorkflowStore } from '@/stores/workflowStore'
import { getNodeDefinition } from '@/nodes/registry'

// Sub Components
import DataDisplayPanel from './DataDisplayPanel.vue'
import DataAnalysisModal from './DataAnalysisModal.vue'
import ConfigHeader from './config/ConfigHeader.vue'
import ConfigFooter from './config/ConfigFooter.vue'
import ConfigForm from './config/ConfigForm.vue'
import RuntimeInputs from './config/RuntimeInputs.vue'

// PrimeVue Components
import Dialog from 'primevue/dialog'

const props = defineProps<{
  nodeId: string | null
  visible: boolean
}>()

const emit = defineEmits(['close'])
const store = useWorkflowStore()

// 直接从 Store 中获取响应式节点对象
const node = computed(() => store.nodes.find((n) => n.id === props.nodeId) || null)

// 状态管理
const config = ref<any>({})
const activeTab = ref('parameters')
const editedName = ref('')
const localIsPinned = ref(false)
const localUseManualInput = ref(false)
const localManualInput = ref('')

// 深度分析弹窗状态
const analysisModal = ref({ visible: false, title: '', data: null })

// 获取当前节点的定义
const nodeDefinition = computed(() => (node.value ? getNodeDefinition(node.value.data.type) : null))

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

  const incomingEdges = store.edges.filter((e) => e.target === currentNode.id)
  if (incomingEdges.length === 0) return null

  if (nodeDefinition.value?.inputMode === 'multiple') {
    return {
      inputs: incomingEdges.map((edge, index) => {
        const sourceNode = store.nodes.find((n) => n.id === edge.source)
        const payload = sourceNode?.data.output ?? null
        const rowCount = Array.isArray(payload?.data) ? payload.data.length : 0
        const sample = Array.isArray(payload?.data) && payload.data.length > 0 ? payload.data[0] : null

        return {
          sourceNodeId: edge.source,
          sourceNodeLabel: sourceNode?.data.label ?? edge.source,
          edgeId: edge.id,
          order: index,
          payload,
          summary: {
            rowCount,
            fields: sample && typeof sample === 'object' ? Object.keys(sample) : [],
          },
        }
      }),
    }
  }

  return store.nodes.find((n) => n.id === incomingEdges[0]?.source)?.data.output ?? null
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
  if (data.data && Array.isArray(data.data)) data = data.data[0]
  else if (Array.isArray(data)) data = data[0]
  return data && typeof data === 'object'
    ? Object.keys(data).map((key) => ({ name: key, value: key }))
    : []
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

    <div v-if="node" class="ndv-body flex h-full bg-white border-t -mx-6 overflow-hidden">
      <!-- 左侧边栏 -->
      <div class="w-[320px] bg-[#f1f5f9] border-r flex flex-col overflow-hidden shrink-0">
        <div class="flex-[3] min-h-0 p-4 pb-2 flex flex-col">
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
        <div class="flex-none">
          <RuntimeInputs
            v-model:config="config"
            :properties="runtimeProperties"
            :upstream-factors="upstreamFactors"
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
              size="16"
              class="text-white animate-spin"
            />
            <Bug v-else size="16" class="text-white" />
            <span class="text-[12px] font-bold text-white uppercase tracking-wider">
              {{ node.data.status === 'running' ? '正在调试...' : '调试节点' }}
            </span>
          </button>
        </div>

        <div class="flex-1 p-8 overflow-y-auto custom-scrollbar bg-white min-h-0">
          <ConfigForm
            v-if="activeTab === 'parameters'"
            v-model:config="config"
            :properties="staticProperties"
            :upstream-factors="upstreamFactors"
            @save="saveAndClose"
          />
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

