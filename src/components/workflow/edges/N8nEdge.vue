<script setup lang="ts">
import { ref, computed } from 'vue'
import { EdgeLabelRenderer, getSmoothStepPath, type EdgeProps } from '@vue-flow/core'
import { Plus, Trash2 } from 'lucide-vue-next'
import { useWorkflowStore } from '@/stores/workflowStore'

const props = defineProps<EdgeProps>()
const store = useWorkflowStore()

const isHovered = ref(false)
const path = computed(() => getSmoothStepPath(props))

const onAddNode = () => {
  store.pendingConnection = {
    sourceNodeId: props.source,
    edgeId: props.id,
  }
  store.addLog('Select a node to insert between', 'info')
}

const onDeleteEdge = () => {
  store.edges = store.edges.filter((e) => e.id !== props.id)
  store.addLog('Edge deleted', 'info')
}

const sourceNode = computed(() => store.nodes.find((n) => n.id === props.source))
</script>

<template>
  <!-- 基础连线 (Crisp Modern Line) -->
  <path
    :id="id"
    :d="path[0]"
    fill="none"
    class="n8n-edge-path transition-all duration-300"
    :class="{
      'stroke-slate-400': sourceNode?.data?.status === 'idle' || !sourceNode?.data?.status,
      'stroke-indigo-500 is-running': sourceNode?.data?.status === 'running',
      'stroke-emerald-500': sourceNode?.data?.status === 'success',
      'stroke-rose-500': sourceNode?.data?.status === 'error',
      'is-hovered': isHovered,
    }"
    :stroke-width="isHovered ? 2.5 : 1.5"
    stroke-linecap="round"
  />

  <!-- 交互辅助线 (透明，增大点击区域) -->
  <path
    :d="path[0]"
    fill="none"
    stroke="transparent"
    stroke-width="20"
    class="cursor-pointer"
    @mouseenter="isHovered = true"
    @mouseleave="isHovered = false"
  />

  <EdgeLabelRenderer>
    <div
      :style="{
        position: 'absolute',
        transform: `translate(-50%, -50%) translate(${path[1]}px, ${path[2]}px)`,
        pointerEvents: 'all',
      }"
      class="edge-toolbar flex items-center justify-center p-2 rounded-full cursor-pointer z-50"
      @mouseenter="isHovered = true"
      @mouseleave="isHovered = false"
    >
      <div
        class="flex items-center gap-1 bg-white border border-slate-200 shadow-sm rounded-full p-0.5 transition-all duration-200"
        :class="isHovered ? 'opacity-100 scale-100' : 'opacity-0 scale-90 pointer-events-none'"
      >
        <button
          class="w-6 h-6 flex items-center justify-center rounded-full hover:bg-slate-50 text-slate-400 hover:text-indigo-600 transition-colors"
          title="在中间插入节点"
          @click.stop="onAddNode"
        >
          <Plus size="14" />
        </button>
        <div class="w-[1px] h-3 bg-slate-100"></div>
        <button
          class="w-6 h-6 flex items-center justify-center rounded-full hover:bg-slate-50 text-slate-400 hover:text-rose-600 transition-colors"
          title="删除连线"
          @click.stop="onDeleteEdge"
        >
          <Trash2 size="14" />
        </button>
      </div>

      <!-- Default small dot indicator when not hovered -->
      <div
        v-if="!isHovered"
        class="absolute w-1.5 h-1.5 bg-white border-[1.5px] border-slate-300 rounded-full transition-all duration-200"
        :class="{
          '!border-indigo-500 bg-indigo-50': sourceNode?.data?.status === 'running',
          '!border-emerald-500 bg-emerald-50': sourceNode?.data?.status === 'success',
          '!border-rose-500 bg-rose-50': sourceNode?.data?.status === 'error',
        }"
      ></div>
    </div>
  </EdgeLabelRenderer>
</template>

<style scoped>
.n8n-edge-path.is-running {
  stroke-dasharray: 8, 8;
  animation: n8n-flow 0.8s linear infinite;
}

.n8n-edge-path.is-hovered {
  stroke: #6366f1 !important; /* 悬浮时统一变为靛蓝色 */
  filter: drop-shadow(0 0 3px rgba(99, 102, 241, 0.3));
}

@keyframes n8n-flow {
  from {
    stroke-dashoffset: 16;
  }
  to {
    stroke-dashoffset: 0;
  }
}
</style>
