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
      <span
        class="flex h-6 w-6 shrink-0 items-center justify-center rounded-[3px] border"
        style="border-color: var(--nb-rule); background-color: var(--nb-card); color: var(--nb-ink);"
      >
        <FilePlus2 v-if="isWrite" :size="12" :stroke-width="1.6" />
        <FileEdit v-else :size="12" :stroke-width="1.6" />
      </span>
    </template>

    <div class="space-y-2 px-3 py-2.5">
      <div
        class="flex items-center justify-between nb-mono text-[10.5px]"
        style="color: var(--nb-ink-mute);"
      >
        <span>{{ tool.path }}</span>
        <span v-if="sizeLabel" class="tabular-nums">{{ sizeLabel }}</span>
      </div>

      <div
        class="rounded-[3px] border"
        style="border-color: var(--nb-rule); background-color: var(--nb-card);"
      >
        <div
          class="flex items-center gap-2 px-2.5 py-1.5 nb-mono text-[10px]"
          style="color: var(--nb-ink-faint); letter-spacing: 0.14em; font-weight: 700;"
        >
          内容预览（前 200 字符）
        </div>
        <pre
          class="nb-scroll overflow-x-auto border-t px-3 py-2 nb-mono text-[11.5px] leading-5 whitespace-pre-wrap"
          style="border-color: var(--nb-rule); color: var(--nb-ink-soft);"
        >{{ previewSnippet || '（空文件）' }}</pre>
      </div>

      <div class="flex justify-end">
        <button
          class="nb-focus inline-flex items-center gap-1.5 rounded-[3px] border px-2.5 py-1 text-[11px] font-medium transition hover:bg-[color:var(--nb-overlay)]"
          style="border-color: var(--nb-rule); color: var(--nb-ink-mute); background-color: var(--nb-card);"
          @click="emit('openInTree', tool.path)"
        >
          <ExternalLink :size="10" :stroke-width="1.6" />
          在文件树中查看
        </button>
      </div>
    </div>
  </ToolCardShell>
</template>
