<script setup lang="ts">
/**
 * TodoPanel.vue
 *
 * §3.1 悬浮 TODO 卡片：折叠 / 展开；展示当前 in_progress 摘要。
 *
 * 视觉风格 ▸ 圆角玻璃卡，叠在消息流之上、输入卡上方。
 */
import { computed, ref } from 'vue'
import { ChevronUp } from 'lucide-vue-next'
import TodoListView from './TodoListView.vue'
import type { TodoItem } from '../types/messageStream'

const props = defineProps<{
  todos: TodoItem[]
  /** 默认是否展开 */
  defaultOpen?: boolean
}>()

const open = ref(props.defaultOpen ?? true)

const inProgress = computed(() => props.todos.find((t) => t.state === 'in_progress'))
const completedCount = computed(() => props.todos.filter((t) => t.state === 'completed').length)
</script>

<template>
  <div
    v-if="todos.length"
    class="rounded-[12px] border overflow-hidden"
    style="
      border-color: var(--nb-rule-strong);
      background-color: rgba(255, 255, 255, 0.92);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      box-shadow: 0 8px 24px -14px rgba(40, 40, 38, 0.16), 0 1px 3px -1px rgba(40, 40, 38, 0.06);
    "
  >
    <button
      class="nb-focus flex w-full items-center gap-2.5 px-4 py-2 text-left transition hover:bg-[color:var(--nb-overlay)]"
      @click="open = !open"
    >
      <span
        class="nb-display text-[13px] italic"
        style="color: var(--nb-copper-deep); font-weight: 500;"
      >
        §
      </span>
      <span
        class="nb-eyebrow"
        style="font-size: 9.5px; letter-spacing: 0.22em; color: var(--nb-ink);"
      >
        Plan / 分析计划
      </span>
      <span
        v-if="inProgress && !open"
        class="nb-display-italic truncate text-[12px]"
        style="color: var(--nb-copper-deep);"
      >
        — 当前：{{ inProgress.text }}
      </span>
      <span class="flex-1" />
      <span
        class="nb-mono text-[10px] tabular-nums"
        style="color: var(--nb-ink-faint); letter-spacing: 0.12em; font-weight: 700;"
      >
        {{ completedCount }} / {{ todos.length }}
      </span>
      <ChevronUp
        :size="13"
        :stroke-width="1.6"
        class="transition-transform"
        style="color: var(--nb-ink-faint);"
        :class="open ? '' : 'rotate-180'"
      />
    </button>
    <div
      v-if="open"
      class="border-t px-4 pb-2.5 pt-2"
      style="border-color: var(--nb-rule);"
    >
      <TodoListView :items="todos" />
    </div>
  </div>
</template>
