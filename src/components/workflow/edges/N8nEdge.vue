<script setup lang="ts">
import { ref, computed } from 'vue'
import { EdgeLabelRenderer, getBezierPath, type EdgeProps } from '@vue-flow/core'
import { Plus, Trash2 } from 'lucide-vue-next'
import { useWorkflowStore } from '@/stores/workflowStore'

const props = defineProps<EdgeProps>()
const store = useWorkflowStore()

const isHovered = ref(false)
const path = computed(() => getBezierPath(props))
const sourceNodeStatus = computed(() => props.sourceNode?.data?.status)

const onAddNode = () => {
  store.setPendingConnection({
    sourceNodeId: props.source,
    edgeId: props.id,
  })
  store.addLog('请选择要插入到中间的节点', 'info')
}

const onDeleteEdge = () => {
  store.removeEdge(props.id)
  store.addLog('连线已删除', 'info')
}

</script>

<template>
  <!-- 基础连线 (Crisp Modern Line) -->
  <path
    :id="id"
    :d="path[0]"
    fill="none"
    class="n8n-edge-path transition-all duration-300"
    :class="{
      'stroke-slate-400': sourceNodeStatus === 'idle' || !sourceNodeStatus,
      'stroke-blue-600 is-running': sourceNodeStatus === 'running',
      'stroke-emerald-500': sourceNodeStatus === 'success',
      'stroke-rose-500': sourceNodeStatus === 'error',
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
    :stroke-width="20"
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
          class="w-6 h-6 flex items-center justify-center rounded-full hover:bg-slate-50 text-slate-400 hover:text-blue-600 transition-colors"
          title="在中间插入节点"
          @click.stop="onAddNode"
        >
          <Plus :size="14" />
        </button>
        <div class="w-[1px] h-3 bg-slate-100"></div>
        <button
          class="w-6 h-6 flex items-center justify-center rounded-full hover:bg-slate-50 text-slate-400 hover:text-rose-600 transition-colors"
          title="删除连线"
          @click.stop="onDeleteEdge"
        >
          <Trash2 :size="14" />
        </button>
      </div>

      <!-- Default small dot indicator when not hovered -->
      <div
        v-if="!isHovered"
        class="absolute w-1.5 h-1.5 bg-white border-[1.5px] border-slate-300 rounded-full transition-all duration-200"
        :class="{
          '!border-blue-600 bg-blue-50': sourceNodeStatus === 'running',
          '!border-emerald-500 bg-emerald-50': sourceNodeStatus === 'success',
          '!border-rose-500 bg-rose-50': sourceNodeStatus === 'error',
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
  stroke: #2563eb !important;
  filter: drop-shadow(0 0 3px rgba(37, 99, 235, 0.28));
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
