<script setup lang="ts">
import { ref, computed, nextTick } from 'vue'
import { Handle, Position, type NodeProps } from '@vue-flow/core'
import { NodeToolbar } from '@vue-flow/node-toolbar'
import {
  Play,
  Settings,
  CheckCircle,
  AlertTriangle,
  Loader2,
  Plus,
  Trash2,
  Pencil,
  Pin,
  PinOff,
} from 'lucide-vue-next'
import { useWorkflowStore } from '@/stores/workflowStore'
import NodeIcon from './NodeIcon.vue'

const props = defineProps<NodeProps>()
const store = useWorkflowStore()

// 交互状态
const isHovered = ref(false)
const isEditingName = ref(false)
const editedLabel = ref(props.data.label)
const nameInputRef = ref<HTMLInputElement | null>(null)
let hoverTimeout: any = null

// 从 Store 获取最新的 Label 确保同步
const currentLabel = computed(() => {
  const nodeInStore = store.nodes.find((n) => n.id === props.id)
  return nodeInStore?.data.label || props.data.label
})

const isPinned = computed(() => {
  const nodeInStore = store.nodes.find((n) => n.id === props.id)
  return nodeInStore?.data.isPinned || false
})

const onMouseEnter = () => {
  if (hoverTimeout) clearTimeout(hoverTimeout)
  isHovered.value = true
}

const onMouseLeave = () => {
  hoverTimeout = setTimeout(() => {
    isHovered.value = false
  }, 150)
}

const togglePin = () => {
  const nodeInStore = store.nodes.find((n) => n.id === props.id)
  if (nodeInStore) {
    nodeInStore.data.isPinned = !nodeInStore.data.isPinned
    store.addLog(
      `节点 ${currentLabel.value} 数据已${nodeInStore.data.isPinned ? '冻结 (Pin)' : '解除冻结'}`,
      nodeInStore.data.isPinned ? 'warn' : 'info',
      props.id,
    )
  }
}

const startEditing = async () => {
  isEditingName.value = true
  editedLabel.value = currentLabel.value
  await nextTick()
  nameInputRef.value?.focus()
  nameInputRef.value?.select()
}

const saveName = () => {
  if (!isEditingName.value) return
  isEditingName.value = false
  const newName = editedLabel.value.trim()
  if (newName) {
    const nodeInStore = store.nodes.find((n) => n.id === props.id)
    if (nodeInStore) {
      nodeInStore.data.label = newName
      store.addLog(`节点重命名为: ${newName}`, 'info', props.id)
    }
  }
}

const runNode = (force: boolean) => {
  store.executeNode(props.id, force)
}

const openConfig = () => {
  store.activeConfigNodeId = props.id
  store.addLog(`打开配置: ${currentLabel.value}`, 'info', props.id)
}

const deleteNode = () => {
  store.nodes = store.nodes.filter((n) => n.id !== props.id)
  store.edges = store.edges.filter((e) => e.source !== props.id && e.target !== props.id)
  store.addLog(`已删除节点: ${currentLabel.value}`, 'warn')
}

const statusColors = computed(() => {
  switch (props.data.status) {
    case 'running':
      return 'border-indigo-500 ring-2 ring-indigo-500/20 shadow-sm'
    case 'success':
      return 'border-emerald-500 ring-1 ring-emerald-500/20 shadow-sm'
    case 'error':
      return 'border-rose-500 ring-1 ring-rose-500/20 shadow-sm'
    default:
      return 'border-slate-200 hover:border-slate-300 hover:shadow-md'
  }
})

const isTrigger = computed(() => {
  return props.data.category === 'trigger'
})

const isTerminal = computed(() => {
  return props.data.category === 'terminal'
})

const nodeShape = computed(() => {
  return isTrigger.value ? 'rounded-[20px] rounded-r-xl' : 'rounded-2xl'
})
</script>

