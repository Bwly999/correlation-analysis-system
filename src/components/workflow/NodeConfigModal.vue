<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { 
  X, Save, Play, Info, HelpCircle, Terminal, FileType, LayoutGrid, List, Database, Clock
} from 'lucide-vue-next'
import { useWorkflowStore, type WorkflowNode } from '@/stores/workflowStore'
import { getNodeDefinition } from '@/nodes/registry'
import NodeIcon from './nodes/NodeIcon.vue'

// PrimeVue Components
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import Select from 'primevue/select'
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
      if (baseConfig[p.name] === undefined) {
        baseConfig[p.name] = p.default
      }
    })
    config.value = baseConfig
  }
}, { immediate: true })

const inputData = computed(() => {
  if (!props.node) return null
  const incomingEdges = store.edges.filter(e => e.target === props.node?.id)
  return incomingEdges.length > 0 ? store.nodes.find(n => n.id === incomingEdges[0].source)?.data.output : { message: "No upstream data" }
})

// 文件处理辅助
const onFileSelect = (event: any, propName: string) => {
  const file = event.target.files[0]
  if (file) {
    config.value[propName] = file
    store.addLog(`已选择文件: ${file.name}`, 'info')
  }
}

const runCurrentNode = async () => {
  if (props.node) {
    // 运行前保存配置到 store
    props.node.data.config = { ...config.value }
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
    :visible="visible" 
    modal 
    @update:visible="emit('close')"
    class="ndv-dialog"
    :style="{ width: '92vw', maxWidth: '1500px', height: '88vh' }"
    :closable="false"
  >
    <template #header>
      <div class="flex items-center justify-between w-full px-1">
        <div class="flex items-center gap-3">
          <NodeIcon :type="node?.data.type || ''" :size="32" />
          <div class="flex flex-col">
            <InputText v-model="editedName" class="ndv-title-input h-8 font-bold text-lg p-0 px-2" />
            <span class="text-[10px] uppercase font-bold text-slate-400 px-2">{{ node?.data.type }}</span>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <Button severity="secondary" text @click="emit('close')"><X size="20"/></Button>
        </div>
      </div>
    </template>

    <div class="ndv-body grid grid-cols-12 h-full bg-white border-t -mx-6 -mb-6 overflow-hidden">
      
      <!-- COLUMN 1: INPUTS (Upstream Output + Runtime Inputs) -->
      <div class="col-span-3 bg-slate-50 border-r flex flex-col overflow-hidden">
        <!-- Upstream Data Section -->
        <div class="p-4 border-b border-slate-200 shrink-0">
           <div class="flex items-center justify-between mb-3">
              <span class="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <Database size="12" /> Upstream Data
              </span>
           </div>
           <div class="h-32 overflow-auto bg-slate-900 rounded-lg p-3 font-mono text-[10px] text-slate-300 custom-scrollbar">
              <pre>{{ JSON.stringify(inputData, null, 2) }}</pre>
           </div>
        </div>

        <!-- Runtime Inputs Section (New focus) -->
        <div class="flex-1 overflow-y-auto p-4 custom-scrollbar bg-white">
           <div class="flex items-center gap-2 mb-6">
              <div class="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse"></div>
              <span class="text-[10px] font-black text-slate-800 uppercase tracking-widest">Runtime Inputs</span>
           </div>

           <div v-if="runtimeProperties.length === 0" class="text-center py-10 text-slate-300 italic text-[11px]">
              No runtime inputs required.
           </div>

           <div v-else class="space-y-8">
              <div v-for="prop in runtimeProperties" :key="prop.name" class="flex flex-col gap-2">
                <label class="ndv-label text-indigo-600">
                  {{ prop.displayName }} 
                  <HelpCircle v-if="prop.description" size="12" class="text-slate-300 ml-1" />
                </label>
                
                <!-- Runtime File Upload -->
                <div v-if="prop.type === 'file'" class="space-y-3">
                  <div v-if="config[prop.name]" class="p-3 bg-emerald-50 border border-emerald-100 rounded-lg flex items-center justify-between">
                     <span class="text-[11px] font-bold text-emerald-800 truncate">{{ config[prop.name].name }}</span>
                     <Button icon="pi pi-times" severity="danger" text size="small" @click="config[prop.name] = null" />
                  </div>
                  <label v-else class="flex flex-col items-center justify-center p-6 border-2 border-dashed border-indigo-100 rounded-xl hover:bg-indigo-50 hover:border-indigo-400 transition-all cursor-pointer group">
                     <input type="file" class="hidden" @change="onFileSelect($event, prop.name)" />
                     <FileType size="24" class="text-indigo-200 group-hover:text-indigo-500 mb-2" />
                     <span class="text-[9px] font-black text-indigo-400 uppercase">Select Data File</span>
                  </label>
                </div>

                <!-- Runtime Date Range -->
                <DatePicker v-else-if="prop.type === 'datetime-range'" v-model="config[prop.name]" selectionMode="range" showTime :manualInput="false" class="w-full ndv-input" />
                
                <p v-if="prop.description" class="text-[9px] text-slate-400 leading-normal italic">{{ prop.description }}</p>
              </div>
           </div>
        </div>
      </div>

      <!-- COLUMN 2: STATIC PARAMETERS -->
      <div class="col-span-6 flex flex-col bg-white">
        <div class="flex border-b">
          <button @click="activeTab = 'parameters'" :class="['px-6 py-3 text-xs font-bold uppercase border-b-2 transition-all', activeTab === 'parameters' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-400']">Parameters</button>
          <button @click="activeTab = 'settings'" :class="['px-6 py-3 text-xs font-bold uppercase border-b-2 transition-all', activeTab === 'settings' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-400']">Settings</button>
        </div>

        <div class="flex-1 p-10 overflow-y-auto custom-scrollbar">
          <div v-if="activeTab === 'parameters'" class="space-y-10 max-w-xl mx-auto">
            
            <div v-for="prop in staticProperties" :key="prop.name" class="flex flex-col gap-2">
              <label class="ndv-label">
                {{ prop.displayName }} 
                <HelpCircle v-if="prop.description" size="12" class="text-slate-300 ml-1" />
              </label>
              
              <!-- 下拉框 -->
              <Select v-if="prop.type === 'options'" v-model="config[prop.name]" :options="prop.options" optionLabel="name" optionValue="value" class="w-full ndv-input" />
              
              <!-- 数字输入 -->
              <InputNumber v-else-if="prop.type === 'number'" v-model="config[prop.name]" :minFractionDigits="1" class="w-full ndv-input" />
              
              <!-- 文本输入 -->
              <InputText v-else-if="prop.type === 'string'" v-model="config[prop.name]" :placeholder="prop.placeholder" class="w-full ndv-input" />
              
              <!-- 开关 -->
              <ToggleSwitch v-else-if="prop.type === 'boolean'" v-model="config[prop.name]" />

              <!-- 树形选择 (保持占位) -->
              <div v-else-if="prop.type === 'tree'" class="border rounded-lg bg-slate-50 p-2">
                 <Tree :value="[]" selectionMode="checkbox" class="ndv-tree" />
              </div>

              <p v-if="prop.description" class="text-[10px] text-slate-400 mt-1 italic">{{ prop.description }}</p>
            </div>

            <div v-if="!staticProperties.length" class="text-center py-20 text-slate-300 italic">
               No configuration parameters for this node.
            </div>
          </div>
        </div>

        <div class="h-16 border-t flex items-center justify-end px-8 gap-3 bg-slate-50/50">
           <Button label="Cancel" severity="secondary" text @click="emit('close')" />
           <Button label="Save Changes" @click="saveAndClose" />
        </div>
      </div>

      <!-- COLUMN 3: OUTPUT -->
      <div class="col-span-3 bg-slate-50 border-l flex flex-col overflow-hidden">
        <div class="p-4 border-b bg-white flex items-center justify-between">
          <span class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Output Data</span>
          <Button label="Execute" size="small" icon="pi pi-play" :loading="node?.data.status === 'running'" @click="runCurrentNode" />
        </div>
        <div class="flex-1 p-4 font-mono text-[11px] overflow-auto custom-scrollbar">
          <pre class="text-indigo-600 leading-relaxed">{{ JSON.stringify(node?.data.output || {}, null, 2) }}</pre>
        </div>
      </div>

    </div>
  </Dialog>
</template>

<style scoped>
.ndv-title-input { background: transparent !important; border: none !important; box-shadow: none !important; }
.ndv-label { font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; display: flex; align-items: center; }
.ndv-input { border-color: #e2e8f0 !important; background-color: #f8fafc !important; }
.custom-scrollbar::-webkit-scrollbar { width: 4px; }
.custom-scrollbar::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; }
</style>
