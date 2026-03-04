<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { VueFlow, useVueFlow, type Node, type Edge, type Connection } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import { useWorkflowStore, type WorkflowNode } from '@/stores/workflowStore'
import NodeSidebar from './NodeSidebar.vue'
import BaseNode from './nodes/BaseNode.vue'
import LogPanel from './LogPanel.vue'
import NodeConfigModal from './NodeConfigModal.vue'
import RuntimeInputModal from './RuntimeInputModal.vue'
import Button from 'primevue/button'
import N8nEdge from './edges/N8nEdge.vue'
import { Plus, X, ChevronUp, ChevronDown, Play, Terminal, FolderOpen, Trash2, Edit2, Square } from 'lucide-vue-next'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Menu from 'primevue/menu'

const { onConnect, addEdges, onDragOver, onDrop, project, findNode, onNodeClick } = useVueFlow()
const store = useWorkflowStore()

const selectedNode = ref<WorkflowNode | null>(null)
const isConfigVisible = ref(false)
const isLogExpanded = ref(true)
const isWorkflowListVisible = ref(false)
const savedWorkflows = ref<any[]>([])

const menu = ref()
const menuItems = ref([
    {
        label: '工作流操作',
        items: [
            { label: '保存工作流', icon: 'pi pi-save', command: () => store.saveWorkflow() },
            { label: '打开工作流', icon: 'pi pi-folder-open', command: () => openWorkflowList() },
            { separator: true },
            { label: '导出 JSON', icon: 'pi pi-download', command: () => store.exportWorkflow() },
            { label: '导入 JSON', icon: 'pi pi-upload', command: () => triggerImport() }
        ]
    }
])

const toggleMenu = (event: any) => menu.value.toggle(event)
const openWorkflowList = () => {
    savedWorkflows.value = JSON.parse(localStorage.getItem('saved_workflows') || '[]')
    isWorkflowListVisible.value = true
}
const loadWorkflow = (id: string) => {
    store.loadWorkflow(id)
    isWorkflowListVisible.value = false
}
const deleteWorkflow = (id: string) => {
    const saved = JSON.parse(localStorage.getItem('saved_workflows') || '[]')
    const filtered = saved.filter((w: any) => w.id !== id)
    localStorage.setItem('saved_workflows', JSON.stringify(filtered))
    savedWorkflows.value = filtered
    store.addLog('工作流已删除', 'warn')
}

const fileInput = ref<HTMLInputElement | null>(null)
const triggerImport = () => fileInput.value?.click()
const handleImport = (event: any) => {
    const file = event.target.files[0]
    if (file) store.importWorkflow(file)
}

const resumeExecution = async () => {
  if (store.pendingExecution) {
    const { nodeId, forceUpdate } = store.pendingExecution
    store.pendingExecution = null
    await store.executeNode(nodeId, forceUpdate)
  }
}

watch(() => store.activeConfigNodeId, (nodeId) => {
  if (nodeId) {
    const node = findNode(nodeId)
    if (node) {
      selectedNode.value = node as WorkflowNode
      isConfigVisible.value = true
    }
  }
})

watch(isConfigVisible, (visible) => {
  if (!visible) store.activeConfigNodeId = null
})

