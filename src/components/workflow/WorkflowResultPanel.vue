<script setup lang="ts">
import { computed, defineAsyncComponent } from 'vue'
import { Maximize2, GripVertical } from 'lucide-vue-next'
import { workflowViewerRegistry } from './viewers/registry'
import { getResultViewerKey, normalizeWorkflowResult } from './resultView'
import type { ResultDashboardNode } from './resultDashboard'

const JsonViewer = defineAsyncComponent(() => import('./viewers/JsonViewer.vue'))

const props = defineProps<{
  node: ResultDashboardNode
  showDragHandle?: boolean
}>()

const emit = defineEmits<{
  openDetail: [node: ResultDashboardNode]
}>()

const normalizedResult = computed(() => normalizeWorkflowResult(props.node.output))
const viewerKey = computed(() => getResultViewerKey(props.node.output))
const activeViewer = computed(() => {
  const key = viewerKey.value as keyof typeof workflowViewerRegistry | null
  return key ? workflowViewerRegistry[key] : JsonViewer
})
</script>

<template>
  <article
    class="h-full min-h-0 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col"
  >
    <header class="px-4 py-3 border-b border-slate-100 bg-slate-50/80 flex items-start justify-between gap-3">
      <div class="min-w-0">
        <div class="flex items-center gap-2 min-w-0">
          <GripVertical v-if="showDragHandle" :size="14" class="text-slate-400 shrink-0 cursor-move" />
          <h3 class="text-sm font-black text-slate-800 truncate">{{ node.label }}</h3>
          <span
            class="px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0"
            :class="
              node.status === 'error'
                ? 'bg-rose-100 text-rose-600'
                : 'bg-blue-50 text-blue-600'
            "
          >
            {{ node.resultKindLabel }}
          </span>
        </div>
        <p class="mt-1 text-xs text-slate-500 line-clamp-2">{{ node.summary || '暂无摘要' }}</p>
      </div>

      <div class="flex items-center gap-2 shrink-0">
        <button
          type="button"
          class="w-8 h-8 rounded-xl border border-slate-200 bg-white text-slate-500 hover:text-slate-900 hover:border-slate-300 transition-colors cursor-pointer"
          @click="emit('openDetail', node)"
        >
          <Maximize2 :size="14" class="mx-auto" />
        </button>
      </div>
    </header>

    <div v-if="node.status === 'error' && !node.hasOutput" class="flex-1 min-h-0 flex items-center justify-center p-6 bg-rose-50/60">
      <div class="text-center">
        <p class="text-sm font-bold text-rose-600">该节点本次运行失败</p>
        <p class="mt-2 text-xs text-rose-500">{{ node.error || '请检查节点配置与上游输入' }}</p>
      </div>
    </div>

    <div v-else-if="!node.hasOutput" class="flex-1 min-h-0 flex items-center justify-center p-6 bg-slate-50">
      <div class="text-center">
        <p class="text-sm font-bold text-slate-500">该节点暂无可展示结果</p>
        <p class="mt-2 text-xs text-slate-400">可以在左侧改选其他有结果节点继续分析</p>
      </div>
    </div>

    <div v-else class="flex-1 min-h-0 bg-slate-50">
      <component :is="activeViewer" :data="normalizedResult ?? node.output" />
    </div>
  </article>
</template>
