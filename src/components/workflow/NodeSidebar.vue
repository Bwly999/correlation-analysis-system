<script setup lang="ts">
import { ref, computed } from 'vue'
import { Search, ChevronRight } from 'lucide-vue-next'
import NodeIcon from './nodes/NodeIcon.vue'
import InputText from 'primevue/inputtext'
import { useWorkflowStore, CONNECTION_RULES } from '@/stores/workflowStore'

const store = useWorkflowStore()
const searchQuery = ref('')

const nodeCategories = [
  {
    name: '数据获取 (Triggers)',
    category: 'trigger',
    nodes: [
      { type: 'file-import', label: '本地文件导入', desc: '从 CSV, JSON, Excel 等文件读取数据' },
      { type: 'neighbor-system', label: '相邻系统对接', desc: '按指定频率从外部系统拉取多因子数据' }
    ]
  },
  {
    name: '数据处理 (Actions)',
    category: 'action',
    nodes: [
      { type: 'data-cleaning', label: '数据清洗', desc: '处理缺失值，使用 IQR 检测异常值' },
      { type: 'data-aggregation', label: '数据聚合', desc: '按指定规则聚合单条数据内的多个因子' }
    ]
  },
  {
    name: '算法运行 (Models)',
    category: 'model',
    nodes: [
      { type: 'algorithm', label: '算法模型', desc: '运行 Xgboost/SHAP、Lasso 等计算相关性' }
    ]
  }
]

const filteredCategories = computed(() => {
  const pendingSourceNode = store.nodes.find(n => n.id === store.pendingConnection?.sourceNodeId)
  
  // 获取允许的分类。如果没有起点，则允许全部。
  const sourceCat = pendingSourceNode?.data?.category
  const allowedCategories = sourceCat 
    ? (CONNECTION_RULES[sourceCat] || []) 
    : ['trigger', 'action', 'model']

  return nodeCategories.map(cat => ({
    ...cat,
    nodes: cat.nodes.map(n => ({
      ...n,
      isClickable: allowedCategories.includes(cat.category)
    })).filter(n => 
      !searchQuery.value || 
      n.label.includes(searchQuery.value) || 
      n.desc.includes(searchQuery.value)
    )
  })).filter(cat => cat.nodes.length > 0)
})

const onNodeClick = (node: any) => {
  if (store.pendingConnection) {
    const pendingSourceNode = store.nodes.find(n => n.id === store.pendingConnection?.sourceNodeId)
    const sourceCat = pendingSourceNode?.data?.category
    const allowedCategories = sourceCat ? CONNECTION_RULES[sourceCat] : []

    // 强校验：如果点击的节点分类不在允许范围内，直接拦截
    if (sourceCat && !allowedCategories?.includes(store.getCategoryByType(node.type))) {
      store.addLog(`无法连接: 该节点类型不符合流程规范`, 'error')
      return
    }

    // 计算位置 (n8n 风格：向右偏移)
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
  <div class="flex flex-col h-full bg-white">
    <!-- Header / Search -->
    <div class="p-4 border-b border-slate-100 flex flex-col gap-4">
      <div class="text-sm font-bold text-slate-800">Add Node</div>
      <div class="relative w-full">
         <Search size="14" class="absolute left-3 top-2.5 text-slate-400" />
         <InputText 
           v-model="searchQuery" 
           placeholder="Search nodes..." 
           class="w-full pl-9 py-2 bg-slate-50 border-none focus:ring-2 focus:ring-indigo-500 rounded-lg text-sm"
         />
      </div>
    </div>
    
    <!-- Node List -->
    <div class="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-4">
      <!-- Quick Add Tip -->
      <div v-if="store.pendingConnection" class="px-3 py-2 bg-indigo-50 border border-indigo-100 rounded-lg text-[11px] text-indigo-700 font-bold animate-pulse mb-2 flex items-center justify-between">
         <span>SELECT A NODE TO CONNECT</span>
         <button @click="store.pendingConnection = null" class="text-[10px] hover:text-indigo-900 underline uppercase tracking-tighter">Cancel</button>
      </div>

      <div v-for="cat in filteredCategories" :key="cat.name">
        <div class="px-3 py-2 text-[11px] font-bold text-slate-400 uppercase tracking-widest">
          {{ cat.name }}
        </div>
        <div class="flex flex-col gap-1 mt-1">
          <div 
            v-for="node in cat.nodes" 
            :key="node.type"
            draggable="true"
            @dragstart="onDragStart($event, node)"
            @click="onNodeClick(node)"
            class="group flex items-center gap-3 p-3 rounded-xl transition-all border border-transparent"
            :class="[
              store.pendingConnection 
                ? (node.isClickable ? 'border-indigo-200 bg-indigo-50/30 hover:bg-indigo-50 cursor-pointer' : 'opacity-25 grayscale cursor-not-allowed pointer-events-none') 
                : 'hover:bg-slate-50 cursor-grab active:cursor-grabbing'
            ]"
          >
            <NodeIcon :type="node.type" :size="36" class="shadow-sm border border-slate-100 group-hover:scale-105 transition-transform" />
            <div class="flex flex-col flex-1 min-w-0">
              <span class="text-[13px] font-semibold text-slate-700 truncate">{{ node.label }}</span>
              <span class="text-[11px] text-slate-500 line-clamp-2 leading-tight mt-0.5">{{ node.desc }}</span>
            </div>
            <ChevronRight size="14" class="text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  width: 5px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: #e2e8f0;
  border-radius: 10px;
}
</style>
