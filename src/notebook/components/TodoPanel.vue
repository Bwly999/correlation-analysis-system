<script setup lang="ts">
/**
 * TodoPanel.vue
 *
 * §3.1 左下常驻 TODO 面板：折叠 / 展开；展示当前 in_progress 摘要。
 */
import { computed, ref } from 'vue'
import { ListTodo, ChevronUp } from 'lucide-vue-next'
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
    class="border-t border-slate-200 bg-white"
  >
    <button
      class="flex w-full items-center gap-2.5 px-4 py-2 text-left transition hover:bg-slate-50/60"
      @click="open = !open"
    >
      <span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-slate-600">
        <ListTodo :size="13" />
      </span>
      <span class="text-[12.5px] font-semibold tracking-tight text-slate-900">分析计划</span>
      <span
        v-if="inProgress && !open"
        class="truncate text-[12px] text-amber-700"
      >
        · 当前：{{ inProgress.text }}
      </span>
      <span class="flex-1" />
      <span class="font-mono text-[10.5px] uppercase tracking-[0.18em] text-slate-400 tabular-nums">
        {{ completedCount }} / {{ todos.length }}
      </span>
      <ChevronUp :size="13" class="text-slate-400 transition-transform" :class="open ? '' : 'rotate-180'" />
    </button>
    <div v-if="open" class="px-3 pb-3 pt-1">
      <TodoListView :items="todos" />
    </div>
  </div>
</template>
