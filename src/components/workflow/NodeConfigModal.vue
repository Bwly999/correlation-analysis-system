<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { X, HelpCircle, FileType, Trash2, Settings, Zap, Bug, Pin } from 'lucide-vue-next'
import { useWorkflowStore } from '@/stores/workflowStore'
import { getNodeDefinition } from '@/nodes/registry'
import NodeIcon from './nodes/NodeIcon.vue'
import DataDisplayPanel from './DataDisplayPanel.vue'
import DataAnalysisModal from './DataAnalysisModal.vue'
import MonacoEditor from './MonacoEditor.vue'

// PrimeVue Components
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import Select from 'primevue/select'
import MultiSelect from 'primevue/multiselect'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import ToggleSwitch from 'primevue/toggleswitch'
import DatePicker from 'primevue/datepicker'
import Tree from 'primevue/tree'
import Chips from 'primevue/chips'
import AutoComplete from 'primevue/autocomplete'

const props = defineProps<{
  nodeId: string | null
  visible: boolean
}>()

const emit = defineEmits(['close'])
const store = useWorkflowStore()

// 直接从 Store 中获取响应式节点对象，确保修改立即可见
const node = computed(() => store.nodes.find((n) => n.id === props.nodeId) || null)

// 状态管理
const config = ref<any>({})
const activeTab = ref('parameters')
const editedName = ref('')
const localIsPinned = ref(false)
const localUseManualInput = ref(false)
const localManualInput = ref('')
const _isDragging = ref<Record<string, boolean>>({})

// 深度分析弹窗状态
const analysisModal = ref({ visible: false, title: '', data: null })

// 获取当前节点的定义
const nodeDefinition = computed(() => (node.value ? getNodeDefinition(node.value.data.type) : null))

// 区分静态参数和运行时输入
const runtimeProperties = computed(
  () => nodeDefinition.value?.properties.filter((p) => p.isRuntimeInput) || [],
)
const staticProperties = computed(
  () => nodeDefinition.value?.properties.filter((p) => !p.isRuntimeInput) || [],
)

// 同步初始数据
watch(
  () => node.value,
  (newNode) => {
    if (newNode) {
      editedName.value = newNode.data.label
      localIsPinned.value = newNode.data.isPinned || false
      localUseManualInput.value = newNode.data.useManualInput || false
      localManualInput.value = newNode.data.manualInput || ''
      const baseConfig = { ...newNode.data.config }
      nodeDefinition.value?.properties.forEach((p) => {
        if (baseConfig[p.name] === undefined) baseConfig[p.name] = p.default
      })
      config.value = baseConfig
    }
  },
  { immediate: true },
)

// 同步回 Store (实时同步)
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
  if (!node.value) return null
  const incomingEdges = store.edges.filter((e) => e.target === node.value?.id)
  return incomingEdges.length > 0
    ? store.nodes.find((n) => n.id === incomingEdges[0].source)?.data.output
    : null
})

// 提取上游因子（对于数据源节点，则提取自身输出的因子）
const upstreamFactors = computed(() => {
  let data = localUseManualInput.value ? localManualInput.value : inputData.value
  
  // 如果是数据源节点且没有外部输入，尝试使用节点自身的输出数据
  if (!data && node.value?.data.output) {
    data = node.value.data.output
  }

  if (!data) return []
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data)
    } catch (_e) {
      return []
    }
  }
  if (data.data && Array.isArray(data.data)) data = data.data[0]
  else if (Array.isArray(data)) data = data[0]
  return data && typeof data === 'object'
    ? Object.keys(data).map((key) => ({ name: key, value: key }))
    : []
})

// 用于 AutoComplete 的过滤因子列表
const filteredFactors = ref<string[]>([])
const searchFactors = (event: any) => {
  const query = event.query.toLowerCase()
  filteredFactors.value = upstreamFactors.value
    .filter((f) => f.name.toLowerCase().includes(query))
    .map((f) => f.name)
}

const addCollectionItem = (parent: any, propName: string, subProps: any[]) => {
  if (!parent[propName]) parent[propName] = []
  const newItem: any = {}
  subProps.forEach((p) => (newItem[p.name] = p.default))
  parent[propName].push(newItem)
}

