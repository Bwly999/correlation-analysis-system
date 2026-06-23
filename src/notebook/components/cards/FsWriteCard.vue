<script setup lang="ts">
/**
 * FsWriteCard.vue
 * §5.1.2 fs_write 卡片：默认收起，头部展示行数徽章（+新增，补间动画），
 * 点击展开显示完整写入内容（带行号、限高滚动）。
 */
import { computed } from 'vue'
import { FilePlus2, ExternalLink } from 'lucide-vue-next'
import ToolCardShell from './ToolCardShell.vue'
import LineCountBadge from './LineCountBadge.vue'
import type { FsWriteToolCall } from '../../types/messageStream'

const props = defineProps<{
  tool: FsWriteToolCall
}>()

const emit = defineEmits<{
  openInTree: [path: string]
}>()

const subtitle = computed(() => props.tool.path)

const sizeLabel = computed(() => {
  const bytes = props.tool.bytes
  if (bytes <= 0) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
})

/** content 按行切分，供带行号渲染 */
const contentLines = computed(() => props.tool.content.split('\n'))
</script>

<template>
  <ToolCardShell
    :status="tool.status"
    tool-name="fs_write"
    :subtitle="subtitle"
    :duration-ms="tool.durationMs"
    :default-open="false"
  >
    <template #leadingIcon>
      <span
        class="flex h-6 w-6 shrink-0 items-center justify-center rounded-[3px] border"
        style="border-color: var(--nb-rule); background-color: var(--nb-card); color: var(--nb-ink);"
      >
        <FilePlus2 :size="12" :stroke-width="1.6" />
      </span>
    </template>

    <template #headerExtra>
      <LineCountBadge :added="tool.addedLines" />
      <span
        v-if="sizeLabel"
        class="nb-mono tabular-nums"
        style="font-size: 10.5px; color: var(--nb-ink-faint);"
      >
        {{ sizeLabel }}
      </span>
    </template>

    <div class="space-y-2 px-3 py-2.5">
      <div
        v-if="tool.status === 'failed'"
        class="rounded-[3px] border px-3 py-2 text-[12px]"
        style="border-color: rgba(184, 84, 80, 0.3); background-color: var(--nb-clay-soft); color: #8B3A37;"
      >
        <div class="font-medium">写入失败</div>
        <div class="mt-0.5 nb-mono text-[11px] leading-5" style="color: #6E2D2A;">
          {{ tool.errorMessage }}
        </div>
      </div>

      <template v-else>
        <div
          class="nb-scroll overflow-auto rounded-[3px] border"
          style="border-color: var(--nb-rule); background-color: var(--nb-card); max-height: 360px;"
        >
          <table class="w-full border-collapse nb-mono text-[11.5px] leading-5">
            <tbody>
              <tr
                v-for="(line, i) in contentLines"
                :key="i"
                style="color: var(--nb-ink-soft);"
              >
                <td
                  class="select-none border-r px-2 text-right align-top tabular-nums"
                  style="
                    border-color: var(--nb-rule);
                    color: var(--nb-ink-faint);
                    background-color: var(--nb-paper-tint);
                    min-width: 2.5rem;
                    width: 2.5rem;
                  "
                >{{ i + 1 }}</td>
                <td class="px-3 align-top whitespace-pre-wrap break-words">{{ line || ' ' }}</td>
              </tr>
            </tbody>
          </table>
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
      </template>
    </div>
  </ToolCardShell>
</template>
