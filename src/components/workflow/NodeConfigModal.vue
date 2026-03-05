<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { 
  X, Save, Play, Info, HelpCircle, FileType, LayoutGrid, List, Database, Clock, RefreshCw, ChevronDown, ChevronRight, Plus, Trash2, Settings, Zap, Bug
} from 'lucide-vue-next'
import { useWorkflowStore, type WorkflowNode } from '@/stores/workflowStore'
import { getNodeDefinition } from '@/nodes/registry'
import NodeIcon from './nodes/NodeIcon.vue'
import DataDisplayPanel from './DataDisplayPanel.vue'
import DataAnalysisModal from './DataAnalysisModal.vue'

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

const props = defineProps<{
  node: WorkflowNode | null
  visible: boolean
}>()

const emit = defineEmits(['close'])
const store = useWorkflowStore()

// 状态管理
const config = ref<any>({})
const activeTab = ref('parameters')
const editedName = ref('')
const isDragging = ref<Record<string, boolean>>({})

// 深度分析弹窗状态
const analysisModal = ref({ visible: false, title: '', data: null })

// 获取当前节点的定义
const nodeDefinition = computed(() => props.node ? getNodeDefinition(props.node.data.type) : null)

// 区分静态参数和运行时输入
const runtimeProperties = computed(() => nodeDefinition.value?.properties.filter(p => p.isRuntimeInput) || [])
const staticProperties = computed(() => nodeDefinition.value?.properties.filter(p => !p.isRuntimeInput) || [])

// 同步初始数据
watch(() => props.node, (newNode) => {
  if (newNode) {
    editedName.value = newNode.data.label
    const baseConfig = { ...newNode.data.config }
    nodeDefinition.value?.properties.forEach(p => {
      if (baseConfig[p.name] === undefined) baseConfig[p.name] = p.default
    })
    config.value = baseConfig
  }
}, { immediate: true })

const inputData = computed(() => {
  if (!props.node) return null
  const incomingEdges = store.edges.filter(e => e.target === props.node?.id)
  return incomingEdges.length > 0 ? store.nodes.find(n => n.id === incomingEdges[0].source)?.data.output : null
})

// 提取上游因子
const upstreamFactors = computed(() => {
  let data = props.node?.data.useManualInput ? props.node.data.manualInput : inputData.value
  if (!data) return []
  if (data.data && Array.isArray(data.data)) data = data.data[0]
  else if (Array.isArray(data)) data = data[0]
  return (data && typeof data === 'object') ? Object.keys(data).map(key => ({ name: key, value: key })) : []
})

// 集合处理
const addCollectionItem = (parent: any, propName: string, subProps: any[]) => {
  if (!parent[propName]) parent[propName] = []
  const newItem: any = {}
  subProps.forEach(p => newItem[p.name] = p.default)
  parent[propName].push(newItem)
}

const removeCollectionItem = (parent: any, propName: string, index: number) => {
  parent[propName].splice(index, 1)
}

// 文件处理
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
  if (props.node) {
    props.node.data.config = { ...config.value }
    props.node.data.useManualInput = props.node.data.useManualInput // Ensure synced
    await store.executeNode(props.node.id, true)
  }
}

const saveAndClose = () => {
  if (props.node) {
    props.node.data.label = editedName.value
    props.node.data.config = { ...config.value }
  }
  emit('close')
}
</script>

