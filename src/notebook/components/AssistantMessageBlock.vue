<script setup lang="ts">
/**
 * AssistantMessageBlock.vue
 *
 * 渲染单条 Agent 消息：thinking / text / tool / ask_user 多个 block 顺序展开。
 *
 * 视觉风格 ▸ 稿件正文：assistant 不再是气泡，而是流动的版式正文；
 *           左侧只用一道铜色细竖线标识来源；标题印「ASSISTANT」眉签。
 */

import { computed } from 'vue'
import type { AssistantMessage } from '../types/messageStream'
import { renderMarkdownSafe } from '../preview/markdownRenderer'
import ThinkingCard from './cards/ThinkingCard.vue'
import PythonExecCard from './cards/PythonExecCard.vue'
import FsWriteCard from './cards/FsWriteCard.vue'
import FsReadCard from './cards/FsReadCard.vue'
import FsGrepCard from './cards/FsGrepCard.vue'
import TodoWriteCard from './cards/TodoWriteCard.vue'
import AskUserCard from './cards/AskUserCard.vue'

const props = defineProps<{ message: AssistantMessage }>()

const emit = defineEmits<{
  askUserSubmit: [payload: { askId: string; optionId: string; text?: string }]
  askUserCancel: [askId: string]
  openInTree: [path: string]
}>()

const renderText = (md: string) => renderMarkdownSafe(md)

const isStreaming = computed(() => props.message.streaming)

const onAskSubmit = (askId: string, payload: { optionId: string; text?: string }) => {
  emit('askUserSubmit', { askId, ...payload })
}
</script>

<template>
  <article class="relative pl-5">
    <!-- 左侧装饰：铜色细竖线 -->
    <span
      class="absolute left-0 top-1 bottom-0 w-px"
      style="background-color: var(--nb-copper); opacity: 0.45;"
    />

    <!-- 眉签 -->
    <div class="mb-3 flex items-center gap-2">
      <span
        class="nb-eyebrow"
        style="font-size: 9px; letter-spacing: 0.28em; color: var(--nb-copper-deep);"
      >
        ASSISTANT
      </span>
      <span class="h-px flex-1 max-w-12" style="background-color: var(--nb-copper); opacity: 0.45;" />
    </div>

    <div class="space-y-3.5">
      <template v-for="(b, i) in message.blocks" :key="b.data.id + '-' + i">
        <ThinkingCard v-if="b.kind === 'thinking'" :block="b.data" />

        <div
          v-else-if="b.kind === 'text'"
          class="nb-prose"
          v-html="renderText(b.data.text)"
        />

        <PythonExecCard
          v-else-if="b.kind === 'tool' && b.data.kind === 'python_exec'"
          :tool="b.data"
        />
        <FsWriteCard
          v-else-if="b.kind === 'tool' && (b.data.kind === 'fs_write' || b.data.kind === 'fs_edit')"
          :tool="b.data"
          @open-in-tree="(p) => emit('openInTree', p)"
        />
        <FsReadCard
          v-else-if="b.kind === 'tool' && b.data.kind === 'fs_read'"
          :tool="b.data"
        />
        <FsGrepCard
          v-else-if="b.kind === 'tool' && b.data.kind === 'fs_grep'"
          :tool="b.data"
        />
        <TodoWriteCard
          v-else-if="b.kind === 'tool' && b.data.kind === 'todo_write'"
          :tool="b.data"
        />
        <AskUserCard
          v-else-if="b.kind === 'ask_user'"
          :block="b.data"
          @submit="(p) => onAskSubmit(b.data.id, p)"
          @cancel="emit('askUserCancel', b.data.id)"
        />
      </template>

      <!-- streaming 指示：印刷感的细线脉动 + 字符光标 -->
      <div v-if="isStreaming" class="flex items-center gap-2 pt-1">
        <span
          class="h-1.5 w-1.5 rounded-full"
          style="background-color: var(--nb-copper); animation: nb-pulse 1.4s ease-in-out infinite;"
        />
        <span
          class="nb-display-italic text-[12px]"
          style="color: var(--nb-ink-mute);"
        >
          正在落笔
        </span>
        <span
          class="h-px flex-1 max-w-16"
          style="background: linear-gradient(to right, var(--nb-copper) 0%, transparent 100%); opacity: 0.5;"
        />
      </div>
    </div>
  </article>
</template>
