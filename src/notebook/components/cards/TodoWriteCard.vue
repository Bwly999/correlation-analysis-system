<script setup lang="ts">
/**
 * TodoWriteCard.vue
 * §5.1.5 todo_write 卡片：折叠卡，展示当前 TODO 列表
 */

import { ListTodo } from 'lucide-vue-next'
import ToolCardShell from './ToolCardShell.vue'
import TodoListView from '../TodoListView.vue'
import type { TodoWriteToolCall } from '../../types/messageStream'

defineProps<{ tool: TodoWriteToolCall }>()
</script>

<template>
  <ToolCardShell
    :status="tool.status"
    tool-name="todo_write"
    :subtitle="`${tool.items.length} 项`"
    :duration-ms="tool.durationMs"
    :default-open="false"
  >
    <template #leadingIcon>
      <span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700">
        <ListTodo :size="13" />
      </span>
    </template>
    <div class="px-3 py-2.5">
      <TodoListView :items="tool.items" />
    </div>
  </ToolCardShell>
</template>
