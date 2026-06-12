<script setup lang="ts">
/**
 * FsGrepCard.vue
 * §5.1.4 fs_grep 卡片：模式 + 范围 + 命中列表（默认展开）
 */

import { computed } from 'vue'
import { Search } from 'lucide-vue-next'
import ToolCardShell from './ToolCardShell.vue'
import type { FsGrepToolCall } from '../../types/messageStream'

const props = defineProps<{ tool: FsGrepToolCall }>()

const subtitle = computed(() => `"${props.tool.pattern}" in ${props.tool.scope} · ${props.tool.matches.length} 命中`)

const formatLine = (n: number) => String(n).padStart(3, ' ')
</script>

<template>
  <ToolCardShell
    :status="tool.status"
    tool-name="fs_grep"
    :subtitle="subtitle"
    :duration-ms="tool.durationMs"
  >
    <template #leadingIcon>
      <span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700">
        <Search :size="13" />
      </span>
    </template>

    <div v-if="tool.matches.length === 0" class="px-3 py-3 text-[12px] text-slate-500">
      没有命中
    </div>
    <ul v-else class="divide-y divide-slate-100">
      <li
        v-for="(m, i) in tool.matches"
        :key="`${m.path}:${m.line}:${i}`"
        class="flex items-baseline gap-3 px-3 py-1.5 font-mono text-[11.5px] leading-5"
      >
        <span class="shrink-0 text-slate-400">{{ m.path }}</span>
        <span class="shrink-0 text-slate-300">:</span>
        <span class="shrink-0 tabular-nums text-amber-600">{{ formatLine(m.line) }}</span>
        <span class="min-w-0 flex-1 truncate text-slate-700">{{ m.text }}</span>
      </li>
    </ul>
  </ToolCardShell>
</template>
