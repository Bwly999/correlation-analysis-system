<script setup lang="ts">
/**
 * TablePreview.vue
 *
 * §7.1 表格 viewer：CSV / TSV / Excel 预览。
 *   - 解析：CSV/TSV 用 papaparse（正确处理引号/转义/分隔符），Excel(.xlsx/.xls) 用 SheetJS 读二进制。
 *   - 大数据量：用 @tanstack/vue-virtual 做行虚拟化（固定行高 + windowing，DOM 节点恒定为可视行数）。
 *   - 横向滚动：容器 min-w-0 钉死面板宽度，宽表在内部横向滚动；表头 sticky-top、行号列 sticky-left。
 *
 * 详见 docs/design-doc/notebook-agent/UX与交互.md §7.1。
 */

import { computed, ref } from 'vue'
import { useVirtualizer } from '@tanstack/vue-virtual'

import { parseDelimited, parseWorkbook, type TableModel } from './tableParse'

const props = defineProps<{
  /** 文件文本（CSV/TSV）；Excel 时为空串 */
  content: string
  /** Excel 原始字节；CSV/TSV 时为 null */
  bytes?: Uint8Array | null
  /** 文件路径，用于判定格式 */
  path: string
}>()

// ── 行高 / 列宽 ─────────────────────────────────────────────
const ROW_HEIGHT = 28
const HEADER_HEIGHT = 34
const SAMPLE_FOR_WIDTH = 200 // 采样前 N 行估算列宽
const COL_MIN_PX = 64
const COL_MAX_PX = 320
const ROWNUM_COL_PX = 52

const lowerPath = computed(() => props.path.toLowerCase())
const isExcel = computed(() => lowerPath.value.endsWith('.xlsx') || lowerPath.value.endsWith('.xls'))

// ── 解析（容错：失败进入 error 态，不抛断 UI）────────────────
const parseState = computed<{ table: TableModel | null; error: string | null }>(() => {
  try {
    if (isExcel.value) {
      if (!props.bytes || props.bytes.length === 0) {
        return { table: null, error: null } // 等待字节就绪
      }
      return { table: parseWorkbook(props.bytes), error: null }
    }
    if (!props.content) return { table: null, error: null }
    const source = lowerPath.value.endsWith('.tsv') ? 'tsv' : 'csv'
    return { table: parseDelimited(props.content, source), error: null }
  } catch (err) {
    return { table: null, error: err instanceof Error ? err.message : String(err) }
  }
})

const table = computed(() => parseState.value.table)
const headers = computed(() => table.value?.headers ?? [])
const rows = computed(() => table.value?.rows ?? [])
const totalRows = computed(() => rows.value.length)
const isEmpty = computed(() => table.value !== null && headers.value.length === 0 && totalRows.value === 0)

// ── 列宽：按采样行最大字符宽估算 ─────────────────────────────
const colWidths = computed<number[]>(() => {
  const cols = headers.value
  if (cols.length === 0) return []
  const widths = cols.map((h) => Math.min(COL_MAX_PX, Math.max(COL_MIN_PX, h.length * 8 + 24)))
  const sampleCount = Math.min(SAMPLE_FOR_WIDTH, totalRows.value)
  for (let r = 0; r < sampleCount; r += 1) {
    const row = rows.value[r]
    if (!row) continue
    for (let c = 0; c < cols.length; c += 1) {
      const cell = row[c] ?? ''
      const approx = Math.min(COL_MAX_PX, Math.max(COL_MIN_PX, cell.length * 7 + 24))
      if (approx > widths[c]!) widths[c] = approx
    }
  }
  return widths
})

/** 行号列 + 所有数据列宽度之和：用作内部内容区的固定宽度，
 *  让 sticky 表头/绝对定位行都铺满到完整列宽（而非仅可视视口），保证横向滚动时表头不截断。 */
const bodyWidth = computed(() => ROWNUM_COL_PX + colWidths.value.reduce((a, b) => a + b, 0))

// ── 虚拟化 ──────────────────────────────────────────────────
// 固定行高 + windowing：无论行数多少都用虚拟项渲染，DOM 节点恒定为可视行数。
// 选项包在 computed 里，确保 count（随文件切换变化）能被 vue 适配器 watch 到。
const scrollEl = ref<HTMLElement | null>(null)

const rowVirtualizer = useVirtualizer(
  computed(() => ({
    count: totalRows.value,
    getScrollElement: () => scrollEl.value,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
  })),
)

const renderRows = computed(() =>
  rowVirtualizer.value.getVirtualItems().map((vi) => ({
    index: vi.index,
    cells: rows.value[vi.index] ?? [],
    top: vi.start,
  })),
)

const totalHeight = computed(() => rowVirtualizer.value.getTotalSize())
</script>

