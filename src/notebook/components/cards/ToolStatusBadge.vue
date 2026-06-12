<script setup lang="ts">
/**
 * 工具卡片状态徽章：running / success / failed
 *
 * 视觉 ▸ 朴素印章式：mono caps 文案 + 极小色点。
 */
import { computed } from 'vue'
import { Loader2, Check, X } from 'lucide-vue-next'
import type { ToolStatus } from '../../types/messageStream'

const props = defineProps<{
  status: ToolStatus
  durationMs?: number
}>()

const tone = computed(() => {
  switch (props.status) {
    case 'running':
      return 'amber'
    case 'success':
      return 'sage'
    case 'failed':
      return 'clay'
  }
  return 'default'
})

const label = computed(() => {
  switch (props.status) {
    case 'running':
      return 'RUNNING'
    case 'success':
      return 'OK'
    case 'failed':
      return 'FAIL'
  }
})

const formatDuration = (ms?: number): string => {
  if (ms == null) return ''
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(2)}s`
}
</script>

<template>
  <span class="nb-chip" :data-tone="tone" style="padding: 2px 8px; font-size: 9.5px;">
    <Loader2 v-if="status === 'running'" :size="9" :stroke-width="2.2" class="animate-spin" />
    <Check v-else-if="status === 'success'" :size="9" :stroke-width="2.4" />
    <X v-else :size="9" :stroke-width="2.4" />
    <span class="nb-mono" style="letter-spacing: 0.14em; font-weight: 700;">{{ label }}</span>
    <span
      v-if="durationMs != null"
      class="nb-mono opacity-60"
      style="letter-spacing: 0.04em;"
    >
      {{ formatDuration(durationMs) }}
    </span>
  </span>
</template>