<template>
  <div class="relative group" @mouseenter="onMouseEnter" @mouseleave="onMouseLeave">
    <!-- 节点主体 (Clean Modern SaaS Style) -->
    <div
      class="n8n-node-body relative flex items-center justify-center bg-white border transition-all duration-300 cursor-pointer z-10 w-[110px] h-[110px]"
      :class="[statusColors, nodeShape]"
      @dblclick="openConfig"
      @click="openConfig"
    >
      <NodeIcon
        :type="props.data.type"
        :size="64"
        class="bg-transparent text-slate-700 group-hover:scale-105 transition-transform duration-300"
      />

      <!-- Pin 状态图标 -->
      <div
        v-if="isPinned"
        class="absolute -top-2 -right-2 bg-amber-100 text-amber-600 rounded-full p-1.5 border border-amber-200 shadow-sm z-20"
      >
        <Pin size="12" fill="currentColor" />
      </div>

      <!-- 状态指示器 -->
      <div
        v-if="props.data.status !== 'idle'"
        class="absolute -bottom-2 -right-2 bg-white rounded-full p-1 border border-slate-100 shadow-sm z-20"
      >
        <Loader2
          v-if="props.data.status === 'running'"
          v-tooltip.bottom="'正在执行...'"
          size="18"
          class="text-indigo-600 animate-spin"
        />
        <CheckCircle
          v-else-if="props.data.status === 'success'"
          v-tooltip.bottom="'执行成功'"
          size="18"
          class="text-emerald-500"
        />
        <AlertTriangle
          v-else-if="props.data.status === 'error'"
          v-tooltip.bottom="props.data.error || '执行失败'"
          size="18"
          class="text-rose-500"
        />
      </div>
    </div>

    <!-- 自定义命名标题 -->
    <div
      class="absolute top-[100%] left-1/2 -translate-x-1/2 mt-3 w-[200px] flex flex-col items-center z-20 text-center font-sans"
      @click.stop
    >
      <div
        v-if="!isEditingName"
        class="text-[13px] font-bold text-slate-800 leading-tight truncate w-full cursor-text hover:text-indigo-600 transition-colors"
        title="双击重命名"
        @dblclick.stop="startEditing"
      >
        {{ currentLabel }}
      </div>
      <input
        v-else
        ref="nameInputRef"
        v-model="editedLabel"
        class="text-[13px] font-bold text-slate-800 text-center bg-white border border-indigo-400 rounded px-2 py-0.5 outline-none shadow-sm w-full focus:ring-2 focus:ring-indigo-100"
        @blur="saveName"
        @keyup.enter="saveName"
      />
      <div
        class="text-[10px] text-slate-400 font-medium uppercase tracking-wider truncate w-full mt-0.5"
      >
        {{ props.data.type.replace('-', ' ') }}
      </div>
    </div>

    <!-- 连接点 -->
    <Handle
      v-if="!isTrigger"
      type="target"
      :position="Position.Left"
      class="n8n-handle !-left-1.5"
      style="z-index: 50"
    />
    <Handle
      v-if="!isTerminal"
      type="source"
      :position="Position.Right"
      class="n8n-handle !-right-1.5"
      style="z-index: 50"
    />

    <!-- 快速添加按钮 -->
    <div
      v-if="!isTerminal"
      class="absolute left-full top-1/2 -translate-y-1/2 flex items-center transition-all z-0 pointer-events-none duration-300"
      :class="isHovered ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-2'"
      style="padding-left: 0px"
    >
      <div class="w-6 h-[1.5px] bg-slate-200"></div>
      <button
        class="w-6 h-6 bg-white border border-slate-200 rounded-full flex items-center justify-center text-slate-400 hover:text-indigo-600 hover:border-indigo-400 hover:bg-indigo-50 shadow-sm transition-all -ml-0.5 pointer-events-auto active:scale-90 cursor-pointer"
        :class="{
          'ring-2 ring-indigo-100 border-indigo-500 text-indigo-600 opacity-100 bg-indigo-50':
            store.pendingConnection?.sourceNodeId === props.id,
        }"
        @click.stop="store.pendingConnection = { sourceNodeId: props.id }"
      >
        <Plus size="14" stroke-width="2.5" />
      </button>
    </div>

    <!-- 悬浮工具栏 -->
    <NodeToolbar
      :is-visible="isHovered"
      class="flex gap-1 bg-white p-1 rounded-xl border border-slate-200 shadow-lg shadow-slate-200/50 z-30"
      :position="Position.Top"
      :offset="16"
      @mouseenter="onMouseEnter"
    >
      <button
        v-tooltip.top="'调试运行'"
        class="p-1.5 hover:bg-slate-50 rounded-lg text-indigo-600 transition-colors cursor-pointer"
        @click.stop="runNode(true)"
      >
        <Play size="14" fill="currentColor" />
      </button>
      <button
        v-tooltip.top="isPinned ? '取消冻结数据' : '冻结当前数据 (Pin)'"
        class="p-1.5 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer"
        :class="isPinned ? 'text-amber-500' : 'text-slate-400'"
        @click.stop="togglePin"
      >
        <Pin v-if="!isPinned" size="14" />
        <PinOff v-else size="14" />
      </button>
      <div class="w-[1px] h-4 bg-slate-200 self-center mx-1"></div>
      <button
        v-tooltip.top="'重命名'"
        class="p-1.5 hover:bg-slate-50 rounded-lg text-slate-500 transition-colors cursor-pointer"
        @click.stop="startEditing"
      >
        <Pencil size="14" />
      </button>
      <button
        v-tooltip.top="'节点设置'"
        class="p-1.5 hover:bg-slate-50 rounded-lg text-slate-500 transition-colors cursor-pointer"
        @click.stop="openConfig"
      >
        <Settings size="14" />
      </button>
      <button
        v-tooltip.top="'删除节点'"
        class="p-1.5 hover:bg-rose-50 rounded-lg text-rose-500 transition-colors cursor-pointer"
        @click.stop="deleteNode"
      >
        <Trash2 size="14" />
      </button>
    </NodeToolbar>
  </div>
</template>

<style>
/* 核心连接点样式 - 确保物理位置绝对静止 */
.n8n-handle {
  width: 10px !important;
  height: 10px !important;
  background-color: #ffffff !important;
  border: 1.5px solid #94a3b8 !important;
  /* 移除 transform，改用内置定位或通过 margin 微调，防止 hover 时覆盖 Vue Flow 的内置位移 */
  transition:
    border-color 0.2s ease,
    box-shadow 0.2s ease,
    background-color 0.2s ease;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
}

/* 鼠标悬浮反馈：增加边框色和外发光，但不改变大小或位移 */
.n8n-handle:hover {
  border-color: #6366f1 !important;
  background-color: #f5f7ff !important;
  box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.15); /* 使用外部阴影模拟“变大”感，不触发布局位移 */
  cursor: crosshair;
}

/* 处于连接就绪状态时的样式 */
.n8n-handle.vue-flow__handle-connecting {
  border-color: #6366f1 !important;
  background-color: #6366f1 !important;
  animation: n8n-pulse-handle 1.5s infinite;
}

@keyframes n8n-pulse-handle {
  0% {
    box-shadow: 0 0 0 0 rgba(99, 102, 241, 0.4);
  }
  70% {
    box-shadow: 0 0 0 6px rgba(99, 102, 241, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(99, 102, 241, 0);
  }
}
</style>
