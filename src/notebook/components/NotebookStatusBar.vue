<script setup lang="ts">
/**
 * NotebookStatusBar.vue
 *
 * §3.4 底部状态条：内存 / cell 数 / 时长
 *
 * 视觉风格 ▸ 编辑稿底栏：mono 等宽字 + 印刷感分隔。
 */

import { computed } from 'vue'
import { Cpu, Layers, Timer } from 'lucide-vue-next'
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
  if (props.stats.recentlyRestarted) return 'var(--nb-amber)'
  if (props.stats.isRunning) return 'var(--nb-copper)'
  return 'var(--nb-sage)'
})

const dotLabel = computed(() => {
  if (props.stats.recentlyRestarted) return '已重启'
  if (props.stats.isRunning) return '运行中'
  return '空闲'
})

const memPercent = computed(() => {
  if (!props.memoryLimitMb) return 0
  return Math.min(100, (props.stats.memoryMb / props.memoryLimitMb) * 100)
})
</script>

<template>
  <div
    class="relative flex h-9 items-center gap-5 border-t px-5 text-[10.5px]"
    style="
      border-color: var(--nb-rule);
      background-color: var(--nb-paper-tint);
      color: var(--nb-ink-mute);
    "
  >
    <!-- 状态点 -->
    <div class="flex items-center gap-2">
      <span
        class="relative inline-flex h-1.5 w-1.5 rounded-full"
        :style="{ backgroundColor: dotColor }"
      >
        <span
          v-if="stats.isRunning"
          class="absolute inset-0 animate-ping rounded-full"
          :style="{ backgroundColor: dotColor, opacity: 0.6 }"
        />
      </span>
      <span
        class="nb-mono"
        style="letter-spacing: 0.12em; font-weight: 700; color: var(--nb-ink);"
      >
        Python
      </span>
      <span
        class="nb-mono"
        style="letter-spacing: 0.06em; color: var(--nb-ink-mute);"
      >
        {{ dotLabel }}
      </span>
    </div>

    <span class="h-3 w-px" style="background-color: var(--nb-rule-strong);" />

    <!-- 内存（带细进度条） -->
    <div class="flex items-center gap-2">
      <Cpu :size="11" :stroke-width="1.6" style="color: var(--nb-ink-faint);" />
      <span class="nb-mono" style="letter-spacing: 0.04em;">mem</span>
      <span
        class="nb-mono tabular-nums"
        style="color: var(--nb-ink); font-weight: 600;"
      >
        {{ memText }}
      </span>
      <span
        v-if="memoryLimitMb"
        class="relative h-1 w-16 overflow-hidden rounded-full"
        style="background-color: var(--nb-overlay-strong);"
      >
        <span
          class="absolute inset-y-0 left-0 rounded-full transition-[width] duration-500"
          :style="{
            width: memPercent + '%',
            backgroundColor:
              memPercent > 80 ? 'var(--nb-clay)' : memPercent > 60 ? 'var(--nb-amber)' : 'var(--nb-copper)',
          }"
        />
      </span>
    </div>

    <div class="flex items-center gap-2">
      <Layers :size="11" :stroke-width="1.6" style="color: var(--nb-ink-faint);" />
      <span class="nb-mono" style="letter-spacing: 0.04em;">cells</span>
      <span
        class="nb-mono tabular-nums"
        style="color: var(--nb-ink); font-weight: 600;"
      >
        {{ stats.cellCount }}
      </span>
    </div>

    <div class="flex items-center gap-2">
      <Timer :size="11" :stroke-width="1.6" style="color: var(--nb-ink-faint);" />
      <span class="nb-mono" style="letter-spacing: 0.04em;">elapsed</span>
      <span
        class="nb-mono tabular-nums"
        style="color: var(--nb-ink); font-weight: 600;"
      >
        {{ formatDuration(stats.agentSeconds) }}
      </span>
    </div>

    <div class="flex-1" />
  </div>
</template>
