<script setup lang="ts">
/**
 * NotebookMessageStream.vue
 *
 * 消息流容器：渲染 user / assistant 块；自动滚动到底；
 *
 * 视觉风格 ▸ 编辑稿：顶部带 session 大标题 + tag 行，消息流像逐段排版的稿件。
 */
import { computed, nextTick, ref } from 'vue'
import { watchDebounced } from '@vueuse/core'
import type { NotebookMessage } from '../types/messageStream'
import type { OpfsDirectoryHandle } from '../shared/opfsAccess'
import UserMessageBlock from './UserMessageBlock.vue'
import AssistantMessageBlock from './AssistantMessageBlock.vue'
import CompactingBanner from './CompactingBanner.vue'
import SystemNoticeBlock from './SystemNoticeBlock.vue'

const props = defineProps<{
  messages: NotebookMessage[]
  sessionTitle?: string
  opfsRoot?: OpfsDirectoryHandle
  /** 正在压缩上下文（显示底部扫光提示条；自动/手动压缩共用同一通路） */
  compacting?: boolean
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

// messages 按 token 高频更新（mapper 每次 mutate 同一引用），用 watchDebounced
// 合并连续变更，避免每个 delta 都 deep 比较整树 + 触发一次滚动。
// - debounce：合并突发（人眼对 ~80ms 内的滚动合并无感）
// - maxWait：持续输出时强制触发，保证不会一直卡着不滚（trailing 默认 true 最终贴底）
watchDebounced(
  () => props.messages,
  async () => {
    await nextTick()
    if (stickToBottom && scrollRef.value) {
      scrollRef.value.scrollTop = scrollRef.value.scrollHeight
    }
  },
  { deep: true, debounce: 80, maxWait: 240 },
)

const todayLabel = computed(() => {
  const d = new Date()
  return d.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  })
})
</script>

<template>
  <div
    ref="scrollRef"
    class="nb-scroll relative h-full overflow-y-auto"
    @scroll.passive="onScroll"
  >
    <!-- 文档式头部：日期 + 标题 + 双线分隔 -->
    <div
      v-if="sessionTitle && messages.length > 0"
      class="nb-fade-up mx-auto max-w-[760px] px-10 pt-10 pb-6"
    >
      <div class="flex items-center justify-between gap-3">
        <span class="nb-eyebrow">Analysis Notebook</span>
        <span
          class="nb-mono text-[10.5px]"
          style="color: var(--nb-ink-faint); letter-spacing: 0.08em;"
        >
          {{ todayLabel }}
        </span>
      </div>
      <h2
        class="nb-display mt-3 text-[32px] font-medium leading-[1.15]"
        style="color: var(--nb-ink); letter-spacing: -0.02em;"
      >
        {{ sessionTitle }}
      </h2>
      <p
        class="nb-display-italic mt-2 text-[14px]"
        style="color: var(--nb-ink-mute);"
      >
        a working draft, written and revised in conversation.
      </p>
      <div class="mt-5 nb-rule-double w-full" />
    </div>

    <!-- 空态 -->
    <div
      v-if="messages.length === 0"
      class="flex h-full flex-col items-center justify-center px-8 text-center"
    >
      <span class="nb-eyebrow mb-3">Notebook</span>
      <h3
        class="nb-display max-w-md text-[28px] font-medium leading-[1.18]"
        style="color: var(--nb-ink); letter-spacing: -0.018em;"
      >
        准备就绪。
      </h3>
      <p
        class="nb-display-italic mt-2 max-w-sm text-[15px]"
        style="color: var(--nb-ink-mute);"
      >
        告诉我你的分析目标——比如「找出和 churn 最相关的因子」。
      </p>
      <div
        class="mt-6 flex items-center gap-2 nb-mono text-[10.5px]"
        style="color: var(--nb-ink-faint); letter-spacing: 0.16em;"
      >
        <span class="h-px w-12" style="background-color: var(--nb-rule-strong);" />
        <span>⌘ + K · 聚焦输入</span>
        <span class="h-px w-12" style="background-color: var(--nb-rule-strong);" />
      </div>
    </div>

    <!-- 正文消息流 -->
    <ul
      v-else
      class="mx-auto max-w-[760px] space-y-8 px-10 pb-[220px]"
    >
      <li
        v-for="(m, idx) in messages"
        :key="m.id"
        class="nb-fade-up"
        :style="{ animationDelay: Math.min(idx, 6) * 40 + 'ms' }"
      >
        <UserMessageBlock v-if="m.role === 'user'" :message="m" />
        <AssistantMessageBlock
          v-else-if="m.role === 'assistant'"
          :message="m"
          :opfs-root="props.opfsRoot"
          @ask-user-submit="(p) => emit('askUserSubmit', p)"
          @ask-user-cancel="(id) => emit('askUserCancel', id)"
          @open-in-tree="(p) => emit('openInTree', p)"
        />
        <SystemNoticeBlock v-else-if="m.role === 'system'" :message="m" />
      </li>
      <!-- 上下文压缩提示条：贴在最新消息下方，扫光掠过表示进行中 -->
      <li v-if="compacting" class="nb-fade-up">
        <CompactingBanner :active="!!compacting" />
      </li>
    </ul>
  </div>
</template>
