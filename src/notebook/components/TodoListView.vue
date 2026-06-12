<script setup lang="ts">
/**
 * TodoListView.vue
 * 通用 TODO 列表视图，被 TodoWriteCard 与 TodoPanel（常驻面板）复用。
 *
 * 状态视觉：
 *   - completed → 绿色实心勾
 *   - in_progress → 琥珀色脉冲点 + → 箭头
 *   - pending → 灰色空心圈
 */
import { computed } from 'vue'
import { Check, Circle } from 'lucide-vue-next'
import type { TodoItem } from '../types/messageStream'

const props = defineProps<{
  items: TodoItem[]
  /** 紧凑模式：状态条 / 卡片内嵌 */
  compact?: boolean
}>()

const completedCount = computed(() => props.items.filter((t) => t.state === 'completed').length)
const inProgressItem = computed(() => props.items.find((t) => t.state === 'in_progress'))
</script>

<template>
  <div>
    <ul class="space-y-1">
      <li
        v-for="item in items"
        :key="item.id"
        class="group flex items-start gap-2.5 rounded-md px-2 py-1 transition"
        :class="[
          item.state === 'in_progress'
            ? 'bg-amber-50/60'
            : 'hover:bg-slate-50/60',
        ]"
      >
        <span class="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center">
          <span
            v-if="item.state === 'completed'"
            class="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-white shadow-[0_2px_6px_-2px_rgba(16,185,129,0.6)]"
          >
            <Check :size="10" stroke-width="3" />
          </span>
          <span
            v-else-if="item.state === 'in_progress'"
            class="relative flex h-3 w-3 items-center justify-center"
          >
            <span class="absolute h-3 w-3 animate-ping rounded-full bg-amber-400/50" />
            <span class="h-2 w-2 rounded-full bg-amber-500" />
          </span>
          <Circle v-else :size="13" class="text-slate-300" stroke-width="1.5" />
        </span>
        <span
          class="text-[12.5px] leading-5"
          :class="[
            item.state === 'completed'
              ? 'text-slate-400 line-through decoration-slate-300'
              : item.state === 'in_progress'
              ? 'font-semibold text-amber-900'
              : 'text-slate-700',
          ]"
        >
          {{ item.text }}
        </span>
      </li>
    </ul>
    <div
      v-if="compact && inProgressItem"
      class="mt-1.5 text-[10px] font-mono uppercase tracking-[0.18em] text-slate-400"
    >
      {{ completedCount }} / {{ items.length }} 完成
    </div>
  </div>
</template>
