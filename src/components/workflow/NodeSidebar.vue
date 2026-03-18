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

const totalVisibleNodeCount = computed(() =>
  filteredCategories.value.reduce((sum, category) => sum + category.nodes.length, 0),
)

const categoryTone = (category: string) => {
  if (category === 'trigger') {
    return {
      chip: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      dot: 'bg-emerald-500',
      card: 'from-emerald-50/80 to-white',
    }
  }
  if (category === 'terminal') {
    return {
      chip: 'bg-blue-50 text-blue-700 border-blue-200',
      dot: 'bg-blue-500',
      card: 'from-blue-50/80 to-white',
    }
  }
  return {
    chip: 'bg-slate-100 text-slate-700 border-slate-200',
    dot: 'bg-slate-500',
    card: 'from-slate-50/80 to-white',
  }
}

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
  <div class="node-sidebar-root flex flex-col h-full border-l border-slate-200 overflow-hidden">
    <div class="sidebar-header sticky top-0 z-20">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2.5">
          <div
            class="h-7 w-7 rounded-lg border border-slate-200 bg-white shadow-sm flex items-center justify-center"
          >
            <Box size="14" class="text-slate-700" />
          </div>
          <div>
            <h2 class="text-[14px] font-semibold text-slate-900 tracking-tight">节点库</h2>
            <p class="text-[11px] text-slate-500 mt-0.5">拖拽或点击快速构建分析流程</p>
          </div>
        </div>
        <button
          class="p-1.5 text-[#a3acb9] hover:text-[#ef4444] hover:bg-red-50 rounded-lg transition-all duration-200 cursor-pointer"
          @click="emit('close')"
        >
          <X size="18" stroke-width="2.5" />
        </button>
      </div>

      <div class="stats-strip">
        <div class="stat-item">
          <span class="stat-label">可用节点</span>
          <span class="stat-value">{{ totalVisibleNodeCount }}</span>
        </div>
        <div class="stat-divider"></div>
        <div class="stat-item">
          <span class="stat-label">分类</span>
          <span class="stat-value">{{ filteredCategories.length }}</span>
        </div>
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

    <div class="sidebar-list flex-1 overflow-y-auto custom-scrollbar px-3 pb-8 pt-3">
      <div
        v-if="store.pendingConnection"
        class="mt-1 mb-4 p-4 bg-slate-900 text-white rounded-2xl shadow-lg shadow-slate-200 animate-in zoom-in-95 duration-300 relative overflow-hidden border border-slate-700/70"
      >
        <div class="relative z-10 flex items-start gap-3">
          <div class="p-1.5 bg-white/10 rounded-lg text-white ring-1 ring-white/20">
            <Info size="14" />
          </div>
          <div class="flex-1">
            <p class="text-[12px] font-bold text-white leading-tight">选择连接目标</p>
            <p class="text-[10px] text-white/60 mt-1 leading-relaxed">
              已为你筛出当前可连接的下游节点。
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

      <div v-for="category in filteredCategories" :key="category.name" class="mb-4">
        <div
          class="category-shell rounded-2xl border border-slate-200 bg-white/95 shadow-[0_8px_24px_-18px_rgba(15,23,42,0.45)] overflow-hidden"
        >
          <div
            class="category-shell-header px-3 py-2.5 flex items-center justify-between border-b border-slate-100 bg-gradient-to-r"
            :class="categoryTone(category.category).card"
          >
            <div class="flex items-center gap-2.5 min-w-0">
              <div
                class="w-5 h-5 rounded-md border border-white/70 shadow-sm flex items-center justify-center bg-white/70"
              >
                <component :is="category.icon" size="12" class="text-slate-600" />
              </div>
              <span class="text-[11px] font-bold text-slate-700 tracking-wide truncate">
                {{ category.label }}
              </span>
            </div>
            <div
              class="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold"
              :class="categoryTone(category.category).chip"
            >
              <span class="w-1.5 h-1.5 rounded-full" :class="categoryTone(category.category).dot"></span>
              {{ category.nodes.length }}
            </div>
          </div>

          <div class="px-2.5 py-2.5 space-y-1.5">
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
                class="n8n-node-item-inner flex items-center gap-3 p-2.5 rounded-xl transition-all border border-transparent"
              >
                <div
                  class="n8n-icon-box p-2.5 bg-white rounded-lg shadow-sm border border-slate-200/80 group-hover:border-blue-200 transition-colors duration-300"
                >
                  <NodeIcon :type="node.type" :size="22" />
                </div>
                <div class="flex flex-col flex-1 min-w-0">
                  <span class="text-[12px] font-semibold text-slate-800 truncate tracking-tight">
                    {{ node.label }}
                  </span>
                  <span class="text-[10px] text-slate-500 font-medium truncate mt-0.5">
                    {{ node.desc }}
                  </span>
                </div>
                <ChevronRight
                  size="13"
                  class="text-slate-300 opacity-0 group-hover:opacity-100 -translate-x-1 group-hover:translate-x-0 transition-all duration-300"
                />
              </div>
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
  background: #f8fbff;
  border-color: #dbeafe;
  box-shadow: 0 6px 18px -16px rgba(37, 99, 235, 0.65);
}

.n8n-node-item.is-connectable .n8n-node-item-inner {
  background: rgba(37, 99, 235, 0.06);
  border: 1.5px dashed rgba(37, 99, 235, 0.35);
  cursor: pointer;
}

.n8n-node-item.is-connectable:hover .n8n-node-item-inner {
  background: rgba(37, 99, 235, 0.12);
  border-color: rgba(37, 99, 235, 0.55);
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

.node-sidebar-root {
  background:
    radial-gradient(120% 80% at 100% 0%, rgba(59, 130, 246, 0.06) 0%, rgba(248, 250, 252, 0) 45%),
    linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%);
}

.sidebar-header {
  padding: 1rem 1rem 0.75rem;
  border-bottom: 1px solid #e2e8f0;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.98) 0%, rgba(248, 250, 252, 0.96) 100%),
    radial-gradient(120% 80% at 10% 0%, rgba(148, 163, 184, 0.08) 0%, transparent 60%);
  backdrop-filter: blur(8px);
}

.stats-strip {
  margin-top: 0.75rem;
  margin-bottom: 0.75rem;
  height: 2rem;
  border: 1px solid #dbe4ef;
  border-radius: 0.7rem;
  background: linear-gradient(180deg, #ffffff 0%, #f8fbff 100%);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 0.625rem;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.9);
}

.stat-item {
  display: inline-flex;
  align-items: baseline;
  gap: 0.35rem;
}

.stat-label {
  font-size: 10px;
  font-weight: 600;
  color: #64748b;
  letter-spacing: 0.04em;
}

.stat-value {
  font-size: 12px;
  font-weight: 700;
  color: #0f172a;
}

.stat-divider {
  width: 1px;
  height: 12px;
  background: #d8e1ec;
}

@media (min-width: 1600px) {
  .sidebar-header {
    padding: 0.95rem 0.9rem 0.65rem;
  }

  .sidebar-list {
    padding: 0.6rem 0.65rem 1.1rem;
  }

  .n8n-node-item-inner {
    min-height: 64px;
  }
}
</style>
