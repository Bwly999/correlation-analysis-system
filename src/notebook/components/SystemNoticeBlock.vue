<script setup lang="ts">
/**
 * SystemNoticeBlock.vue
 *
 * 系统提示消息的渲染（当前仅用于上下文压缩留痕）。
 *
 * 视觉：居中的窄条 + 铜色左边框（印刷稿的"引用线"风格），
 * 与 user/assistant 消息拉开层次——它是时间线上的标注，不参与对话。
 *
 * 静态留存（无扫光）：压缩进行中的强反馈由 CompactingBanner 承担，
 * 本组件是压缩完成后的历史记录。
 */
import { computed } from 'vue'
import type { SystemNoticeMessage } from '../types/messageStream'

const props = defineProps<{ message: SystemNoticeMessage }>()

const reasonLabel: Record<SystemNoticeMessage['reason'], string> = {
  manual: '手动压缩',
  threshold: '自动压缩',
  overflow: '溢出压缩',
}

const formatTokens = (n: number) => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(n))

// 释放的 token 数：压缩前 token - 保留的近期 token（SDK 默认 keepRecentTokens 20000）
// 这里只能展示"压缩前"的量级，精确的释放量需后端配合，故用近似表述
const releasedText = computed(() => {
  if (props.message.tokensBefore == null) return ''
  return `压缩前 ${formatTokens(props.message.tokensBefore)} tokens`
})
</script>

<template>
  <div class="flex justify-center">
    <div
      class="flex w-full max-w-[88%] items-center gap-2.5 rounded-[var(--nb-radius-sm)] py-2 pl-3 pr-3.5"
      style="
        background-color: var(--nb-paper-tint);
        border-left: 2px solid var(--nb-copper);
      "
      role="note"
    >
      <span
        class="nb-eyebrow flex-shrink-0"
        style="font-size: 9px; letter-spacing: 0.24em; color: var(--nb-copper-deep);"
      >
        {{ reasonLabel[message.reason] }}
      </span>
      <span
        class="h-3 w-px flex-shrink-0"
        style="background-color: var(--nb-rule-strong);"
      />
      <span
        class="text-[11.5px]"
        style="color: var(--nb-ink-mute);"
      >
        早期对话已总结归档
      </span>
      <span
        v-if="releasedText"
        class="nb-mono ml-auto flex-shrink-0 text-[10.5px] tabular-nums"
        style="color: var(--nb-ink-faint);"
      >
        {{ releasedText }}
      </span>
    </div>
  </div>
</template>
