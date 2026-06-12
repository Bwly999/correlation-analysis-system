<script setup lang="ts">
/**
 * 工具卡片状态徽章：running / success / failed
 * 视觉：胶囊状，左圆点 + 文案 + 耗时。
 */
import { computed } from 'vue'
import { Loader2, Check, X } from 'lucide-vue-next'
import type { ToolStatus } from '../../types/messageStream'

const props = defineProps<{
  status: ToolStatus
  durationMs?: number
}>()

const klass = computed(() => {
  switch (props.status) {
    case 'running':
      return 'border-amber-200/80 bg-amber-50 text-amber-700'
    case 'success':
      return 'border-emerald-200/80 bg-emerald-50 text-emerald-700'
    case 'failed':
      return 'border-rose-200/80 bg-rose-50 text-rose-700'
  }
  return ''
})

const formatDuration = (ms?: number): string => {
  if (ms == null) return ''
  if (ms < 1000) return `${ms} ms`
  return `${(ms / 1000).toFixed(2)}s`
}
</script>

<template>
  <span
    class="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-wide"
    :class="klass"
  >
    <Loader2 v-if="status === 'running'" :size="10" class="animate-spin" />
    <Check v-else-if="status === 'success'" :size="10" />
    <X v-else :size="10" />
    <span>
      {{ status === 'running' ? '执行中' : status === 'success' ? '完成' : '失败' }}
    </span>
    <span v-if="durationMs != null" class="font-mono tabular-nums opacity-70">
      · {{ formatDuration(durationMs) }}
    </span>
  </span>
</template>
