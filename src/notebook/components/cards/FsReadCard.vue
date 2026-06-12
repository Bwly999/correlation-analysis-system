<script setup lang="ts">
/**
 * FsReadCard.vue
 * §5.1.3 fs_read 卡片：显示路径 / 行数 / 截断标记 / 内容
 */

import { computed } from 'vue'
import { FileSearch2, AlertTriangle } from 'lucide-vue-next'
import ToolCardShell from './ToolCardShell.vue'
import type { FsReadToolCall } from '../../types/messageStream'

const props = defineProps<{ tool: FsReadToolCall }>()

const subtitle = computed(() => {
  if (props.tool.status === 'failed') return props.tool.path
  const total = props.tool.linesTotal
  return total
    ? `${props.tool.path} · ${props.tool.linesShown}/${total} 行`
    : `${props.tool.path} · ${props.tool.linesShown} 行`
})
</script>

<template>
  <ToolCardShell
    :status="tool.status"
    tool-name="fs_read"
    :subtitle="subtitle"
    :duration-ms="tool.durationMs"
  >
    <template #leadingIcon>
      <span
        class="flex h-6 w-6 shrink-0 items-center justify-center rounded-[3px] border"
        style="border-color: var(--nb-rule); background-color: var(--nb-card); color: var(--nb-ink);"
      >
        <FileSearch2 :size="12" :stroke-width="1.6" />
      </span>
    </template>

    <div class="space-y-2 px-3 py-2.5">
      <div
        v-if="tool.status === 'failed'"
        class="rounded-[3px] border px-3 py-2 text-[12px]"
        style="border-color: rgba(184, 84, 80, 0.3); background-color: var(--nb-clay-soft); color: #8B3A37;"
      >
        <div class="flex items-start gap-2">
          <AlertTriangle :size="13" :stroke-width="1.6" class="mt-0.5 shrink-0" />
          <div>
            <div class="font-medium">读取失败</div>
            <div class="mt-0.5 nb-mono text-[11px] leading-5" style="color: #6E2D2A;">
              {{ tool.errorMessage }}
            </div>
          </div>
        </div>
      </div>

      <template v-else>
        <pre
          class="nb-scroll overflow-x-auto rounded-[3px] border px-3 py-2 nb-mono text-[11.5px] leading-5 whitespace-pre-wrap"
          style="border-color: var(--nb-rule); background-color: var(--nb-card); color: var(--nb-ink-soft);"
        >{{ tool.content || '（空文件）' }}</pre>
        <div
          v-if="tool.truncated"
          class="flex items-center gap-1.5 text-[11px]"
          style="color: #7C5A28;"
        >
          <AlertTriangle :size="11" :stroke-width="1.6" />
          已截断；如需完整数据请改用 python_exec_inline 直接读取。
        </div>
      </template>
    </div>
  </ToolCardShell>
</template>
