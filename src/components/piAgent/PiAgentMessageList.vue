<script setup lang="ts">
/**
 * Pi Agent 消息列表
 */
import { nextTick, watch, ref } from 'vue'
import { usePiAgentStore } from '../../stores/piAgentStore'
import PiAgentThinkingBlock from './PiAgentThinkingBlock.vue'
import PiAgentToolCallCard from './PiAgentToolCallCard.vue'
import PiAgentMarkdownRenderer from './PiAgentMarkdownRenderer.vue'

defineProps<{
  debugVisible?: boolean
}>()

const store = usePiAgentStore()
const listRef = ref<HTMLElement | null>(null)

// 自动滚动到底部
watch(
  () => store.messages.length,
  () => {
    nextTick(() => {
      if (listRef.value) {
        listRef.value.scrollTop = listRef.value.scrollHeight
      }
    })
  },
)

// 消息内容变化时也滚动
watch(
  () => store.messages.map((m) => m.content.length).join(','),
  () => {
    nextTick(() => {
      if (listRef.value) {
        listRef.value.scrollTop = listRef.value.scrollHeight
      }
    })
  },
)
</script>

<template>
  <div
    ref="listRef"
    class="flex flex-1 flex-col gap-4 overflow-y-auto px-4 py-4"
  >
    <div
      v-if="store.messages.length === 0"
      class="flex min-h-[240px] flex-1 items-center justify-center"
    >
      <div class="max-w-[320px] rounded-[28px] border border-slate-200/80 bg-white/80 px-6 py-7 text-center shadow-[0_25px_50px_-36px_rgba(15,23,42,0.35)] backdrop-blur-xl">
        <div class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-950 text-lg font-bold text-blue-300">
          Pi
        </div>
        <h3 class="text-[16px] font-bold tracking-[-0.02em] text-slate-900">Pi Agent 已就位</h3>
        <p class="mt-2 text-[13px] leading-6 text-slate-500">
          你可以让它解读当前工作流、定位问题、规划节点步骤，或直接帮助推进下一步分析。
        </p>
      </div>
    </div>

    <div
      v-for="msg in store.messages"
      :key="msg.id"
      class="flex flex-col"
      :class="msg.role === 'user' ? 'items-end' : 'items-start'"
    >
      <div
        v-if="msg.role === 'user'"
        class="max-w-[88%] rounded-[20px] rounded-br-md bg-slate-950 px-4 py-3 text-[13px] leading-6 text-white shadow-[0_24px_36px_-28px_rgba(15,23,42,0.7)]"
      >
        {{ msg.content }}
      </div>

      <div
        v-else
        class="max-w-[94%] space-y-2"
      >
        <PiAgentThinkingBlock v-if="msg.thinking" :thinking="msg.thinking" />

        <PiAgentToolCallCard
          v-for="tc in msg.toolCalls"
          :key="tc.id"
          :tool-call="tc"
        />

        <div
          v-if="msg.content"
          class="rounded-[24px] rounded-tl-md border border-slate-200/80 bg-white/92 px-4 py-4 shadow-[0_24px_45px_-34px_rgba(15,23,42,0.35)] backdrop-blur"
        >
          <div class="flex items-end gap-1.5">
            <div class="min-w-0 flex-1">
              <PiAgentMarkdownRenderer :content="msg.content" :debug-visible="debugVisible" />
            </div>
            <span
              v-if="msg.status === 'streaming'"
              class="cursor-blink mb-1 inline-block text-blue-500"
            >
              ▊
            </span>
          </div>
        </div>
      </div>
    </div>

    <div
      v-if="store.isStreaming && !store.messages.some(m => m.status === 'streaming')"
      class="flex items-center gap-2 rounded-2xl border border-slate-200/80 bg-white/80 px-4 py-3 text-[12px] text-slate-500 shadow-[0_18px_30px_-26px_rgba(15,23,42,0.3)] backdrop-blur"
    >
      <span class="h-2 w-2 animate-pulse rounded-full bg-blue-500" />
      <span class="h-2 w-2 animate-pulse rounded-full bg-blue-400 [animation-delay:120ms]" />
      <span class="h-2 w-2 animate-pulse rounded-full bg-blue-300 [animation-delay:240ms]" />
      <span class="ml-1">Pi Agent 正在整理回复与工具结果...</span>
    </div>

    <div
      v-if="store.errorMessage"
      class="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-[12px] leading-6 text-rose-700"
    >
      {{ store.errorMessage }}
    </div>
  </div>
</template>
