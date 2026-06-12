<script setup lang="ts">
/**
 * NotebookMessageStream.vue
 *
 * 消息流容器：渲染 user / assistant 块；自动滚动到底；
 * 顶部空态文案 §4.3 "✨ 准备就绪..."。
 *
 * 不直接持有数据；外部传 messages，事件向上冒泡。
 */
import { nextTick, ref, watch } from 'vue'
import { Sparkles } from 'lucide-vue-next'
import type { NotebookMessage } from '../types/messageStream'
import UserMessageBlock from './UserMessageBlock.vue'
import AssistantMessageBlock from './AssistantMessageBlock.vue'

const props = defineProps<{
  messages: NotebookMessage[]
}>()

const emit = defineEmits<{
  askUserSubmit: [payload: { askId: string; optionId: string; text?: string }]
  askUserCancel: [askId: string]
  openInTree: [path: string]
}>()

const scrollRef = ref<HTMLElement | null>(null)
let stickToBottom = true

const onScroll = () => {
  const el = scrollRef.value
  if (!el) return
  const distance = el.scrollHeight - el.scrollTop - el.clientHeight
  stickToBottom = distance < 64
}

watch(
  () => props.messages.length,
  async () => {
    await nextTick()
    if (stickToBottom && scrollRef.value) {
      scrollRef.value.scrollTop = scrollRef.value.scrollHeight
    }
  },
)
</script>

<template>
  <div
    ref="scrollRef"
    class="relative h-full overflow-y-auto px-6 py-5"
    @scroll.passive="onScroll"
  >
    <div v-if="messages.length === 0" class="flex h-full flex-col items-center justify-center text-center">
      <span class="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-blue-200 bg-blue-50 text-blue-600 shadow-[0_12px_30px_-18px_rgba(37,99,235,0.5)]">
        <Sparkles :size="18" />
      </span>
      <p class="text-[14px] font-semibold tracking-tight text-slate-900">
        准备就绪
      </p>
      <p class="mt-1 max-w-xs text-[12.5px] leading-5 text-slate-500">
        Agent 已就位，告诉我你的分析目标。比如「找出和 churn 最相关的因子」。
      </p>
    </div>

    <ul v-else class="space-y-5">
      <li v-for="m in messages" :key="m.id">
        <UserMessageBlock v-if="m.role === 'user'" :message="m" />
        <AssistantMessageBlock
          v-else
          :message="m"
          @ask-user-submit="(p) => emit('askUserSubmit', p)"
          @ask-user-cancel="(id) => emit('askUserCancel', id)"
          @open-in-tree="(p) => emit('openInTree', p)"
        />
      </li>
    </ul>
  </div>
</template>
