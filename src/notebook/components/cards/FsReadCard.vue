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
      <span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700">
        <FileSearch2 :size="13" />
      </span>
    </template>

    <div class="space-y-2 px-3 py-2.5">
      <div v-if="tool.status === 'failed'" class="rounded-md border border-rose-200 bg-rose-50/60 px-3 py-2 text-[12px] text-rose-700">
        <div class="flex items-start gap-2">
          <AlertTriangle :size="13" class="mt-0.5 shrink-0" />
          <div>
            <div class="font-medium">读取失败</div>
            <div class="mt-0.5 font-mono text-[11.5px] leading-5">{{ tool.errorMessage }}</div>
          </div>
        </div>
      </div>

      <template v-else>
        <pre class="overflow-x-auto rounded-md border border-slate-200/80 bg-white px-3 py-2 font-mono text-[11.5px] leading-5 text-slate-700 whitespace-pre-wrap">{{ tool.content || '（空文件）' }}</pre>
        <div
          v-if="tool.truncated"
          class="flex items-center gap-1.5 text-[11px] text-amber-700"
        >
          <AlertTriangle :size="11" />
          已截断；如需完整数据请改用 python_exec_inline 直接读取。
        </div>
      </template>
    </div>
  </ToolCardShell>
</template>
