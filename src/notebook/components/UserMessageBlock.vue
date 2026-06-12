<script setup lang="ts">
/**
 * UserMessageBlock.vue
 * 用户发出的消息块。视觉上保持与 Agent 块的清晰区分：右对齐冷色卡片。
 */
import { User } from 'lucide-vue-next'
import type { UserMessage } from '../types/messageStream'

defineProps<{ message: UserMessage }>()
</script>

<template>
  <div class="flex justify-end">
    <div class="flex max-w-[88%] items-start gap-3">
      <div
        class="rounded-2xl rounded-tr-sm border border-slate-200 bg-white px-4 py-2.5 text-[13px] leading-6 text-slate-800 shadow-[0_8px_18px_-14px_rgba(15,23,42,0.18)]"
      >
        <p class="whitespace-pre-wrap">{{ message.text }}</p>
      </div>
      <span
        class="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-100 text-slate-600"
      >
        <User :size="13" />
      </span>
    </div>
  </div>
</template>
