<script setup lang="ts">
/**
 * UserMessageBlock.vue
 *
 * 用户发出的消息块。视觉：右对齐的墨色卡片（像钢笔批注盖在稿纸上），
 * 顶部一个铜色「YOU」眉签提示来源。
 *
 * 配色选择：用深墨色而非铜色底——铜色是品牌强调色，留给 ask_user、
 * 选中态等真正需要吸引注意力的元素；用户消息用高对比深底，
 * 视觉上"实在、已确定"，区别于 assistant 的流动正文。
 */
import type { UserMessage } from '../types/messageStream'

defineProps<{ message: UserMessage }>()
</script>

<template>
  <div class="flex justify-end">
    <div class="flex max-w-[78%] flex-col items-end">
      <div
        class="nb-eyebrow mb-1.5 flex items-center gap-1.5"
        style="font-size: 9px; letter-spacing: 0.28em;"
      >
        <span class="h-px w-6" style="background-color: var(--nb-copper); opacity: 0.55;" />
        <span style="color: var(--nb-copper-deep);">YOU</span>
      </div>
      <div
        class="rounded-[var(--nb-radius-md)] rounded-br-[var(--nb-radius-xs)] px-4 py-3"
        style="
          background-color: var(--nb-ink);
          color: var(--nb-paper);
          box-shadow: var(--nb-shadow-md);
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
