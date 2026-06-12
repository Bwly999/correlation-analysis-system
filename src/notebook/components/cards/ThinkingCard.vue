<script setup lang="ts">
/**
 * ThinkingCard.vue
 *
 * §5.1.6 思考块：默认折叠，灰底，独立从 PiAgentThinkingBlock 抽出（iframe 内最小依赖）。
 */

import { ref, computed } from 'vue'
import { Brain, ChevronRight } from 'lucide-vue-next'
import type { ThinkingBlock } from '../../types/messageStream'

const props = defineProps<{ block: ThinkingBlock }>()

const open = ref(false)

const durationLabel = computed(() => {
  if (props.block.durationMs == null) return ''
  const s = props.block.durationMs / 1000
  return s < 10 ? `${s.toFixed(1)}s` : `${Math.round(s)}s`
})
</script>

<template>
  <div
    class="rounded-lg border border-slate-200/80 bg-slate-50/80 transition hover:border-slate-300/80"
  >
    <button
      class="flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] text-slate-500"
      @click="open = !open"
    >
      <Brain :size="13" class="text-slate-400" />
      <span class="font-medium text-slate-600">思考</span>
      <span v-if="durationLabel" class="font-mono tabular-nums text-slate-400">· {{ durationLabel }}</span>
      <span class="flex-1" />
      <span class="text-[11px] text-slate-400">{{ open ? '收起' : '展开' }}</span>
      <ChevronRight :size="12" class="text-slate-400 transition-transform" :class="open ? 'rotate-90' : ''" />
    </button>
    <div v-if="open" class="border-t border-slate-200/80 px-3 py-2.5">
      <p class="whitespace-pre-wrap text-[12.5px] leading-6 text-slate-600">{{ block.text }}</p>
    </div>
  </div>
</template>
