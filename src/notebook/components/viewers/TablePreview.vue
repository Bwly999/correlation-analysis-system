<script setup lang="ts">
/**
 * TablePreview.vue
 *
 * §7.1 CSV/TSV viewer：M1 简单表格（前 50 行）。
 *   第一行作为表头，sticky 固定；行号列与数据列采用 mono 等宽对齐。
 */

import { computed } from 'vue'

const props = defineProps<{
  content: string
}>()

const csvCells = computed<string[][]>(() =>
  props.content
    .split('\n')
    .slice(0, 50)
    .map((line) => line.split(',')),
)
</script>

<template>
  <div class="nb-scroll flex-1 overflow-auto">
    <table class="min-w-full border-separate border-spacing-0 nb-mono text-[11.5px]">
      <thead class="sticky top-0">
        <tr style="background-color: var(--nb-paper-tint);">
          <th
            class="border-b px-2.5 py-2 text-left nb-mono text-[9.5px]"
            style="
              border-color: var(--nb-rule-strong);
              color: var(--nb-ink-mute);
              letter-spacing: 0.18em;
              font-weight: 700;
            "
          >
            #
          </th>
          <th
            v-for="(_h, i) in csvCells[0] || []"
            :key="i"
            class="border-b px-2.5 py-2 text-left text-[10.5px]"
            style="
              border-color: var(--nb-rule-strong);
              color: var(--nb-ink);
              letter-spacing: 0.06em;
              font-weight: 700;
            "
          >
            {{ csvCells[0]?.[i] }}
          </th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="(row, ri) in csvCells.slice(1)"
          :key="ri"
          class="transition"
          @mouseenter="(e) => (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--nb-paper-tint)'"
          @mouseleave="(e) => (e.currentTarget as HTMLElement).style.backgroundColor = ''"
        >
          <td
            class="border-b px-2.5 py-1 text-[10px] tabular-nums"
            style="border-color: var(--nb-rule); color: var(--nb-ink-faint);"
          >
            {{ ri + 1 }}
          </td>
          <td
            v-for="(cell, ci) in row"
            :key="ci"
            class="border-b px-2.5 py-1"
            style="border-color: var(--nb-rule); color: var(--nb-ink-soft);"
          >
            {{ cell }}
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
