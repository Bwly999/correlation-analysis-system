<script setup lang="ts">
import { ref, computed } from 'vue'
import { Handle, Position, type NodeProps } from '@vue-flow/core'
import { NodeToolbar } from '@vue-flow/node-toolbar'
import { Play, Bug, Settings, CheckCircle, AlertTriangle, Loader2, Plus, Trash2 } from 'lucide-vue-next'
import { useWorkflowStore } from '@/stores/workflowStore'
import NodeIcon from './NodeIcon.vue'

const props = defineProps<NodeProps>()
const store = useWorkflowStore()
const isHovered = ref(false)
let hoverTimeout: any = null

const onMouseEnter = () => {
  if (hoverTimeout) clearTimeout(hoverTimeout)
  isHovered.value = true
}

const onMouseLeave = () => {
  hoverTimeout = setTimeout(() => {
    isHovered.value = false
  }, 150) // 150ms delay to allow moving to toolbar
}

const runNode = (force: boolean) => {
  store.executeNode(props.id, force)
}

const openConfig = () => {
  store.activeConfigNodeId = props.id
  store.addLog(`打开配置: ${props.data.label}`, 'info', props.id)
}

const deleteNode = () => {
  store.nodes = store.nodes.filter(n => n.id !== props.id)
  store.edges = store.edges.filter(e => e.source !== props.id && e.target !== props.id)
  store.addLog(`已删除节点: ${props.data.label}`, 'warn')
}

const statusColors = computed(() => {
  switch (props.data.status) {
    case 'running': return 'border-transparent shadow-indigo-100/50'
    case 'success': return 'border-emerald-500 shadow-emerald-100/50'
    case 'error': return 'border-rose-500 shadow-rose-100/50'
    default: return 'border-slate-300 hover:border-slate-400'
  }
})

const isTrigger = computed(() => {
  return props.data.type === 'file-import' || props.data.type === 'neighbor-system'
})

const nodeShape = computed(() => {
  return isTrigger.value ? 'rounded-[24px] rounded-r-xl' : 'rounded-xl'
})
</script>

<template>
  <div 
    class="relative group" 
    @dblclick="openConfig"
    @mouseenter="onMouseEnter"
    @mouseleave="onMouseLeave"
  >
    <!-- 节点主体 (n8n 风格的方块/胶囊) -->
    <div 
      class="n8n-node-body relative flex items-center justify-center bg-white border-[1.5px] transition-all cursor-pointer shadow-sm z-10 w-[120px] h-[120px]"
      :class="[statusColors, nodeShape]"
      @click="openConfig"
    >
      <!-- 运行动画边框 (n8n 风格：流动虚线/光边) -->
      <div v-if="props.data.status === 'running'" class="absolute inset-[-2px] z-[-1] rounded-[inherit] p-[2px] overflow-hidden">
         <div class="absolute inset-[-100%] n8n-running-bg"></div>
         <div class="absolute inset-[2px] bg-white rounded-[inherit]"></div>
      </div>
      
      <!-- 中心图标 -->
      <NodeIcon :type="props.data.type" :size="80" class="bg-transparent" />

      <!-- 状态小图标 (右下角) -->
      <div v-if="props.data.status !== 'idle'" class="absolute -bottom-2 -right-2 bg-white rounded-full p-1 shadow-md z-20">
        <Loader2 v-if="props.data.status === 'running'" size="22" class="text-indigo-600 animate-spin" />
        <CheckCircle v-else-if="props.data.status === 'success'" size="22" class="text-emerald-500" />
        <AlertTriangle v-else-if="props.data.status === 'error'" size="22" class="text-rose-500" />
      </div>
    </div>

    <!-- 浮动标题 (绝对定位在下方) -->
    <div class="absolute top-[100%] left-1/2 -translate-x-1/2 mt-4 w-[240px] flex flex-col items-center pointer-events-none z-20 text-center font-sans">
      <div class="text-[15px] font-bold text-slate-800 leading-tight drop-shadow-sm truncate w-full">
        {{ props.data.label }}
      </div>
      <div class="text-[12px] text-slate-400 font-bold tracking-wider uppercase truncate w-full mt-1">
        {{ props.data.type.replace('-', ' ') }}
      </div>
    </div>

    <!-- 输入输出点 (定制化) -->
    <Handle 
      v-if="!isTrigger"
      type="target" 
      :position="Position.Left" 
      class="n8n-handle !-left-2" 
      style="z-index: 50;"
    />
    
    <Handle 
      v-if="props.data.type !== 'algorithm'"
      type="source" 
      :position="Position.Right" 
      class="n8n-handle !-right-2" 
      style="z-index: 50;"
    />

    <!-- 快速添加按钮 -->
    <div 
      v-if="props.data.type !== 'algorithm'"
      class="absolute left-full top-1/2 -translate-y-1/2 flex items-center transition-all z-0 pointer-events-none"
      :class="isHovered ? 'opacity-100' : 'opacity-0'"
      style="padding-left: 0px;"
    >
      <div class="w-8 h-[1.5px] bg-slate-200"></div>
      <button 
        @click.stop="store.pendingConnection = { sourceNodeId: props.id }"
        class="w-6 h-6 bg-white border border-slate-200 rounded-full flex items-center justify-center text-slate-400 hover:text-indigo-600 hover:border-indigo-400 shadow-sm transition-all -ml-0.5 pointer-events-auto active:scale-95"
        :class="{'ring-2 ring-indigo-500 border-indigo-500 text-indigo-600 opacity-100': store.pendingConnection?.sourceNodeId === props.id}"
      >
        <Plus size="14" stroke-width="3" />
      </button>
    </div>

    <!-- 悬浮工具栏 -->
    <NodeToolbar 
      :is-visible="isHovered"
      class="flex gap-0.5 bg-white p-1 rounded-lg border shadow-xl z-30"
      :position="Position.Top"
      :offset="12"
      @mouseenter="onMouseEnter"
    >
      <button v-tooltip.top="'运行此节点及后续'" class="p-1.5 hover:bg-slate-100 rounded text-indigo-600" @click.stop="runNode(true)">
        <Play size="14" fill="currentColor" />
      </button>
      <button v-tooltip.top="'调试 (使用上游缓存)'" class="p-1.5 hover:bg-slate-100 rounded text-slate-600" @click.stop="runNode(false)">
        <Bug size="14" />
      </button>
      <div class="w-[1px] h-4 bg-slate-200 self-center mx-0.5"></div>
      <button v-tooltip.top="'节点设置'" class="p-1.5 hover:bg-slate-100 rounded text-slate-600" @click.stop="openConfig">
        <Settings size="14" />
      </button>
      <button v-tooltip.top="'删除节点'" class="p-1.5 hover:bg-slate-100 rounded text-rose-500" @click.stop="deleteNode">
        <Trash2 size="14" />
      </button>
    </NodeToolbar>
  </div>
</template>

<style>
.n8n-handle {
  width: 14px !important;
  height: 14px !important;
  background-color: #cbd5e1 !important;
  border: 3px solid #ffffff !important;
  transition: all 0.2s ease;
}

.n8n-handle:hover {
  background-color: #6366f1 !important;
}

.n8n-running-bg {
  background: conic-gradient(
    from var(--angle),
    transparent 60%,
    #6366f1 80%,
    #8b5cf6 100%
  );
  animation: rotate 2s linear infinite;
}

@property --angle {
  syntax: '<angle>';
  initial-value: 0deg;
  inherits: false;
}

@keyframes rotate {
  to {
    --angle: 360deg;
  }
}
</style>
