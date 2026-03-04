<script setup lang="ts">
import { computed } from 'vue'
import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath, type EdgeProps } from '@vue-flow/core'
import { Plus, Trash2 } from 'lucide-vue-next'
import { useWorkflowStore } from '@/stores/workflowStore'

const props = defineProps<EdgeProps>()
const store = useWorkflowStore()

const path = computed(() => getSmoothStepPath(props))

const onAddNode = () => {
  store.pendingConnection = { 
    sourceNodeId: props.source,
    edgeId: props.id 
  }
  store.addLog('Select a node to insert between', 'info')
}

const onDeleteEdge = () => {
  store.edges = store.edges.filter(e => e.id !== props.id)
  store.addLog('Edge deleted', 'info')
}
</script>

<template>
  <!-- Render the actual edge line -->
  <BaseEdge :id="id" :style="style" :path="path[0]" :marker-end="markerEnd" />

  <!-- Render interactive buttons in the middle -->
  <EdgeLabelRenderer>
    <div
      :style="{
        position: 'absolute',
        transform: `translate(-50%, -50%) translate(${path[1]}px, ${path[2]}px)`,
        pointerEvents: 'all',
      }"
      class="edge-toolbar group"
    >
      <div class="flex items-center gap-1 bg-white border border-slate-200 shadow-sm rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <button 
          @click.stop="onAddNode"
          class="w-6 h-6 flex items-center justify-center rounded-full hover:bg-slate-100 text-slate-500 hover:text-indigo-600 transition-colors"
          title="Add node here"
        >
          <Plus size="14" />
        </button>
        <div class="w-[1px] h-3 bg-slate-200"></div>
        <button 
          @click.stop="onDeleteEdge"
          class="w-6 h-6 flex items-center justify-center rounded-full hover:bg-slate-100 text-slate-500 hover:text-rose-600 transition-colors"
          title="Delete connection"
        >
          <Trash2 size="14" />
        </button>
      </div>
    </div>
  </EdgeLabelRenderer>
</template>

<style scoped>
.edge-toolbar {
  z-index: 1000;
}
</style>
