<script setup lang="ts">
/**
 * TodoListView.vue
 *
 * 通用 TODO 列表视图，被 TodoWriteCard 与 TodoPanel（常驻面板）复用。
 *
 * 状态视觉（编辑稿风）：
 *   - completed → 鼠尾草绿勾，文本 strike-through
 *   - in_progress → 铜色脉冲点 + 加粗
 *   - pending → 暖灰空心圈
 */
import { computed } from 'vue'
import { Check } from 'lucide-vue-next'
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
        v-for="(item, idx) in items"
        :key="item.id"
        class="group flex items-start gap-3 rounded-[3px] px-2 py-1.5 transition"
        :style="
          item.state === 'in_progress'
            ? { backgroundColor: 'var(--nb-copper-soft)' }
            : {}
        "
      >
        <span
          class="nb-mono mt-0.5 w-5 shrink-0 text-[10px] tabular-nums"
          style="color: var(--nb-ink-faint); letter-spacing: 0.04em;"
        >
          {{ String(idx + 1).padStart(2, '0') }}
        </span>
        <span class="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center">
          <span
            v-if="item.state === 'completed'"
            class="flex h-4 w-4 items-center justify-center rounded-full"
            style="background-color: var(--nb-sage); color: white;"
          >
            <Check :size="10" :stroke-width="2.6" />
          </span>
          <span
            v-else-if="item.state === 'in_progress'"
            class="relative flex h-3 w-3 items-center justify-center"
          >
            <span
              class="absolute h-3 w-3 animate-ping rounded-full"
              style="background-color: var(--nb-copper); opacity: 0.5;"
            />
            <span
              class="h-2 w-2 rounded-full"
              style="background-color: var(--nb-copper);"
            />
          </span>
          <span
            v-else
            class="h-3 w-3 rounded-full border"
            style="border-color: var(--nb-rule-strong); background-color: transparent;"
          />
        </span>
        <span
          class="text-[12.5px] leading-5"
          :style="
            item.state === 'completed'
              ? { color: 'var(--nb-ink-faint)', textDecoration: 'line-through', textDecorationColor: 'var(--nb-rule-strong)' }
              : item.state === 'in_progress'
              ? { color: 'var(--nb-copper-deep)', fontWeight: 600 }
              : { color: 'var(--nb-ink-soft)' }
          "
        >
          {{ item.text }}
        </span>
      </li>
    </ul>
    <div
      v-if="compact && inProgressItem"
      class="mt-1.5 nb-mono text-[10px]"
      style="color: var(--nb-ink-faint); letter-spacing: 0.16em; font-weight: 700;"
    >
      {{ completedCount }} / {{ items.length }} 完成
    </div>
  </div>
</template>
