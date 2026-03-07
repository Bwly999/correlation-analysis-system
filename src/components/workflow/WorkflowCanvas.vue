<script setup lang="ts">
import { ref, onMounted, watch, nextTick } from 'vue'
import { VueFlow, useVueFlow, type Node, type Edge, type Connection } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import { useWorkflowStore, type WorkflowNode } from '@/stores/workflowStore'
import NodeSidebar from './NodeSidebar.vue'
import BaseNode from './nodes/BaseNode.vue'
import LogPanel from './LogPanel.vue'
import NodeConfigModal from './NodeConfigModal.vue'
import RuntimeInputModal from './RuntimeInputModal.vue'
import DataAnalysisModal from './DataAnalysisModal.vue'
import Button from 'primevue/button'
import N8nEdge from './edges/N8nEdge.vue'
import { Plus, X, ChevronUp, ChevronDown, Play, Terminal, FolderOpen, Trash2, Edit2, Square, Focus, ChevronRight, Save, FileUp, FileDown, Activity, LayoutGrid, Clock, History, CheckCircle2, AlertCircle, StopCircle } from 'lucide-vue-next'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Menu from 'primevue/menu'
import Tabs from 'primevue/tabs';
import TabList from 'primevue/tablist';
import Tab from 'primevue/tab';
import TabPanels from 'primevue/tabpanels';
import TabPanel from 'primevue/tabpanel';

const { onConnect, addEdges, onDragOver, onDrop, project, findNode, onNodeClick, fitView } = useVueFlow()
const store = useWorkflowStore()

const selectedNode = ref<WorkflowNode | null>(null)
const isConfigVisible = ref(false)
const isLogExpanded = ref(true)
const isWorkflowListVisible = ref(false)
const isSidebarVisible = ref(true)
const savedWorkflows = ref<any[]>([])
const activeTab = ref('0')

// 深度分析弹窗状态
const analysisModal = ref({ visible: false, title: '', data: null })

const menu = ref()
const menuItems = ref([
    {
        label: '文件操作',
        items: [
            { label: '导出 JSON 文件', icon: 'pi pi-download', command: () => store.exportWorkflow() },
            { label: '从 JSON 导入', icon: 'pi pi-upload', command: () => triggerImport() }
        ]
    }
])

const toggleMenu = (event: any) => menu.value.toggle(event)
const openWorkflowList = () => {
    savedWorkflows.value = JSON.parse(localStorage.getItem('saved_workflows') || '[]')
    store.loadHistory()
    isWorkflowListVisible.value = true
}

const resetView = async () => {
    await nextTick()
    fitView({ padding: 0.2, duration: 800 })
}

const loadWorkflow = async (id: string) => {
    store.loadWorkflow(id)
    isWorkflowListVisible.value = false
    setTimeout(() => resetView(), 100)
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
    if (file) {
        store.importWorkflow(file)
        setTimeout(() => resetView(), 100)
    }
}

const resumeExecution = async () => {
  if (store.pendingExecution) {
    const { nodeId, forceUpdate } = store.pendingExecution
    store.pendingExecution = null
    await store.executeNode(nodeId, forceUpdate)
  }
}

const restoreExecution = (record: any) => {
    store.nodes = record.nodes
    store.edges = record.edges
    store.workflowName = record.workflowName
    isWorkflowListVisible.value = false
    store.addLog(`已恢复运行历史快照: ${record.id}`, 'info')
    setTimeout(() => resetView(), 100)
}

watch(() => store.lastExecutedTerminalNodeId, (nodeId) => {
  if (nodeId) {
    const node = findNode(nodeId) as WorkflowNode
    if (node && node.data.output) {
      analysisModal.value = { 
        visible: true, 
        title: `${node.data.label} 分析结果`, 
        data: node.data.output 
      }
      store.lastExecutedTerminalNodeId = null 
    }
  }
})

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
  if (!type || !label) return

  const { left, top } = (event.target as HTMLElement).getBoundingClientRect()
  const position = project({ x: event.clientX - left, y: event.clientY - top })
  store.addAndConnectNode(type, label, position)
}

onMounted(() => {
    if (store.nodes.length > 0) {
        resetView()
    } else {
        openWorkflowList()
    }
})
</script>

