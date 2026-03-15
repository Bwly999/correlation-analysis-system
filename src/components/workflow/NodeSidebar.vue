<script setup lang="ts">
import { ref, computed } from 'vue'
import { Search, ChevronRight, X, Info, Box, Layout } from 'lucide-vue-next'

import NodeIcon from './nodes/NodeIcon.vue'
import { useWorkflowStore, CONNECTION_RULES } from '@/stores/workflowStore'
import { nodeDefinitions } from '@/nodes/registry'

const store = useWorkflowStore()
const searchQuery = ref('')

const emit = defineEmits(['close'])

const categoryMetadata = [
  { name: '数据接入', category: 'trigger', label: '数据接入', icon: Box },
  { name: '数据准备', category: 'action', label: '数据准备', icon: Layout },
  { name: '分析输出', category: 'terminal', label: '分析输出', icon: Box },
]

const filteredCategories = computed(() => {
  const pendingSourceNode = store.nodes.find((n) => n.id === store.pendingConnection?.sourceNodeId)
  const sourceCat = pendingSourceNode?.data?.category
  const allowedCategories = sourceCat
    ? CONNECTION_RULES[sourceCat] || []
    : ['trigger', 'action', 'terminal']

  return categoryMetadata
    .map((catMeta) => {
      const nodes = nodeDefinitions
        .filter((definition) => definition.category === catMeta.category)
        .map((definition) => ({
          type: definition.name,
          label: definition.displayName,
          desc: definition.description,
          isClickable: allowedCategories.includes(catMeta.category),
        }))
        .filter(
          (node) =>
            !searchQuery.value ||
            node.label.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
            node.desc.toLowerCase().includes(searchQuery.value.toLowerCase()),
        )

      return { ...catMeta, nodes }
    })
    .filter((category) => category.nodes.length > 0)
})

const onNodeClick = (node: { type: string; label: string }) => {
  if (store.pendingConnection) {
    const pendingSourceNode = store.nodes.find(
      (currentNode) => currentNode.id === store.pendingConnection?.sourceNodeId,
    )
    const position = pendingSourceNode
      ? { x: pendingSourceNode.position.x + 300, y: pendingSourceNode.position.y }
      : { x: 100, y: 100 }
    store.addAndConnectNode(node.type, node.label, position)
    return
  }

  store.addAndConnectNode(node.type, node.label, { x: 200, y: 200 })
}

const onDragStart = (event: DragEvent, node: { type: string; label: string }) => {
  if (!event.dataTransfer) return

  event.dataTransfer.setData('application/vueflow', node.type)
  event.dataTransfer.setData('application/label', node.label)
  event.dataTransfer.effectAllowed = 'move'
}
</script>

