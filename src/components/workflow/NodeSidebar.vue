<script setup lang="ts">
import { ref, computed } from 'vue'
import { Search, ChevronRight, X, Info, Box, Layout } from 'lucide-vue-next'
import NodeIcon from './nodes/NodeIcon.vue'
import InputText from 'primevue/inputtext'
import { useWorkflowStore, CONNECTION_RULES } from '@/stores/workflowStore'
import { nodeDefinitions } from '@/nodes/registry'

const store = useWorkflowStore()
const searchQuery = ref('')

const emit = defineEmits(['close'])

const categoryMetadata = [
  { name: '数据获取 (Triggers)', category: 'trigger', label: '数据源', icon: Box },
  { name: '数据处理 (Actions)', category: 'action', label: '数据转换', icon: Layout },
  { name: '终止节点 (Terminal)', category: 'terminal', label: '终止与分析', icon: Box }
]

const filteredCategories = computed(() => {
  const pendingSourceNode = store.nodes.find(n => n.id === store.pendingConnection?.sourceNodeId)
  const sourceCat = pendingSourceNode?.data?.category
  const allowedCategories = sourceCat 
    ? (CONNECTION_RULES[sourceCat] || []) 
    : ['trigger', 'action', 'terminal']

  return categoryMetadata.map(catMeta => {
    const nodes = nodeDefinitions
      .filter(d => d.category === catMeta.category)
      .map(d => ({
        type: d.name,
        label: d.displayName,
        desc: d.description,
        isClickable: allowedCategories.includes(catMeta.category)
      }))
      .filter(n => 
        !searchQuery.value || 
        n.label.toLowerCase().includes(searchQuery.value.toLowerCase()) || 
        n.desc.toLowerCase().includes(searchQuery.value.toLowerCase())
      )

    return { ...catMeta, nodes }
  }).filter(cat => cat.nodes.length > 0)
})

const onNodeClick = (node: any) => {
  if (store.pendingConnection) {
    const pendingSourceNode = store.nodes.find(n => n.id === store.pendingConnection?.sourceNodeId)
    const position = pendingSourceNode 
      ? { x: pendingSourceNode.position.x + 300, y: pendingSourceNode.position.y }
      : { x: 100, y: 100 }
    store.addAndConnectNode(node.type, node.label, position)
  }
}

const onDragStart = (event: DragEvent, node: any) => {
  if (event.dataTransfer) {
    event.dataTransfer.setData('application/vueflow', node.type)
    event.dataTransfer.setData('application/label', node.label)
    event.dataTransfer.effectAllowed = 'move'
  }
}
</script>

