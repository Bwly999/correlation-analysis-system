<script setup lang="ts">
/**
 * TodoPanel.vue
 *
 * §3.1 左下常驻 TODO 面板：折叠 / 展开；展示当前 in_progress 摘要。
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
    class="border-t"
    style="border-color: var(--nb-rule); background-color: var(--nb-paper);"
  >
    <button
      class="nb-focus flex w-full items-center gap-3 px-5 py-2.5 text-left transition hover:bg-[color:var(--nb-overlay)]"
      @click="open = !open"
    >
      <!-- 罗马数字风格的章节编号 -->
      <span
        class="nb-display text-[14px] italic"
        style="color: var(--nb-copper-deep); font-weight: 500;"
      >
        §
      </span>
      <span
        class="nb-eyebrow"
        style="font-size: 10px; letter-spacing: 0.22em; color: var(--nb-ink);"
      >
        Plan / 分析计划
      </span>
      <span
        v-if="inProgress && !open"
        class="nb-display-italic truncate text-[12.5px]"
        style="color: var(--nb-copper-deep);"
      >
        — 当前：{{ inProgress.text }}
      </span>
      <span class="flex-1" />
      <span
        class="nb-mono text-[10.5px] tabular-nums"
        style="color: var(--nb-ink-faint); letter-spacing: 0.12em; font-weight: 700;"
      >
        {{ completedCount }} / {{ todos.length }}
      </span>
      <ChevronUp
        :size="14"
        :stroke-width="1.6"
        class="transition-transform"
        style="color: var(--nb-ink-faint);"
        :class="open ? '' : 'rotate-180'"
      />
    </button>
    <div v-if="open" class="px-5 pb-3 pt-1">
      <TodoListView :items="todos" />
    </div>
  </div>
</template>
