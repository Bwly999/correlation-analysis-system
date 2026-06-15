<script setup lang="ts">
/**
 * 工具卡片外壳：统一头部（icon + 工具名 + 副标题 + 状态徽章）+ 可折叠插槽
 *
 * 视觉 ▸ 编辑稿插页：扁平、无投影、左侧极细色条标记状态。
 */
import { computed, ref } from 'vue'
import { ChevronRight } from 'lucide-vue-next'
import ToolStatusBadge from './ToolStatusBadge.vue'
import type { ToolStatus } from '../../types/messageStream'

const props = withDefaults(
  defineProps<{
    status: ToolStatus
    /** 工具显示名 */
    toolName: string
    /** 副标题（路径 / 参数 ...） */
    subtitle?: string
    durationMs?: number
    defaultOpen?: boolean
    collapsible?: boolean
  }>(),
  {
    defaultOpen: true,
    collapsible: true,
  },
)

const open = ref(props.defaultOpen)

const accentColor = computed(() => {
  switch (props.status) {
    case 'running':
      return 'var(--nb-amber)'
    case 'success':
      return 'var(--nb-sage)'
    case 'failed':
      return 'var(--nb-clay)'
  }
  return 'var(--nb-ink-faint)'
})

const canCollapse = computed(() => props.collapsible)
</script>

<template>
  <div
    class="group relative overflow-hidden rounded-[var(--nb-radius-sm)] border transition"
    style="background-color: var(--nb-card); border-color: var(--nb-rule);"
  >
    <!-- 左侧色条 -->
    <span
      class="absolute left-0 top-0 h-full w-[2px]"
      :style="{ backgroundColor: accentColor }"
    />

    <button
      class="flex w-full items-center gap-2.5 pl-3.5 pr-3 py-2 text-left transition hover:bg-[color:var(--nb-overlay)]"
      :disabled="!canCollapse"
      @click="canCollapse && (open = !open)"
    >
      <slot name="leadingIcon">
        <span
          class="flex h-6 w-6 shrink-0 items-center justify-center rounded-[var(--nb-radius-xs)] border"
          style="border-color: var(--nb-rule); background-color: var(--nb-paper-tint); color: var(--nb-ink-mute);"
        >
          <span class="nb-mono text-[9.5px]" style="letter-spacing: 0.04em;">fn</span>
        </span>
      </slot>
      <div class="min-w-0 flex-1">
        <div class="flex items-baseline gap-2">
          <span
            class="nb-mono text-[11.5px] font-semibold"
            style="color: var(--nb-ink); letter-spacing: 0.01em;"
          >
            {{ toolName }}
          </span>
          <span
            v-if="subtitle"
            class="nb-mono truncate text-[11px]"
            style="color: var(--nb-ink-mute);"
          >
            {{ subtitle }}
          </span>
        </div>
      </div>
      <ToolStatusBadge :status="status" :duration-ms="durationMs" />
      <ChevronRight
        v-if="canCollapse"
        :size="13"
        :stroke-width="1.6"
        class="ml-1 shrink-0 transition-transform"
        style="color: var(--nb-ink-faint);"
        :class="open ? 'rotate-90' : ''"
      />
    </button>
    <div
      v-if="open"
      class="border-t"
      style="border-color: var(--nb-rule); background-color: var(--nb-paper-tint);"
    >
      <slot />
    </div>
  </div>
</template>
