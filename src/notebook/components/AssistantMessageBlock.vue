<script setup lang="ts">
/**
 * AssistantMessageBlock.vue
 *
 * 渲染单条 Agent 消息：thinking / text / tool / ask_user 多个 block 顺序展开。
 * 工具卡片矩阵根据 kind 路由到对应组件。
 */

import { computed } from 'vue'
import { Bot } from 'lucide-vue-next'
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
  <div class="flex items-start gap-3">
    <span
      class="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-950 text-blue-300 shadow-[0_8px_16px_-10px_rgba(15,23,42,0.6)]"
    >
      <Bot :size="13" />
    </span>
    <div class="min-w-0 flex-1 space-y-2.5">
      <template v-for="(b, i) in message.blocks" :key="b.data.id + '-' + i">
        <ThinkingCard v-if="b.kind === 'thinking'" :block="b.data" />

        <div
          v-else-if="b.kind === 'text'"
          class="prose prose-sm max-w-none text-[13.5px] leading-7 text-slate-800
                 prose-headings:tracking-tight prose-headings:text-slate-900
                 prose-strong:text-slate-900 prose-code:text-blue-700
                 prose-code:bg-blue-50 prose-code:rounded prose-code:px-1
                 prose-pre:bg-slate-950 prose-pre:text-slate-100
                 prose-a:text-blue-600 prose-a:no-underline hover:prose-a:underline"
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

      <!-- streaming 指示：尾部跳动光标 -->
      <div v-if="isStreaming" class="flex items-center gap-1.5 pt-0.5">
        <span class="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-500" />
        <span class="text-[11px] font-mono uppercase tracking-[0.18em] text-slate-400">
          Agent 正在分析…
        </span>
      </div>
    </div>
  </div>
</template>
