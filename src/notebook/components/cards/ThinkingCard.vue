<script setup lang="ts">
/**
 * ThinkingCard.vue
 *
 * §5.1.6 思考块：默认折叠。
 *
 * 视觉风格 ▸ 印刷脚注：italic 衬线 + 极淡描边，区别于工具卡矩阵。
 */

import { ref, computed } from 'vue'
import { ChevronRight } from 'lucide-vue-next'
import type { ThinkingBlock } from '../../types/messageStream'

const props = defineProps<{ block: ThinkingBlock }>()

const open = ref(false)

const durationLabel = computed(() => {
  if (props.block.durationMs == null) return ''
  const s = props.block.durationMs / 1000
  return s < 10 ? `${s.toFixed(1)}s` : `${Math.round(s)}s`
})
</script>

<template>
  <div
    class="rounded-[3px] border transition"
    style="border-color: var(--nb-rule); background-color: var(--nb-paper-tint);"
  >
    <button
      class="flex w-full items-center gap-2 px-3 py-1.5 text-left"
      style="color: var(--nb-ink-mute);"
      @click="open = !open"
    >
      <!-- 简笔大脑图：双圆弧 SVG -->
      <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
        <path
          d="M5.5 2.5C4.5 2.5 3 3 3 4.5C2 4.8 1.8 6 2.5 6.5C2 7.2 2.5 8.2 3.5 8.2C3.5 9.5 5 10 5.5 9.5"
          stroke="currentColor"
          stroke-width="1.2"
          stroke-linecap="round"
        />
        <path
          d="M8.5 2.5C9.5 2.5 11 3 11 4.5C12 4.8 12.2 6 11.5 6.5C12 7.2 11.5 8.2 10.5 8.2C10.5 9.5 9 10 8.5 9.5"
          stroke="currentColor"
          stroke-width="1.2"
          stroke-linecap="round"
        />
        <path
          d="M7 2.5V11.5"
          stroke="currentColor"
          stroke-width="1.2"
          stroke-linecap="round"
        />
      </svg>
      <span
        class="nb-display-italic text-[12px]"
        style="color: var(--nb-ink-mute);"
      >
        思考 · marginalia
      </span>
      <span
        v-if="durationLabel"
        class="nb-mono text-[10px] tabular-nums"
        style="color: var(--nb-ink-faint); letter-spacing: 0.04em;"
      >
        — {{ durationLabel }}
      </span>
      <span class="flex-1" />
      <span
        class="nb-mono text-[10px]"
        style="color: var(--nb-ink-faint); letter-spacing: 0.12em; font-weight: 600;"
      >
        {{ open ? 'HIDE' : 'READ' }}
      </span>
      <ChevronRight
        :size="11"
        :stroke-width="1.6"
        class="transition-transform"
        style="color: var(--nb-ink-faint);"
        :class="open ? 'rotate-90' : ''"
      />
    </button>
    <div
      v-if="open"
      class="border-t px-4 py-3"
      style="border-color: var(--nb-rule);"
    >
      <p
        class="nb-display-italic whitespace-pre-wrap text-[13px] leading-[1.7]"
        style="color: var(--nb-ink-mute);"
      >
        {{ block.text }}
      </p>
    </div>
  </div>
</template>
