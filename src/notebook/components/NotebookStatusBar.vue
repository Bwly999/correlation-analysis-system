<script setup lang="ts">
/**
 * NotebookStatusBar.vue
 *
 * §3.4 底部状态条：内存 / cell 数 / 时长 / 停止按钮
 *
 * 视觉语言：终端化的等宽数字 + 状态点；克制不抢戏。
 */

import { computed } from 'vue'
import { Square, Cpu, Layers, Timer } from 'lucide-vue-next'
import type { RuntimeStats } from '../types/messageStream'

const props = defineProps<{
  stats: RuntimeStats
  /** Worker 内存上限（MB），用于显示分母；可为空 */
  memoryLimitMb?: number
}>()

const emit = defineEmits<{
  stop: []
}>()

const formatDuration = (totalSec: number): string => {
  const s = Math.max(0, Math.floor(totalSec))
  const m = Math.floor(s / 60)
  const r = s % 60
  if (m < 60) return `${m}m ${String(r).padStart(2, '0')}s`
  const h = Math.floor(m / 60)
  const mm = m % 60
  return `${h}h ${String(mm).padStart(2, '0')}m`
}

const memText = computed(() => {
  const used = Math.round(props.stats.memoryMb)
  if (props.memoryLimitMb) {
    return `${used} / ${props.memoryLimitMb} MB`
  }
  return `${used} MB`
})

const dotColor = computed(() => {
  if (props.stats.recentlyRestarted) return 'bg-amber-400'
  if (props.stats.isRunning) return 'bg-blue-400 animate-pulse'
  return 'bg-emerald-400'
})

const dotLabel = computed(() => {
  if (props.stats.recentlyRestarted) return '已重启'
  if (props.stats.isRunning) return '执行中'
  return '空闲'
})
</script>

<template>
  <div
    class="flex h-9 items-center gap-4 border-t border-slate-200 bg-slate-50/80 px-4 text-[11px] font-medium text-slate-600 backdrop-blur"
  >
    <div class="flex items-center gap-1.5">
      <span
        class="inline-block h-1.5 w-1.5 rounded-full transition-colors"
        :class="dotColor"
      />
      <span class="font-mono uppercase tracking-[0.14em] text-[10px] text-slate-500">
        Python · {{ dotLabel }}
      </span>
    </div>

    <span class="h-3 w-px bg-slate-300" />

    <div class="flex items-center gap-1.5">
      <Cpu :size="12" class="text-slate-400" />
      <span class="text-slate-500">内存</span>
      <span class="font-mono tabular-nums text-slate-800">{{ memText }}</span>
    </div>

    <div class="flex items-center gap-1.5">
      <Layers :size="12" class="text-slate-400" />
      <span class="text-slate-500">cells</span>
      <span class="font-mono tabular-nums text-slate-800">{{ stats.cellCount }}</span>
    </div>

    <div class="flex items-center gap-1.5">
      <Timer :size="12" class="text-slate-400" />
      <span class="text-slate-500">时长</span>
      <span class="font-mono tabular-nums text-slate-800">{{ formatDuration(stats.agentSeconds) }}</span>
    </div>

    <div class="flex-1" />

    <button
      class="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11px] font-semibold transition disabled:cursor-not-allowed"
      :class="
        stats.isRunning
          ? 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100'
          : 'border-slate-200 bg-white text-slate-400 disabled:bg-slate-50'
      "
      :disabled="!stats.isRunning"
      :aria-label="stats.isRunning ? '停止当前执行' : '当前空闲，无需停止'"
      @click="emit('stop')"
    >
      <Square :size="11" :fill="stats.isRunning ? 'currentColor' : 'none'" />
      停止
    </button>
  </div>
</template>
