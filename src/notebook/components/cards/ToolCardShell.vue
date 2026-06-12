<script setup lang="ts">
/**
 * 工具卡片外壳：统一头部（icon + 工具名 + 副标题 + 状态徽章）+ 可折叠插槽
 *
 * 子卡片只关心内容渲染，外壳统一 hairline 边框 / 阴影 / 字号 / 折叠交互。
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
    /** 默认是否展开内容；某些卡片（如 todo_write）默认折叠 */
    defaultOpen?: boolean
    /** 是否允许折叠；ask_user 这类不允许 */
    collapsible?: boolean
  }>(),
  {
    defaultOpen: true,
    collapsible: true,
  },
)

const open = ref(props.defaultOpen)

const accentLine = computed(() => {
  switch (props.status) {
    case 'running':
      return 'bg-amber-400'
    case 'success':
      return 'bg-emerald-400'
    case 'failed':
      return 'bg-rose-400'
  }
  return 'bg-slate-300'
})

const canCollapse = computed(() => props.collapsible)
</script>

<template>
  <div
    class="group relative overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-[0_1px_0_0_rgba(15,23,42,0.04),0_8px_24px_-16px_rgba(15,23,42,0.18)] transition hover:border-slate-300/90"
  >
    <!-- 左侧色条 -->
    <span class="absolute left-0 top-0 h-full w-[3px]" :class="accentLine" />

    <button
      class="flex w-full items-center gap-2.5 pl-4 pr-3 py-2.5 text-left"
      :disabled="!canCollapse"
      @click="canCollapse && (open = !open)"
    >
      <div class="flex min-w-0 flex-1 items-center gap-2">
        <slot name="leadingIcon">
          <span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-slate-500">
            <span class="font-mono text-[10px]">fn</span>
          </span>
        </slot>
        <div class="min-w-0">
          <div class="flex items-baseline gap-1.5">
            <span class="font-mono text-[12px] font-semibold tracking-tight text-slate-900">{{ toolName }}</span>
            <span v-if="subtitle" class="truncate font-mono text-[11px] text-slate-500">
              {{ subtitle }}
            </span>
          </div>
        </div>
      </div>
      <ToolStatusBadge :status="status" :duration-ms="durationMs" />
      <ChevronRight
        v-if="canCollapse"
        :size="14"
        class="ml-1 shrink-0 text-slate-400 transition-transform"
        :class="open ? 'rotate-90' : ''"
      />
    </button>
    <div v-if="open" class="border-t border-slate-100 bg-slate-50/50">
      <slot />
    </div>
  </div>
</template>