<template>
  <Dialog 
    :visible="visible" modal @update:visible="emit('close')"
    class="ndv-dialog" :style="{ width: '92vw', maxWidth: '1600px', height: '88vh' }" :closable="false"
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
            />
            <span class="text-[10px] uppercase font-bold text-slate-400 px-2 tracking-widest">{{ node?.data.type }}</span>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <Button severity="secondary" text @click="emit('close')"><X size="20"/></Button>
        </div>
      </div>
    </template>

    <div class="ndv-body grid grid-cols-12 h-full bg-white border-t -mx-6 -mb-6 overflow-hidden">
      
      <!-- COLUMN 1: DYNAMIC INPUTS & RUNTIME CONFIG (Grey Background) -->
      <div class="col-span-3 bg-[#f1f5f9] border-r flex flex-col overflow-hidden">
        <!-- Input Display Panel -->
        <div class="flex-[3] min-h-0 p-4 pb-2">
           <DataDisplayPanel 
             title="输入数据 (INPUT)"
             :data="inputData"
             type="input"
             allow-mock
             v-model:use-manual-input="node!.data.useManualInput"
             v-model:manual-input-str="node!.data.manualInput"
             @open-detail="openAnalysis('输入数据', node!.data.useManualInput ? node!.data.manualInput : inputData)"
             @generate-mock="() => { node!.data.manualInput = JSON.stringify({data:[{f1:10,f2:20,target:1}]}, null, 2) }"
           />
        </div>

        <!-- Runtime Configuration -->
        <div class="flex-[2] min-h-0 flex flex-col border-t border-slate-200 bg-[#f1f5f9] overflow-hidden">
           <div class="px-4 py-3 flex items-center justify-between">
              <span class="text-[10px] font-black text-slate-500 uppercase tracking-[0.1em] flex items-center gap-2">
                <Zap size="12" class="text-amber-500" /> 节点启动输入
              </span>
           </div>
           <div class="flex-1 overflow-y-auto px-4 pb-4 custom-scrollbar">
              <div v-if="runtimeProperties.length === 0" class="h-full flex flex-col items-center justify-center text-slate-400 italic text-[11px]">
                 无需额外输入参数
              </div>
              <div v-else class="space-y-6">
                 <div v-for="prop in runtimeProperties" :key="prop.name" class="flex flex-col gap-2">
                    <label class="text-[11px] font-bold text-slate-500 uppercase">{{ prop.displayName }}</label>
                    <div v-if="prop.type === 'file'" class="space-y-2">
                       <label 
                         class="flex flex-col items-center justify-center border-2 border-dashed rounded-xl h-24 transition-all cursor-pointer bg-white border-slate-200 hover:border-indigo-400 hover:bg-indigo-50/30"
                         @dragover.prevent @drop.prevent="e => { const f = e.dataTransfer?.files[0]; if(f) config[prop.name]=f }"
                       >
                          <input type="file" class="hidden" @change="onFileSelect($event, prop.name)" />
                          <FileType size="20" :class="config[prop.name] ? 'text-emerald-500' : 'text-slate-300'" class="mb-1" />
                          <span class="text-[9px] font-bold text-slate-400 text-center px-2 uppercase truncate w-full">
                             {{ config[prop.name] ? config[prop.name].name : '点击或拖拽上传' }}
                          </span>
                       </label>
                    </div>
                    <DatePicker v-else-if="prop.type === 'datetime-range'" v-model="config[prop.name]" selectionMode="range" showTime class="w-full text-xs" />
                 </div>
              </div>
           </div>
        </div>
      </div>

      <!-- COLUMN 2: PARAMETERS (Pure White Background) -->
      <div class="col-span-6 flex flex-col bg-white border-r relative">
        <!-- Parameters Header -->
        <div class="flex items-center justify-between border-b px-4 bg-white sticky top-0 z-10">
          <div class="flex">
            <button @click="activeTab = 'parameters'" :class="['px-8 py-4 text-xs font-bold uppercase border-b-2 transition-all', activeTab === 'parameters' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-400']">参数设置</button>
            <button @click="activeTab = 'settings'" :class="['px-6 py-4 text-xs font-bold uppercase border-b-2 transition-all', activeTab === 'settings' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-400']">系统选项</button>
          </div>
          
          <Button 
            @click="runCurrentNode"
            class="n8n-debug-btn h-9 px-5 rounded-lg border-none shadow-sm hover:shadow-md active:scale-95 transition-all flex items-center gap-2"
            :loading="node?.data.status === 'running'"
          >
            <Bug size="16" class="text-white" />
            <span class="text-[12px] font-bold text-white uppercase tracking-wider">调试节点</span>
          </Button>
        </div>

        <div class="flex-1 p-8 overflow-y-auto custom-scrollbar bg-white">
          <div v-if="activeTab === 'parameters'" class="space-y-10 max-w-2xl mx-auto py-4">
            <div v-for="prop in staticProperties" :key="prop.name" class="flex flex-col gap-3">
              <label class="ndv-label">{{ prop.displayName }} <HelpCircle v-if="prop.description" size="12" class="text-slate-300 ml-1" /></label>
              
              <div v-if="prop.type === 'collection'" class="space-y-6">
                 <div v-for="(item, idx) in config[prop.name]" :key="idx" class="p-6 bg-[#fcfcfd] border border-slate-200 rounded-2xl shadow-sm relative group/item hover:border-indigo-300 transition-all">
                    <div class="flex items-center justify-between mb-6 pb-4 border-b border-slate-100">
                       <span class="flex items-center gap-2 text-[10px] font-black text-indigo-500 uppercase tracking-widest"><Settings size="12" /> 配置组 #{{ idx + 1 }}</span>
                       <button @click="removeCollectionItem(config, prop.name, idx)" class="p-1.5 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all"><Trash2 size="14" /></button>
                    </div>
                    <div class="space-y-6">
                       <div v-for="subProp in prop.properties" :key="subProp.name" class="flex flex-col gap-2">
                          <span class="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">{{ subProp.displayName }}</span>
                          <div v-if="subProp.type === 'collection'" class="p-4 bg-white rounded-xl space-y-3 border border-slate-100">
                             <div v-for="(subItem, subIdx) in item[subProp.name]" :key="subIdx" class="flex items-center gap-3">
                                <Select v-model="subItem.factorName" :options="upstreamFactors" optionLabel="name" optionValue="value" placeholder="选择因子" class="flex-1 text-xs" />
                                <InputNumber v-model="subItem.weight" placeholder="权重" class="w-24" :minFractionDigits="1" />
                                <button @click="removeCollectionItem(item, subProp.name, subIdx)" class="text-slate-300 hover:text-rose-500"><X size="14" /></button>
                             </div>
                             <Button @click="addCollectionItem(item, subProp.name, subProp.properties || [])" label="添加参与因子" icon="pi pi-plus" size="small" text class="w-full text-[10px] font-bold" />
                          </div>
                          <Select v-else-if="subProp.type === 'options'" v-model="item[subProp.name]" :options="subProp.options" optionLabel="name" optionValue="value" class="w-full text-xs ndv-input" />
                          <MultiSelect v-else-if="subProp.type === 'multi-options'" v-model="item[subProp.name]" :options="upstreamFactors" optionLabel="name" optionValue="value" display="chip" class="w-full text-xs ndv-input" />
                          <InputText v-else v-model="item[subProp.name]" class="w-full text-xs ndv-input" :placeholder="subProp.placeholder" />
                       </div>
                    </div>
                 </div>
                 <Button @click="addCollectionItem(config, prop.name, prop.properties || [])" label="添加新聚合配置组" icon="pi pi-plus" text class="w-full border-2 border-dashed border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/30 rounded-2xl py-5 transition-all font-bold text-xs" />
              </div>

              <Select v-else-if="prop.type === 'options'" v-model="config[prop.name]" :options="prop.options" optionLabel="name" optionValue="value" class="w-full ndv-input" />
              <InputNumber v-else-if="prop.type === 'number'" v-model="config[prop.name]" class="w-full ndv-input" />
              <InputText v-else-if="prop.type === 'string'" v-model="config[prop.name]" class="w-full ndv-input" />
              <ToggleSwitch v-else-if="prop.type === 'boolean'" v-model="config[prop.name]" />
              <div v-else-if="prop.type === 'tree'" class="border rounded-lg bg-[#f8fafc] p-2 max-h-[300px] overflow-auto shadow-inner"><Tree v-model:selectionKeys="config[prop.name]" :value="prop.options" selectionMode="checkbox" class="ndv-tree" /></div>
            </div>
          </div>
        </div>
        <div class="h-16 border-t flex items-center justify-end px-8 gap-3 bg-white">
           <Button label="取消" severity="secondary" text @click="emit('close')" />
           <Button label="应用并保存" @click="saveAndClose" />
        </div>
      </div>

      <!-- COLUMN 3: OUTPUT DATA (Grey Background) -->
      <div class="col-span-3 bg-[#f1f5f9] flex flex-col overflow-hidden">
        <div class="flex-1 p-4 flex flex-col">
           <DataDisplayPanel 
             title="节点输出 (OUTPUT)"
             :data="node?.data.output"
             type="output"
             @open-detail="openAnalysis('输出数据', node?.data.output)"
           />
        </div>
      </div>
    </div>

    <!-- 深度分析弹窗 -->
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

.ndv-label { font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; display: flex; align-items: center; }
.ndv-input { border-color: #e2e8f0 !important; background-color: #ffffff !important; border-radius: 8px !important; }
.custom-scrollbar::-webkit-scrollbar { width: 4px; }
.custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
.custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
.ndv-tree { background: transparent !important; border: none !important; font-size: 12px; }

.n8n-debug-btn {
  background: #ff6d5a !important; /* n8n standard orange */
}
.n8n-debug-btn:hover {
  background: #ff523d !important;
}
</style>