<template>
  <div class="flex h-screen w-full bg-[#fafafa] text-[#1a1f36] overflow-hidden relative font-sans text-[13px] selection:bg-indigo-100">
    <input type="file" ref="fileInput" class="hidden" accept=".json" @change="handleImport" />
    
    <!-- 顶部菜单栏 -->
    <header class="absolute top-0 left-0 right-0 h-[60px] bg-white border-b border-[#efefef] z-[100] flex items-center justify-between px-6 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
       <div class="flex items-center gap-4">
          <div 
            @click="openWorkflowList"
            class="flex items-center gap-2 text-[#a3acb9] font-bold hover:text-indigo-600 transition-colors cursor-pointer group px-2 py-1 rounded-lg hover:bg-slate-50"
          >
             <FolderOpen size="16" class="group-hover:scale-110 transition-transform" />
             <span>我的项目</span>
             <ChevronRight size="14" class="opacity-50" />
          </div>
          
          <div class="flex items-center gap-2 group">
            <InputText 
              v-model="store.workflowName" 
              class="n8n-header-input font-bold text-[15px] text-[#1a1f36] border-none bg-transparent hover:bg-[#f7f9fc] focus:bg-white rounded-lg px-2.5 py-1.5 transition-all w-auto min-w-[140px]" 
            />
            <Edit2 size="12" class="text-[#a3acb9] opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
          
          <div class="h-4 w-[1px] bg-[#f1f4f8] mx-2"></div>
          
          <div class="flex items-center gap-2 px-3 py-1 bg-[#f0fdf4] text-[#166534] text-[10px] font-black rounded-full border border-[#dcfce7]">
             <Activity size="12" class="animate-pulse" />
             在线
          </div>
       </div>

       <div class="flex items-center gap-3">
         <Button @click="store.saveWorkflow()" severity="secondary" text class="n8n-header-btn h-9 px-4 text-[11px] font-black uppercase tracking-wider flex gap-2 items-center rounded-xl border border-[#f1f4f8] hover:border-indigo-200 hover:bg-indigo-50/30">
           <Save size="16" class="text-indigo-600" />
           保存工作流
         </Button>

         <Button @click="toggleMenu" severity="secondary" text class="n8n-header-btn h-9 px-4 text-[11px] font-bold uppercase tracking-wider flex gap-2 items-center rounded-xl border border-transparent hover:bg-[#f7f9fc]">
           <FileDown size="16" class="opacity-70" />
           导入/导出
         </Button>
         <Menu ref="menu" :model="menuItems" :popup="true" class="n8n-popup-menu" />
       </div>
    </header>

    <!-- 主画布区 -->
    <main class="absolute inset-0 top-[60px] bottom-0">
      <VueFlow v-model:nodes="store.nodes" v-model:edges="store.edges" :default-edge-options="{ animated: true, style: { stroke: '#cbd5e1', strokeWidth: 2.5 }, type: 'n8n' }" @dragover="onDragOverLocal" @drop="onDropLocal">
        <template #node-custom="props"><BaseNode v-bind="props" /></template>
        <template #edge-n8n="props"><N8nEdge v-bind="props" /></template>
        <Background pattern-color="#e2e8f0" pattern-type="dots" :gap="20" :size="1.2" />
        <Controls position="bottom-left" class="ml-6 transition-all duration-300 !bg-white !border-[#efefef] !shadow-xl !rounded-2xl !p-1" :style="{ marginBottom: isLogExpanded ? '350px' : '90px' }">
          <template #control-button-reset></template>
        </Controls>
        <div class="absolute left-6 z-[100] transition-all duration-300" :style="{ bottom: isLogExpanded ? '310px' : '50px' }">
            <button @click="resetView" class="w-10 h-10 bg-white border border-[#efefef] rounded-xl shadow-xl flex items-center justify-center text-[#3c4257] hover:text-indigo-600 transition-all active:scale-90 group" v-tooltip.right="'复位视图'">
                <Focus size="18" />
            </button>
        </div>
      </VueFlow>
    </main>

    <!-- 节点侧边栏 -->
    <aside class="absolute right-0 top-[60px] bottom-0 z-[80] transition-transform duration-500 ease-in-out shadow-[-20px_0_50px_rgba(0,0,0,0.03)]" :class="isSidebarVisible ? 'translate-x-0' : 'translate-x-full'" style="width: 340px;">
      <NodeSidebar @close="isSidebarVisible = false" />
    </aside>

    <!-- 开始/停止运行按钮 -->
    <div class="absolute left-1/2 -translate-x-1/2 z-[90] transition-all duration-500 flex gap-3" :style="{ bottom: isLogExpanded ? '320px' : '64px' }">
       <Button @click="store.runGlobal" :disabled="store.isRunning" class="n8n-execute-bar w-[280px] h-[52px] rounded-2xl shadow-[0_20px_50px_-10px_rgba(16,185,129,0.4)] hover:shadow-emerald-400/60 transform hover:-translate-y-1 transition-all active:scale-[0.97] border-none flex items-center justify-center text-white">
         <Play size="20" fill="currentColor" class="mr-3" />
         <span class="text-[14px] font-black tracking-widest uppercase">开始运行工作流</span>
       </Button>
       <Button v-if="store.isRunning" @click="store.stopExecution" severity="danger" class="w-[52px] h-[52px] rounded-2xl shadow-xl flex items-center justify-center animate-in fade-in zoom-in-75 duration-300" v-tooltip.top="'停止执行'">
         <Square size="20" fill="currentColor" />
       </Button>
    </div>

    <!-- 底部状态栏 -->
    <footer class="absolute bottom-0 left-0 right-0 z-[120] transition-all duration-300 ease-in-out flex flex-col" :style="{ height: isLogExpanded ? '300px' : '44px' }">
      <div class="h-11 min-h-[44px] bg-white border-t border-[#efefef] flex items-center justify-between px-6 shadow-[0_-1px_3px_rgba(0,0,0,0.02)] relative z-10">
         <div class="flex items-center gap-4 h-full">
            <button @click="isLogExpanded = !isLogExpanded" class="flex items-center gap-3 h-full px-4 -ml-6 hover:bg-[#f7f9fc] transition-colors group border-r border-[#f1f4f8]">
               <component :is="isLogExpanded ? ChevronDown : ChevronUp" size="16" class="text-indigo-600 transition-transform duration-300" />
               <div class="flex items-center gap-2.5">
                 <Terminal size="14" :class="isLogExpanded ? 'text-indigo-600' : 'text-[#a3acb9]'" />
                 <span class="text-[11px] font-black uppercase tracking-[0.1em]" :class="isLogExpanded ? 'text-[#1a1f36]' : 'text-[#8792a2]'">执行记录</span>
               </div>
            </button>
         </div>
         <div class="flex items-center gap-4 text-[10px] font-bold text-[#a3acb9] uppercase tracking-widest">
            <span class="flex items-center gap-1.5"><div class="w-1.5 h-1.5 bg-emerald-500 rounded-full"></div> 系统状态: 运行正常</span>
            <div class="w-[1px] h-3 bg-[#f1f4f8]"></div>
            <span>版本 v1.0.5</span>
         </div>
      </div>
      <div v-if="isLogExpanded" class="flex-1 w-full overflow-hidden bg-white shadow-inner">
        <LogPanel />
      </div>
    </footer>

    <!-- 工作流管理弹窗 -->
    <Dialog v-model:visible="isWorkflowListVisible" modal header="工作流管理中心" :style="{ width: '640px' }" class="n8n-modern-dialog" :closable="store.nodes.length > 0">
        <div class="py-2">
            <Tabs v-model:value="activeTab">
                <TabList>
                    <Tab value="0" class="flex items-center gap-2"><FolderOpen size="14" /> 我的工作流</Tab>
                    <Tab value="1" class="flex items-center gap-2"><History size="14" /> 运行历史</Tab>
                </TabList>
                <TabPanels>
                    <TabPanel value="0">
                        <div class="flex flex-col gap-3 py-4">
                            <div @click="() => { store.nodes = []; store.edges = []; store.workflowName = '新建工作流'; isWorkflowListVisible = false }" class="flex items-center gap-4 p-5 bg-indigo-600 text-white rounded-2xl cursor-pointer hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200">
                                <div class="p-3 bg-white/20 rounded-xl"><Plus size="24" /></div>
                                <div>
                                    <div class="font-bold text-[16px]">创建新工作流</div>
                                    <div class="text-[11px] opacity-70">从零开始构建您的分析流程</div>
                                </div>
                            </div>
                            <div class="h-2"></div>
                            <div v-if="savedWorkflows.length === 0" class="text-center py-10 text-[#a3acb9] italic border-2 border-dashed rounded-2xl flex flex-col items-center gap-2">
                                <FolderOpen size="32" class="opacity-20" /> 还没有保存过任何工作流。
                            </div>
                            <div v-for="wf in savedWorkflows" :key="wf.id" class="flex items-center justify-between p-4 bg-[#fcfcfd] border border-[#f1f4f8] rounded-xl hover:border-indigo-200 hover:bg-white transition-all group">
                                <div class="flex flex-col gap-1">
                                    <span class="font-bold text-[13px] text-[#3c4257]">{{ wf.name }}</span>
                                    <span class="text-[10px] text-[#a3acb9] flex items-center gap-1.5 font-medium uppercase tracking-tight"><Clock size="12" /> 更新于 {{ new Date(wf.updatedAt).toLocaleString() }}</span>
                                </div>
                                <div class="flex gap-2">
                                    <Button @click="loadWorkflow(wf.id)" label="打开" size="small" text class="font-black text-indigo-600 px-3" />
                                    <Button @click="deleteWorkflow(wf.id)" severity="danger" text size="small" class="opacity-0 group-hover:opacity-100"><Trash2 size="16" /></Button>
                                </div>
                            </div>
                        </div>
                    </TabPanel>
                    <TabPanel value="1">
                        <div class="flex flex-col gap-3 py-4 max-h-[400px] overflow-y-auto custom-scrollbar px-1">
                            <div v-if="store.executionHistory.length === 0" class="text-center py-20 text-[#a3acb9] italic">
                                <History size="48" class="mx-auto mb-4 opacity-10" /> 暂无执行历史记录。
                            </div>
                            <div v-for="record in store.executionHistory" :key="record.id" class="flex items-center justify-between p-4 bg-[#fcfcfd] border border-[#f1f4f8] rounded-xl hover:bg-white transition-all group border-l-4" :class="record.status === 'success' ? 'border-l-emerald-500' : (record.status === 'error' ? 'border-l-rose-500' : 'border-l-amber-500')">
                                <div class="flex flex-col gap-1">
                                    <div class="flex items-center gap-2">
                                        <CheckCircle2 v-if="record.status === 'success'" size="14" class="text-emerald-500" />
                                        <AlertCircle v-else-if="record.status === 'error'" size="14" class="text-rose-500" />
                                        <StopCircle v-else size="14" class="text-amber-500" />
                                        <span class="font-bold text-[13px] text-[#3c4257]">{{ record.workflowName }}</span>
                                    </div>
                                    <div class="flex items-center gap-3 text-[10px] text-[#a3acb9] font-medium uppercase tracking-tight">
                                        <span class="flex items-center gap-1"><Clock size="12" /> {{ new Date(record.startTime).toLocaleString() }}</span>
                                        <span class="flex items-center gap-1"><Activity size="12" /> {{ (record.duration / 1000).toFixed(2) }}s</span>
                                    </div>
                                </div>
                                <Button @click="restoreExecution(record)" label="查看快照" size="small" text class="font-black text-indigo-600 px-3" />
                            </div>
                        </div>
                    </TabPanel>
                </TabPanels>
            </Tabs>
        </div>
    </Dialog>

    <NodeConfigModal :visible="isConfigVisible" :node="selectedNode" @close="isConfigVisible = false" />
    <RuntimeInputModal :visible="!!store.pendingExecution" :node="store.nodes.find(n => n.id === store.pendingExecution?.nodeId) || null" @close="store.pendingExecution = null" @confirm="resumeExecution" />
    <DataAnalysisModal :visible="analysisModal.visible" :title="analysisModal.title" :data="analysisModal.data" @close="analysisModal.visible = false" />
  </div>