<template>
  <!-- min-w-0 钉死面板宽度：宽表在此容器内部横向滚动，不撑开外层 flex -->
  <div class="nb-scroll flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
    <!-- 解析错误 -->
    <div v-if="parseState.error" class="flex flex-1 flex-col items-center justify-center px-6 text-center">
      <p class="nb-display-italic text-[14px]" style="color: var(--nb-ink-mute);">表格解析失败</p>
      <p class="nb-mono mt-2 max-w-md text-[10.5px]" style="color: var(--nb-ink-faint);">
        {{ parseState.error }}
      </p>
    </div>

    <!-- 空态 -->
    <div v-else-if="isEmpty" class="flex flex-1 flex-col items-center justify-center px-6 text-center">
      <p class="nb-display-italic text-[14px]" style="color: var(--nb-ink-mute);">无数据</p>
    </div>

    <template v-else-if="table">
      <!-- 滚动容器：min-w-0 解除 flex 默认 min-width:auto，宽表在此横向滚动而不撑开父级 -->
      <div ref="scrollEl" class="nb-scroll min-h-0 min-w-0 flex-1 overflow-auto">
        <!-- 内容区：固定宽度 = 列宽之和；min-width:100% 保证窄表也铺满容器 -->
        <div class="relative min-w-full" :style="{ width: `${bodyWidth}px` }">
          <!-- 表头：sticky-top 钉顶；width=bodyWidth 保证横向滚动时表头铺满整个列宽而非仅视口 -->
          <div
            class="sticky top-0 z-20 flex"
            :style="{
              width: `${bodyWidth}px`,
              height: `${HEADER_HEIGHT}px`,
              backgroundColor: 'var(--nb-paper-tint)',
            }"
          >
            <!-- 行号表头（sticky-left） -->
            <div
              class="sticky left-0 z-30 flex shrink-0 items-center px-2.5 nb-mono text-[9.5px]"
              :style="{
                width: `${ROWNUM_COL_PX}px`,
                color: 'var(--nb-ink-mute)',
                letterSpacing: '0.18em',
                fontWeight: 700,
                backgroundColor: 'var(--nb-paper-tint)',
                borderBottom: '1px solid var(--nb-rule-strong)',
              }"
            >
              #
            </div>
            <!-- 列表头 -->
            <div
              v-for="(h, i) in headers"
              :key="`h-${i}`"
              class="flex shrink-0 items-center truncate px-2.5 text-[10.5px]"
              :style="{
                width: `${colWidths[i]}px`,
                color: 'var(--nb-ink)',
                letterSpacing: '0.06em',
                fontWeight: 700,
                borderBottom: '1px solid var(--nb-rule-strong)',
                borderLeft: i === 0 ? 'none' : '1px solid var(--nb-rule)',
              }"
              :title="h"
            >
              {{ h }}
            </div>
          </div>

          <!-- 数据行容器：用总高度撑开竖向滚动条，虚拟行 absolute 定位 -->
          <div :style="{ position: 'relative', height: `${totalHeight}px` }">
            <div
              v-for="r in renderRows"
              :key="r.index"
              class="group absolute left-0 flex nb-mono transition"
              :style="{
                top: `${r.top}px`,
                width: `${bodyWidth}px`,
                height: `${ROW_HEIGHT}px`,
              }"
              @mouseenter="(e) => (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--nb-paper-tint)'"
              @mouseleave="(e) => (e.currentTarget as HTMLElement).style.backgroundColor = ''"
            >
              <!-- 行号（sticky-left） -->
              <div
                class="sticky left-0 z-10 flex shrink-0 items-center px-2.5 text-[10px] tabular-nums"
                :style="{
                  width: `${ROWNUM_COL_PX}px`,
                  color: 'var(--nb-ink-faint)',
                  backgroundColor: 'var(--nb-paper)',
                  borderBottom: '1px solid var(--nb-rule)',
                }"
              >
                {{ r.index + 1 }}
              </div>
              <!-- 单元格 -->
              <div
                v-for="(cell, ci) in r.cells"
                :key="ci"
                class="flex shrink-0 items-center truncate px-2.5 text-[10px] tabular-nums"
                :style="{
                  width: `${colWidths[ci]}px`,
                  color: 'var(--nb-ink-soft)',
                  borderBottom: '1px solid var(--nb-rule)',
                  borderLeft: ci === 0 ? 'none' : '1px solid var(--nb-rule)',
                }"
                :title="cell"
              >
                {{ cell }}
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 状态条：显示行数 / 来源 -->
      <div
        class="flex shrink-0 items-center justify-between border-t px-3 py-1.5 nb-mono text-[9.5px]"
        :style="{
          borderColor: 'var(--nb-rule)',
          backgroundColor: 'var(--nb-sidebar)',
          color: 'var(--nb-ink-faint)',
          letterSpacing: '0.08em',
        }"
      >
        <span>{{ headers.length }} 列 · {{ totalRows.toLocaleString() }} 行</span>
        <span class="uppercase" style="letter-spacing: 0.18em; font-weight: 700;">{{ table.source }}</span>
      </div>
    </template>
  </div>
</template>