<template>
  <div
    class="flex flex-col h-full bg-[#ffffff] border-l border-[#efefef] shadow-[-10px_0_30px_rgba(0,0,0,0.02)] overflow-hidden"
  >
    <div class="p-5 pb-3 bg-white sticky top-0 z-20">
      <div class="flex items-center justify-between mb-5">
        <div class="flex items-center gap-2">
          <div class="w-1.5 h-4 bg-slate-900 rounded-full"></div>
          <h2 class="text-[13px] font-bold text-[#1a1f36] tracking-tight">节点库</h2>
        </div>
        <button
          class="p-1.5 text-[#a3acb9] hover:text-[#ef4444] hover:bg-red-50 rounded-lg transition-all duration-200 cursor-pointer"
          @click="emit('close')"
        >
          <X size="18" stroke-width="2.5" />
        </button>
      </div>

      <div class="relative group">
        <div class="absolute left-3.5 top-1/2 -translate-y-1/2 z-10 pointer-events-none">
          <Search
            size="16"
            class="text-[#94a3b8] group-focus-within:text-slate-900 transition-colors duration-200"
            stroke-width="2.5"
          />
        </div>
        <input
          v-model="searchQuery"
          type="text"
          placeholder="搜索节点名称或用途..."
          class="w-full pl-10 pr-4 py-2.5 bg-[#f8fafc] border border-[#e2e8f0] focus:border-slate-400 focus:bg-white focus:ring-4 focus:ring-slate-900/5 rounded-xl text-[13px] text-[#1e293b] placeholder:text-[#94a3b8] outline-none transition-all duration-200"
        />
        <div
          v-if="searchQuery"
          class="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer text-[#94a3b8] hover:text-[#64748b]"
          @click="searchQuery = ''"
        >
          <X size="14" />
        </div>
      </div>
    </div>

    <div class="flex-1 overflow-y-auto custom-scrollbar px-4 space-y-8 pb-10 pt-2">
      <div
        v-if="store.pendingConnection"
        class="mt-2 p-4 bg-slate-900 text-white rounded-2xl shadow-lg shadow-slate-200 animate-in zoom-in-95 duration-300 relative overflow-hidden"
      >
        <div class="relative z-10 flex items-start gap-3">
          <div class="p-1.5 bg-white/10 rounded-lg text-white ring-1 ring-white/20">
            <Info size="14" />
          </div>
          <div class="flex-1">
            <p class="text-[12px] font-bold text-white leading-tight">选择连接目标</p>
            <p class="text-[10px] text-white/60 mt-1 leading-relaxed">
              已为你筛出当前可连接的下游节点
            </p>
          </div>
          <button
            class="text-white/40 hover:text-white transition-colors cursor-pointer"
            @click="store.pendingConnection = null"
          >
            <X size="14" />
          </button>
        </div>
        <div class="absolute -right-4 -bottom-4 opacity-5 rotate-12 text-white">
          <Box size="80" />
        </div>
      </div>

      <div v-for="category in filteredCategories" :key="category.name">
        <div class="px-2 mb-4 flex items-center gap-3">
          <component :is="category.icon" size="14" class="text-slate-400" />
          <span class="text-[11px] font-bold text-[#64748b] tracking-wider">
            {{ category.label }}
          </span>
          <div class="h-[1px] flex-1 bg-gradient-to-r from-[#f1f5f9] to-transparent"></div>
        </div>

        <div class="space-y-2">
          <div
            v-for="node in category.nodes"
            :key="node.type"
            draggable="true"
            class="n8n-node-item group"
            :class="[
              store.pendingConnection
                ? node.isClickable
                  ? 'is-connectable'
                  : 'is-disabled'
                : 'is-normal',
            ]"
            @dragstart="onDragStart($event, node)"
            @click="onNodeClick(node)"
          >
            <div
              class="n8n-node-item-inner flex items-center gap-4 p-3.5 rounded-2xl transition-all border border-transparent"
            >
              <div
                class="n8n-icon-box p-3 bg-white rounded-xl shadow-sm border border-[#f1f4f8] group-hover:scale-105 transition-transform duration-300"
              >
                <NodeIcon :type="node.type" :size="24" />
              </div>
              <div class="flex flex-col flex-1 min-w-0">
                <span
                  class="text-[13px] font-bold text-[#1a1f36] truncate tracking-tight group-hover:text-blue-600 transition-colors"
                >
                  {{ node.label }}
                </span>
                <span class="text-[10px] text-[#8792a2] font-medium truncate mt-0.5 opacity-80">
                  {{ node.desc }}
                </span>
              </div>
              <ChevronRight
                size="14"
                class="text-slate-300 opacity-0 group-hover:opacity-100 -translate-x-2 group-hover:translate-x-0 transition-all duration-300"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.n8n-node-item {
  cursor: grab;
}

.n8n-node-item:active {
  cursor: grabbing;
}

.n8n-node-item.is-normal:hover .n8n-node-item-inner {
  background: #f8fafc;
  border-color: #f1f5f9;
}

.n8n-node-item.is-connectable .n8n-node-item-inner {
  background: rgba(30, 41, 59, 0.02);
  border: 1.5px dashed rgba(30, 41, 59, 0.15);
  cursor: pointer;
}

.n8n-node-item.is-connectable:hover .n8n-node-item-inner {
  background: rgba(30, 41, 59, 0.05);
  border-color: rgba(30, 41, 59, 0.4);
  border-style: solid;
}

.n8n-node-item.is-disabled {
  opacity: 0.2;
  filter: grayscale(0.8);
  pointer-events: none;
}

.custom-scrollbar::-webkit-scrollbar {
  width: 4px;
}

.custom-scrollbar::-webkit-scrollbar-thumb {
  background: #e2e8f0;
  border-radius: 10px;
}

.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: #cbd5e1;
}
</style>