const removeCollectionItem = (parent: any, propName: string, index: number) => {
  parent[propName].splice(index, 1)
}

const onFileSelect = (event: any, propName: string) => {
  const file = event.target.files[0]
  if (file) {
    config.value[propName] = file
    store.addLog(`已选择文件: ${file.name}`, 'info')
  }
  event.target.value = ''
}

const openAnalysis = (title: string, data: any) => {
  analysisModal.value = { visible: true, title, data }
}

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
      <div class="flex items-center justify-between w-full px-1">
        <div class="flex items-center gap-3">
          <NodeIcon :type="node?.data.type || ''" :size="32" />
          <div class="flex flex-col">
            <input
              v-model="editedName"
              class="ndv-title-input h-8 font-bold text-lg p-0 px-2 text-[#1a1f36] rounded transition-all"
              placeholder="输入节点名称..."
              @keydown.enter="saveAndClose"
            />
            <span class="text-[10px] uppercase font-bold text-slate-400 px-2 tracking-widest">{{
              node?.data.type
            }}</span>
          </div>
        </div>
        <div class="flex items-center gap-4">
          <div
            v-tooltip.bottom="'开启后，该节点在运行流程时将跳过计算，直接使用上次生成的输出数据'"
            class="flex items-center gap-2 px-3 py-1.5 bg-slate-100 rounded-lg border border-slate-200"
          >
            <Pin
              size="14"
              :class="localIsPinned ? 'text-amber-500' : 'text-slate-400'"
              :fill="localIsPinned ? 'currentColor' : 'none'"
            />
            <span
              class="text-[11px] font-bold uppercase tracking-wider"
              :class="localIsPinned ? 'text-amber-600' : 'text-slate-500'"
            >
              {{ localIsPinned ? '数据已冻结' : '冻结数据' }}
            </span>
            <ToggleSwitch v-model="localIsPinned" class="scale-75 origin-right" />
          </div>
          <Button severity="secondary" text class="cursor-pointer" @click="emit('close')"
            ><X size="20"
          /></Button>
        </div>
      </div>
    </template>

    <div class="ndv-body grid grid-cols-12 h-full bg-white border-t -mx-6 -mb-6 overflow-hidden">
      <div class="col-span-3 bg-[#f1f5f9] border-r flex flex-col overflow-hidden">
        <div class="flex-[3] min-h-0 p-4 pb-2">
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
              () => {
                localManualInput = JSON.stringify(
                  { data: [{ f1: 10, f2: 20, target: 1 }] },
                  null,
                  2,
                )
              }
            "
          />
        </div>

        <div
          class="flex-[2] min-h-0 flex flex-col border-t border-slate-200 bg-[#f1f5f9] overflow-hidden"
        >
          <div class="px-4 py-3 flex items-center justify-between">
            <span
              class="text-[10px] font-black text-slate-500 uppercase tracking-[0.1em] flex items-center gap-2"
            >
              <Zap size="12" class="text-amber-500" /> 节点启动输入
            </span>
          </div>
          <div class="flex-1 overflow-y-auto px-4 pb-4 custom-scrollbar">
            <div
              v-if="runtimeProperties.length === 0"
              class="h-full flex flex-col items-center justify-center text-slate-400 italic text-[11px]"
            >
              无需额外输入参数
            </div>
            <div v-else class="space-y-6">
              <div
                v-for="prop in runtimeProperties"
                v-show="!prop.displayIf || prop.displayIf(config)"
                :key="prop.name"
                class="flex flex-col gap-2"
              >
                <label class="text-[11px] font-bold text-slate-500 uppercase">{{
                  prop.displayName
                }}</label>
                <div v-if="prop.type === 'file'" class="space-y-2">
                  <label
                    class="flex flex-col items-center justify-center border-2 border-dashed rounded-xl h-24 transition-all cursor-pointer bg-white border-slate-200 hover:border-indigo-400 hover:bg-indigo-50/30"
                    @dragover.prevent
                    @drop.prevent="
                      (e) => {
                        const f = e.dataTransfer?.files[0]
                        if (f) config[prop.name] = f
                      }
                    "
                  >
                    <input type="file" class="hidden" @change="onFileSelect($event, prop.name)" />
                    <FileType
                      size="20"
                      :class="config[prop.name] ? 'text-emerald-500' : 'text-slate-300'"
                      class="mb-1"
                    />
                    <span
                      class="text-[9px] font-bold text-slate-400 text-center px-2 uppercase truncate w-full"
                    >
                      {{ config[prop.name] ? config[prop.name].name : '点击或拖拽上传' }}
                    </span>
                  </label>
                </div>
                <DatePicker
                  v-else-if="prop.type === 'datetime-range'"
                  v-model="config[prop.name]"
                  selection-mode="range"
                  show-time
                  class="w-full text-xs"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="col-span-6 flex flex-col bg-white border-r relative">
        <div class="flex items-center justify-between border-b px-4 bg-white sticky top-0 z-10">
          <div class="flex">
            <button
              :class="[
                'px-8 py-4 text-xs font-bold uppercase border-b-2 transition-all cursor-pointer',
                activeTab === 'parameters'
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-slate-400',
              ]"
              @click="activeTab = 'parameters'"
            >
              参数设置
            </button>
            <button
              :class="[
                'px-6 py-4 text-xs font-bold uppercase border-b-2 transition-all cursor-pointer',
                activeTab === 'settings'
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-slate-400',
              ]"
              @click="activeTab = 'settings'"
            >
              系统选项
            </button>
          </div>
          <button
            :disabled="node?.data.status === 'running'"
            class="n8n-debug-btn h-9 px-5 rounded-lg border-none shadow-sm hover:shadow-md active:scale-95 transition-all flex items-center gap-2 cursor-pointer outline-none focus:outline-none focus:ring-0 ring-0 disabled:opacity-70 disabled:cursor-not-allowed"
            @click="runCurrentNode"
          >
            <Loader2
              v-if="node?.data.status === 'running'"
              size="16"
              class="text-white animate-spin"
            />
            <Bug v-else size="16" class="text-white" />
            <span class="text-[12px] font-bold text-white uppercase tracking-wider">
              {{ node?.data.status === 'running' ? '正在调试...' : '调试节点' }}
            </span>
          </button>
        </div>

        <div class="flex-1 p-8 overflow-y-auto custom-scrollbar bg-white">
          <div v-if="activeTab === 'parameters'" class="space-y-10 max-w-2xl mx-auto py-4">
            <div
              v-for="prop in staticProperties"
              v-show="!prop.displayIf || prop.displayIf(config)"
              :key="prop.name"
              class="flex flex-col gap-3"
            >
              <label class="ndv-label"
                >{{ prop.displayName }}
                <HelpCircle
                  v-if="prop.description"
                  v-tooltip.top="prop.description"
                  size="12"
                  class="text-slate-300 ml-1 cursor-help"
              /></label>

              <div v-if="prop.type === 'collection'" class="space-y-6">
                <div
                  v-for="(item, idx) in config[prop.name]"
                  :key="idx"
                  class="p-6 bg-[#fcfcfd] border border-slate-200 rounded-2xl shadow-sm relative group/item hover:border-indigo-300 transition-all"
                >
                  <div
                    class="flex items-center justify-between mb-6 pb-4 border-b border-slate-100"
                  >
                    <span
                      class="flex items-center gap-2 text-[10px] font-black text-indigo-500 uppercase tracking-widest"
                      ><Settings size="12" /> 配置组 #{{ idx + 1 }}</span
                    >
                    <button
                      class="p-1.5 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all cursor-pointer"
                      @click="removeCollectionItem(config, prop.name, idx)"
                    >
                      <Trash2 size="14" />
                    </button>
                  </div>
                  <div class="space-y-6">
                    <div
                      v-for="subProp in prop.properties"
                      :key="subProp.name"
                      class="flex flex-col gap-2"
                    >
                      <span
                        class="text-[9px] font-bold text-slate-400 uppercase tracking-tighter flex items-center"
                      >
                        {{ subProp.displayName }}
                        <HelpCircle
                          v-if="subProp.description"
                          v-tooltip.top="subProp.description"
                          size="10"
                          class="text-slate-300 ml-1 cursor-help"
                        />
                      </span>
                      <div
                        v-if="subProp.type === 'collection'"
                        class="p-4 bg-white rounded-xl space-y-3 border border-slate-100"
                      >
                        <div
                          v-for="(subItem, subIdx) in item[subProp.name]"
                          :key="subIdx"
                          class="flex items-center gap-3 p-2 bg-slate-50/50 rounded-lg"
                        >
                          <div class="flex-1 grid grid-cols-12 gap-2">
                            <div
                              v-for="ssProp in subProp.properties"
                              :key="ssProp.name"
                              :class="ssProp.type === 'number' ? 'col-span-4' : 'col-span-8'"
                            >
                              <Select
                                v-if="ssProp.type === 'options' && ssProp.name === 'factorName'"
                                v-model="subItem[ssProp.name]"
                                v-tooltip.top="ssProp.description"
                                :options="upstreamFactors"
                                option-label="name"
                                option-value="value"
                                placeholder="选择因子"
                                class="w-full text-xs"
                              />
                              <Select
                                v-else-if="ssProp.type === 'options'"
                                v-model="subItem[ssProp.name]"
                                v-tooltip.top="ssProp.description"
                                :options="ssProp.options"
                                option-label="name"
                                option-value="value"
                                class="w-full text-xs"
                              />
                              <InputNumber
                                v-else-if="ssProp.type === 'number'"
                                v-model="subItem[ssProp.name]"
                                v-tooltip.top="ssProp.description"
                                :placeholder="ssProp.displayName"
                                class="w-full text-xs"
                                :min-fraction-digits="1"
                              />
                              <InputText
                                v-else
                                v-model="subItem[ssProp.name]"
                                v-tooltip.top="ssProp.description"
                                class="w-full text-xs"
                                :placeholder="ssProp.placeholder || ssProp.displayName"
                              />
                            </div>
                          </div>
                          <button
                            class="text-slate-300 hover:text-rose-500 cursor-pointer"
                            @click="removeCollectionItem(item, subProp.name, subIdx)"
                          >
                            <X size="14" />
                          </button>
                        </div>
                        <Button
                          :label="`添加 ${subProp.displayName}`"
                          icon="pi pi-plus"
                          size="small"
                          text
                          class="w-full text-[10px] font-bold cursor-pointer"
                          @click="addCollectionItem(item, subProp.name, subProp.properties || [])"
                        />
                      </div>
                      <Select
                        v-else-if="subProp.type === 'options' && subProp.name === 'factorName'"
                        v-model="item[subProp.name]"
                        :options="upstreamFactors"
                        option-label="name"
                        option-value="value"
                        placeholder="选择因子"
                        class="w-full text-xs ndv-input"
                      />
                      <Select
                        v-else-if="subProp.type === 'options'"
                        v-model="item[subProp.name]"
                        :options="subProp.options"
                        option-label="name"
                        option-value="value"
                        class="w-full text-xs ndv-input"
                      />
                      <MultiSelect
                        v-else-if="subProp.type === 'multi-options'"
                        v-model="item[subProp.name]"
                        :options="upstreamFactors"
                        option-label="name"
                        option-value="value"
                        display="chip"
                        class="w-full text-xs ndv-input"
                      />
                      <InputText
                        v-else
                        v-model="item[subProp.name]"
                        class="w-full text-xs ndv-input"
                        :placeholder="subProp.placeholder"
                      />
                    </div>
                  </div>
                </div>
                <Button
                  label="添加新聚合配置组"
                  icon="pi pi-plus"
                  text
                  class="w-full border-2 border-dashed border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/30 rounded-2xl py-5 transition-all font-bold text-xs cursor-pointer"
                  @click="addCollectionItem(config, prop.name, prop.properties || [])"
                />
              </div>

              <Select
                v-else-if="prop.type === 'options'"
                v-model="config[prop.name]"
                :options="prop.options"
                option-label="name"
                option-value="value"
                class="w-full ndv-input"
                @keydown.enter="saveAndClose"
              />
              <InputNumber
                v-else-if="prop.type === 'number'"
                v-model="config[prop.name]"
                class="w-full ndv-input"
                @keydown.enter="saveAndClose"
              />
              <InputText
                v-else-if="prop.type === 'string'"
                v-model="config[prop.name]"
                class="w-full ndv-input"
                @keydown.enter="saveAndClose"
              />
              <AutoComplete
                v-else-if="prop.type === 'tags'"
                v-model="config[prop.name]"
                multiple
                :suggestions="filteredFactors"
                class="w-full"
                :placeholder="prop.placeholder"
                :dropdown="!!upstreamFactors.length"
                :min-query-length="0"
                @complete="searchFactors"
                @focus="(e: any) => {
                  if (upstreamFactors.length > 0) {
                    searchFactors({ query: e.target.value || '' })
                  }
                }"
                :empty-message="null"
                @keydown.enter="(e: any) => {
                  const val = e.target.value?.trim();
                  if (val) {
                    // 强制作为新标签添加
                    if (!Array.isArray(config[prop.name])) config[prop.name] = [];
                    if (!config[prop.name].includes(val)) {
                      config[prop.name].push(val);
                    }
                    e.target.value = '';
                    e.preventDefault();
                  } else {
                    saveAndClose();
                  }
                }"
                :pt="{
                  root: { class: 'w-full' },
                  input: { class: 'w-full ndv-input text-xs min-h-[42px] p-autocomplete-input' },
                  token: { class: 'bg-indigo-50 text-indigo-700 font-bold border border-indigo-100 rounded-lg py-0.5 px-2' }
                }"
              />
              <MonacoEditor
                v-else-if="prop.type === 'json'"
                v-model="config[prop.name]"
                height="400px"
              />
              <ToggleSwitch v-else-if="prop.type === 'boolean'" v-model="config[prop.name]" />
              <div
                v-else-if="prop.type === 'tree'"
                class="border rounded-lg bg-[#f8fafc] p-2 max-h-[300px] overflow-auto shadow-inner"
              >
                <Tree
                  v-model:selection-keys="config[prop.name]"
                  :value="prop.options"
                  selection-mode="checkbox"
                  class="ndv-tree"
                />
              </div>
            </div>
          </div>
        </div>
        <div class="h-16 border-t flex items-center justify-end px-8 gap-3 bg-white">
          <div class="mr-auto flex items-center gap-2 text-slate-400">
            <kbd
              class="px-1.5 py-0.5 bg-slate-100 border border-slate-200 rounded text-[10px] font-mono font-bold"
              >Enter</kbd
            >
            <span class="text-[11px] font-medium tracking-tight">确认标签 / 快速保存</span>
          </div>
          <Button
            label="取消"
            severity="secondary"
            text
            class="cursor-pointer"
            @click="emit('close')"
          />
          <Button label="应用并保存" class="cursor-pointer" @click="saveAndClose" />
        </div>
      </div>

      <div class="col-span-3 bg-[#f1f5f9] flex flex-col overflow-hidden">
        <div class="flex-1 p-4 flex flex-col">
          <DataDisplayPanel
            title="节点输出 (OUTPUT)"
            :data="node?.data.output"
            type="output"
            :is-pinned="node?.data.isPinned"
            @open-detail="openAnalysis('输出数据', node?.data.output)"
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
.ndv-title-input {
  background: transparent;
  border: 1px solid transparent;
  box-shadow: none !important;
  outline: none !important;
}
.ndv-title-input:hover {
  border-color: #e2e8f0;
}
.ndv-title-input:focus {
  border-color: #6366f1;
  background: white;
}
.ndv-label {
  font-size: 11px;
  font-weight: 700;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  display: flex;
  align-items: center;
}
.ndv-input {
  border-color: #e2e8f0 !important;
  background-color: #ffffff !important;
  border-radius: 8px !important;
}
.custom-scrollbar::-webkit-scrollbar {
  width: 4px;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  border-radius: 10px;
}
.ndv-tree {
  background: transparent !important;
  border: none !important;
  font-size: 12px;
}
.n8n-debug-btn {
  background: #ff6d5a !important;
}
.n8n-debug-btn:hover {
  background: #ff523d !important;
}
</style>