</template>

<style>
@import '@vue-flow/core/dist/style.css';
@import '@vue-flow/core/dist/theme-default.css';

.vue-flow__node-custom { border: none; padding: 0; background: transparent; }
.n8n-execute-bar { background: linear-gradient(135deg, #10b981 0%, #059669 100%) !important; }
.n8n-execute-bar:disabled { opacity: 0.4; cursor: not-allowed; transform: none; }
.n8n-header-input:focus { outline: none; box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.1); }
.n8n-popup-menu { border-radius: 16px !important; border: 1px solid #efefef !important; box-shadow: 0 10px 40px rgba(0,0,0,0.08) !important; padding: 0.5rem !important; }
.n8n-popup-menu .p-menuitem-link { border-radius: 10px !important; padding: 0.75rem 1rem !important; color: #3c4257 !important; font-weight: 600 !important; font-size: 13px !important; }
.n8n-modern-dialog .p-dialog-header { border-bottom: 1px solid #f1f4f8; padding: 1rem 1.5rem; }
.n8n-modern-dialog .p-dialog-header-title { font-weight: 800; font-size: 16px; color: #1a1f36; }
.n8n-modern-dialog .p-dialog-content { padding: 0 1rem; }
.custom-scrollbar::-webkit-scrollbar { width: 4px; }
.custom-scrollbar::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; }
</style>
