<script setup lang="ts">
/**
 * UserMessageBlock.vue
 *
 * 用户发出的消息块。视觉：右对齐的暖色卡片（像便签贴在稿纸上），
 * 顶部一个铜色「YOU」眉签提示来源。
 */
import type { UserMessage } from '../types/messageStream'

defineProps<{ message: UserMessage }>()
</script>

<template>
  <div class="flex justify-end">
    <div class="flex max-w-[78%] flex-col items-end">
      <div
        class="nb-eyebrow mb-1 flex items-center gap-1.5"
        style="font-size: 9px; letter-spacing: 0.28em;"
      >
        <span style="color: var(--nb-copper-deep);">YOU</span>
        <span class="h-px w-6" style="background-color: var(--nb-copper); opacity: 0.55;" />
      </div>
      <div
        class="rounded-[3px] border px-4 py-3"
        style="
          background-color: var(--nb-copper-soft);
          border-color: rgba(204, 120, 92, 0.25);
          color: var(--nb-ink);
        "
      >
        <p
          class="whitespace-pre-wrap text-[13.5px] leading-[1.7]"
          style="font-feature-settings: 'cv11';"
        >
          {{ message.text }}
        </p>
      </div>
    </div>
  </div>
</template>