onNodeClick(({ node }) => {
  selectedNode.value = node as WorkflowNode
  isConfigVisible.value = true
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

  const category = store.getCategoryByType(type || '')
  if (category === 'trigger' && store.nodes.some(n => n.data.category === 'trigger')) {
    store.addLog('流程规范限制: 工作流只能包含一个数据获取节点', 'error')
    return
  }

  const { left, top } = (event.target as HTMLElement).getBoundingClientRect()
  const position = project({ x: event.clientX - left, y: event.clientY - top })
  const newNode: Node = {
    id: `node_${Date.now()}`,
    type: 'custom',
    position,
    label,
    data: { 
      label, type, category, status: 'idle', config: {}, logs: []
    },
  }
  store.nodes.push(newNode)
}
</script>

<template>
  <div class="flex h-screen w-full bg-[#fafafa] text-slate-900 overflow-hidden relative font-sans text-sm">
    <input type="file" ref="fileInput" class="hidden" accept=".json" @change="handleImport" />
    
    <!-- 顶部工具栏 -->
    <div class="absolute top-0 left-0 right-0 h-14 bg-white/80 backdrop-blur-md border-b border-slate-200 z-40 flex items-center justify-between px-6">
       <div class="flex items-center gap-4">
          <div class="flex items-center gap-2 group">
            <InputText v-model="store.workflowName" class="border-none bg-transparent hover:bg-slate-100 focus:bg-white font-bold text-lg p-1 px-2 rounded transition-all w-auto min-w-[100px]" />
            <Edit2 size="14" class="text-slate-300 opacity-0 group-hover:opacity-100" />
          </div>
          <div class="px-2 py-0.5 bg-green-100 text-green-700 text-[10px] font-black rounded uppercase tracking-widest">Active</div>
       </div>
       <div class="flex items-center gap-2">
         <Button @click="toggleMenu" severity="secondary" text class="h-9 px-3 text-xs font-bold uppercase tracking-wider flex gap-2 items-center">
           <FolderOpen size="16" />
           Workflow
         </Button>
         <Menu ref="menu" :model="menuItems" :popup="true" />
         <div class="w-[1px] h-6 bg-slate-200 mx-2"></div>
         <Button severity="secondary" text class="h-9 px-3 text-xs font-bold uppercase tracking-wider">Share</Button>
       </div>
    </div>

    <!-- Quick Add Global Prompt -->
    <div v-if="store.pendingConnection" class="absolute top-20 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
       <div class="bg-indigo-600 text-white px-6 py-2.5 rounded-full shadow-2xl flex items-center gap-3 animate-bounce pointer-events-auto border-2 border-indigo-400">
          <Plus size="18" />
          <span class="text-sm font-bold uppercase tracking-wider">Select a node from the library to add & connect</span>
          <button @click="store.pendingConnection = null" class="ml-2 p-1 hover:bg-white/20 rounded-full transition-colors"><X size="16" /></button>
       </div>
    </div>

    <!-- 全局控制按钮 (开始/停止) -->
    <div 
      class="absolute left-1/2 -translate-x-1/2 z-50 transition-all duration-300 ease-in-out flex gap-3"
      :style="{ bottom: isLogExpanded ? '320px' : '64px' }"
    >
       <Button 
         @click="store.runGlobal"
         :disabled="store.isRunning"
         class="execute-workflow-btn w-64 h-12 rounded-lg shadow-[0_10px_25px_-5px_rgba(16,185,129,0.4)] hover:shadow-emerald-400/60 transform hover:-translate-y-0.5 transition-all active:scale-[0.98] border-none flex items-center justify-center text-white"
       >
         <Play size="18" fill="currentColor" class="mr-2" />
         <span class="text-sm font-bold tracking-wider">开始运行</span>
       </Button>

       <Button 
         v-if="store.isRunning"
         @click="store.stopExecution"
         severity="danger"
         class="w-12 h-12 rounded-lg shadow-lg flex items-center justify-center animate-in fade-in zoom-in duration-200"
         v-tooltip.top="'停止运行'"
       >
         <Square size="18" fill="currentColor" />
       </Button>
    </div>

    <!-- 主工作区 -->
    <div class="absolute inset-0 top-14 bottom-0">
      <VueFlow v-model:nodes="store.nodes" v-model:edges="store.edges" :default-edge-options="{ animated: true, style: { stroke: '#a8a29e', strokeWidth: 2.5 }, type: 'n8n' }" @dragover="onDragOverLocal" @drop="onDropLocal">
        <template #node-custom="props"><BaseNode v-bind="props" /></template>
        <template #edge-n8n="props"><N8nEdge v-bind="props" /></template>
        <Background pattern-color="#e2e8f0" pattern-type="dots" :gap="20" :size="1.5" />
        <Controls position="bottom-left" class="mb-14 ml-4 shadow-lg border-slate-200" />
      </VueFlow>
    </div>

    <!-- 右侧面板 -->
    <div class="absolute right-0 top-14 bottom-0 w-[320px] bg-white border-l border-slate-200 shadow-2xl z-30 transform transition-transform">
      <NodeSidebar />
    </div>

    <!-- 底部面板 -->
    <div class="absolute bottom-0 left-0 right-0 z-40 transition-all duration-300 ease-in-out flex flex-col" :style="{ height: isLogExpanded ? '300px' : '40px' }">
      <div class="h-10 min-h-[40px] bg-white border-t border-slate-200 flex items-center justify-between px-4 shadow-sm relative z-10 font-sans">
         <div class="flex items-center gap-4 h-full">
            <button @click="isLogExpanded = !isLogExpanded" class="flex items-center gap-3 px-4 h-full hover:bg-slate-50 transition-colors border-r border-slate-100 group">
               <component :is="isLogExpanded ? ChevronDown : ChevronUp" size="16" class="text-indigo-600 transition-transform duration-300" />
               <div class="flex items-center gap-2">
                 <Terminal size="14" :class="isLogExpanded ? 'text-indigo-600' : 'text-slate-400'" />
                 <span class="text-[11px] font-bold uppercase tracking-widest" :class="isLogExpanded ? 'text-slate-800' : 'text-slate-500'">Executions</span>
               </div>
               <div v-if="store.logs.length > 0 && !isLogExpanded" class="w-2 h-2 bg-indigo-500 rounded-full animate-pulse"></div>
            </button>
         </div>
         <div class="text-[10px] text-slate-400 font-medium">Workflow Status: <span class="text-emerald-500 font-bold uppercase">Ready</span></div>
      </div>
      <div v-if="isLogExpanded" class="flex-1 w-full overflow-hidden"><LogPanel /></div>
    </div>

    <!-- 各种弹窗 -->
    <Dialog v-model:visible="isWorkflowListVisible" modal header="我的工作流" :style="{ width: '500px' }">
        <div class="flex flex-col gap-2">
            <div v-if="savedWorkflows.length === 0" class="text-center py-10 text-slate-400 italic text-sm">暂无保存的工作流</div>
            <div v-for="wf in savedWorkflows" :key="wf.id" class="flex items-center justify-between p-3 border rounded-lg hover:bg-slate-50 transition-all group">
                <div class="flex flex-col">
                    <span class="font-bold text-slate-700">{{ wf.name }}</span>
                    <span class="text-[10px] text-slate-400">更新于: {{ new Date(wf.updatedAt).toLocaleString() }}</span>
                </div>
                <div class="flex gap-2">
                    <Button @click="loadWorkflow(wf.id)" label="打开" size="small" text />
                    <Button @click="deleteWorkflow(wf.id)" severity="danger" text size="small"><Trash2 size="14" /></Button>
                </div>
            </div>
        </div>
    </Dialog>

    <NodeConfigModal :visible="isConfigVisible" :node="selectedNode" @close="isConfigVisible = false" />
    
    <RuntimeInputModal 
      :visible="!!store.pendingExecution" 
      :node="store.nodes.find(n => n.id === store.pendingExecution?.nodeId) || null"
      @close="store.pendingExecution = null" 
      @confirm="resumeExecution" 
    />
  </div>
</template>

<style>
@import '@vue-flow/core/dist/style.css';
@import '@vue-flow/core/dist/theme-default.css';
.vue-flow__node-custom { border: none; padding: 0; background: transparent; }
.execute-workflow-btn { background: linear-gradient(135deg, #10b981 0%, #059669 100%) !important; }
.execute-workflow-btn:disabled { opacity: 0.6; cursor: not-allowed; }
</style>
