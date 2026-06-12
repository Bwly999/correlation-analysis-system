<script setup lang="ts">
/**
 * FsWriteCard.vue
 * §5.1.2 fs_write / fs_edit 卡片：路径 + 字节数 + 内容预览前 200 字符。
 */

import { computed } from 'vue'
import { FilePlus2, FileEdit, ExternalLink } from 'lucide-vue-next'
import ToolCardShell from './ToolCardShell.vue'
import type { FsWriteToolCall, FsEditToolCall } from '../../types/messageStream'

const props = defineProps<{
  tool: FsWriteToolCall | FsEditToolCall
}>()

const emit = defineEmits<{
  openInTree: [path: string]
}>()

const isWrite = computed(() => props.tool.kind === 'fs_write')

const subtitle = computed(() => props.tool.path)

const sizeLabel = computed(() => {
  if (props.tool.kind !== 'fs_write') return ''
  const bytes = props.tool.bytes
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
})

const previewSnippet = computed(() => {
  const text = props.tool.preview ?? ''
  return text.length > 240 ? text.slice(0, 240) + '…' : text
})
</script>

<template>
  <ToolCardShell
    :status="tool.status"
    :tool-name="isWrite ? 'fs_write' : 'fs_edit'"
    :subtitle="subtitle"
    :duration-ms="tool.durationMs"
  >
    <template #leadingIcon>
      <span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700">
        <FilePlus2 v-if="isWrite" :size="13" />
        <FileEdit v-else :size="13" />
      </span>
    </template>

    <div class="space-y-2 px-3 py-2.5">
      <div class="flex items-center justify-between text-[11px] text-slate-500">
        <span class="font-mono">
          {{ tool.path }}
        </span>
        <span v-if="sizeLabel" class="font-mono tabular-nums">
          {{ sizeLabel }}
        </span>
      </div>

      <div class="rounded-lg border border-slate-200/80 bg-white">
        <div class="flex items-center gap-2 px-2.5 py-1.5 text-[10px] font-mono uppercase tracking-[0.14em] text-slate-400">
          内容预览（前 200 字符）
        </div>
        <pre class="overflow-x-auto border-t border-slate-100 px-3 py-2 font-mono text-[11.5px] leading-5 text-slate-700 whitespace-pre-wrap">{{ previewSnippet || '（空文件）' }}</pre>
      </div>

      <div class="flex justify-end">
        <button
          class="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
          @click="emit('openInTree', tool.path)"
        >
          <ExternalLink :size="11" />
          在文件树中查看
        </button>
      </div>
    </div>
  </ToolCardShell>
</template>