<template>
  <div class="flex flex-col h-full bg-[#ffffff] border-l border-[#efefef] shadow-[-10px_0_30px_rgba(0,0,0,0.02)] overflow-hidden">
    <!-- Header -->
    <div class="p-6 pb-4 bg-white sticky top-0 z-20">
      <div class="flex items-center justify-between mb-6">
        <h2 class="text-[11px] font-black text-[#1a1f36] uppercase tracking-[0.2em] opacity-50">Node Library</h2>
        <button @click="emit('close')" class="p-1.5 text-[#a3acb9] hover:text-[#1a1f36] hover:bg-slate-50 rounded-lg transition-all"><X size="16" /></button>
      </div>
      
      <div class="relative group">
        <Search size="14" class="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#a3acb9] group-focus-within:text-indigo-500 transition-colors" />
        <InputText 
          v-model="searchQuery" 
          placeholder="搜索分析算子..." 
          class="n8n-search-input w-full pl-10 pr-4 py-2.5 bg-[#f7f9fc] border border-transparent focus:border-indigo-200 rounded-xl text-[13px] placeholder:text-[#a3acb9] transition-all"
        />
      </div>
    </div>

    <!-- Node List -->
    <div class="flex-1 overflow-y-auto custom-scrollbar px-4 space-y-10 pb-12 pt-2">
      <!-- Quick Add Prompt like n8n -->
      <div v-if="store.pendingConnection" class="mt-2 p-4 bg-[#6366f1] rounded-2xl shadow-xl shadow-indigo-100 animate-in zoom-in-95 duration-200 relative overflow-hidden">
         <div class="relative z-10 flex items-start gap-3">
            <div class="p-1.5 bg-white/20 rounded-lg text-white"><Info size="14" /></div>
            <div class="flex-1">
               <p class="text-[12px] font-bold text-white leading-tight">选择连接目标</p>
               <p class="text-[10px] text-white/70 mt-1 leading-relaxed">系统已根据逻辑为您过滤了可用节点。</p>
            </div>
            <button @click="store.pendingConnection = null" class="text-white/50 hover:text-white"><X size="14" /></button>
         </div>
         <div class="absolute -right-4 -bottom-4 opacity-10"><Box size="60" /></div>
      </div>

      <div v-for="cat in filteredCategories" :key="cat.name">
        <div class="px-2 mb-4 flex items-center gap-3">
          <component :is="cat.icon" size="12" class="text-indigo-500 opacity-70" />
          <span class="text-[10px] font-black text-[#a3acb9] uppercase tracking-[0.15em] whitespace-nowrap">{{ cat.label }}</span>
          <div class="h-[1px] flex-1 bg-gradient-to-r from-[#f1f4f8] to-transparent"></div>
        </div>
        
        <div class="space-y-2">
          <div 
            v-for="node in cat.nodes" 
            :key="node.type"
            draggable="true"
            @dragstart="onDragStart($event, node)"
            @click="onNodeClick(node)"
            class="n8n-node-item group"
            :class="[
              store.pendingConnection 
                ? (node.isClickable ? 'is-connectable' : 'is-disabled') 
                : 'is-normal'
            ]"
          >
            <div class="n8n-node-item-inner flex items-center gap-4 p-3.5 rounded-2xl transition-all border border-transparent">
              <div class="n8n-icon-box p-3 bg-white rounded-xl shadow-[0_2px_8px_rgba(0,0,0,0.03)] border border-[#f1f4f8] group-hover:scale-105 transition-transform duration-300">
                <NodeIcon :type="node.type" :size="24" />
              </div>
              <div class="flex flex-col flex-1 min-w-0">
                <span class="text-[13px] font-bold text-[#1a1f36] truncate tracking-tight group-hover:text-indigo-600 transition-colors">{{ node.label }}</span>
                <span class="text-[10px] text-[#8792a2] font-medium truncate mt-0.5 opacity-80">{{ node.desc }}</span>
              </div>
              <ChevronRight size="14" class="text-indigo-200 opacity-0 group-hover:opacity-100 -translate-x-2 group-hover:translate-x-0 transition-all duration-300" />
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.n8n-search-input:focus {
  background: #ffffff;
  box-shadow: 0 4px 20px -2px rgba(99, 102, 241, 0.08);
}

.n8n-node-item { cursor: grab; }
.n8n-node-item:active { cursor: grabbing; }

.n8n-node-item.is-normal:hover .n8n-node-item-inner { 
  background: #f8fafc; 
  border-color: #f1f5f9;
}

.n8n-node-item.is-connectable .n8n-node-item-inner { 
  background: rgba(99, 102, 241, 0.02); 
  border: 1.5px dashed rgba(99, 102, 241, 0.15); 
  cursor: pointer; 
}

.n8n-node-item.is-connectable:hover .n8n-node-item-inner { 
  background: rgba(99, 102, 241, 0.05); 
  border-color: rgba(99, 102, 241, 0.4); 
  border-style: solid;
}

.n8n-node-item.is-disabled { 
  opacity: 0.2; 
  filter: grayscale(0.8); 
  pointer-events: none; 
}

.custom-scrollbar::-webkit-scrollbar { width: 4px; }
.custom-scrollbar::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; }
.custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #cbd5e1; }
</style>
