<script setup lang="ts">
/**
 * FsEditCard.vue
 * §5.1.2 fs_edit 卡片：默认收起，头部展示双数字徽章（+新增/−删减，补间动画），
 * 点击展开显示 oldStr→newStr 的行级 diff（红删绿增，统一 inline 视图）。
 */
import { computed } from 'vue'
import { diffLines, type Change } from 'diff'
import { FileEdit } from 'lucide-vue-next'
import ToolCardShell from './ToolCardShell.vue'
import LineCountBadge from './LineCountBadge.vue'
import type { FsEditToolCall } from '../../types/messageStream'

const props = defineProps<{
  tool: FsEditToolCall
}>()

const subtitle = computed(() => props.tool.path)

/** 一行 diff 的渲染态 */
interface DiffRow {
  /** + 新增 / - 删减 / 空 上下文 */
  type: 'add' | 'remove' | 'context'
  text: string
}

/** 把 diffLines 的 Change[] 展平成逐行行（value 含尾部换行，split 后去掉末尾空串） */
const diffRows = computed<DiffRow[]>(() => {
  const changes: Change[] = diffLines(props.tool.oldStr, props.tool.newStr)
  const rows: DiffRow[] = []
  for (const change of changes) {
    const type: DiffRow['type'] = change.added
      ? 'add'
      : change.removed
        ? 'remove'
        : 'context'
    // change.value 以 \n 结尾时 split 末尾会产生空串，用末尾换行判断后截断
    const value = change.value.endsWith('\n') ? change.value.slice(0, -1) : change.value
    for (const text of value.split('\n')) {
      rows.push({ type, text })
    }
  }
  return rows
})

/** 上下文（既非增也非删的行）过多时折叠，只保留变更附近若干行，避免大文件铺满 */
const COMPACT_CONTEXT = 2
const compactRows = computed<DiffRow[]>(() => {
  const rows = diffRows.value
  if (rows.length === 0) return rows
  // 找出所有变更行索引
  const changeIdx: number[] = []
  rows.forEach((r, i) => {
    if (r.type !== 'context') changeIdx.push(i)
  })
  // 无变更或变更少 → 不折叠
  if (changeIdx.length === 0) return rows
  const keep = new Set<number>()
  for (const idx of changeIdx) {
    for (let j = idx - COMPACT_CONTEXT; j <= idx + COMPACT_CONTEXT; j++) {
      if (j >= 0 && j < rows.length) keep.add(j)
    }
  }
  // 连续区间合并；区间之间插入省略占位行
  const result: DiffRow[] = []
  let prev = -1
  const sortedIdx = [...keep].sort((a, b) => a - b)
  for (const idx of sortedIdx) {
    if (prev !== -1 && idx > prev + 1) {
      const gap = idx - prev - 1
      result.push({ type: 'context', text: `··· 省略 ${gap} 行上下文 ···` })
    }
    result.push(rows[idx]!)
    prev = idx
  }
  // 头尾省略
  if (sortedIdx[0]! > 0) {
    result.unshift({ type: 'context', text: `··· 省略 ${sortedIdx[0]} 行上下文 ···` })
  }
  if (sortedIdx[sortedIdx.length - 1]! < rows.length - 1) {
    const tail = rows.length - 1 - sortedIdx[sortedIdx.length - 1]!
    result.push({ type: 'context', text: `··· 省略 ${tail} 行上下文 ···` })
  }
  return result
})

const rowStyle = (row: DiffRow) => {
  switch (row.type) {
    case 'add':
      return 'background-color: var(--nb-sage-soft); color: var(--nb-sage);'
    case 'remove':
      return 'background-color: var(--nb-clay-soft); color: var(--nb-clay);'
    default:
      return 'color: var(--nb-ink-mute);'
  }
}
const rowSign = (row: DiffRow) => (row.type === 'add' ? '+' : row.type === 'remove' ? '−' : ' ')
</script>

<template>
  <ToolCardShell
    :status="tool.status"
    tool-name="fs_edit"
    :subtitle="subtitle"
    :duration-ms="tool.durationMs"
    :default-open="false"
  >
    <template #leadingIcon>
      <span
        class="flex h-6 w-6 shrink-0 items-center justify-center rounded-[3px] border"
        style="border-color: var(--nb-rule); background-color: var(--nb-card); color: var(--nb-ink);"
      >
        <FileEdit :size="12" :stroke-width="1.6" />
      </span>
    </template>

    <template #headerExtra>
      <LineCountBadge :added="tool.addedLines" :removed="tool.removedLines" />
    </template>

    <div class="space-y-2 px-3 py-2.5">
      <div
        v-if="tool.status === 'failed'"
        class="rounded-[3px] border px-3 py-2 text-[12px]"
        style="border-color: rgba(184, 84, 80, 0.3); background-color: var(--nb-clay-soft); color: #8B3A37;"
      >
        <div class="font-medium">编辑失败</div>
        <div class="mt-0.5 nb-mono text-[11px] leading-5" style="color: #6E2D2A;">
          {{ tool.errorMessage }}
        </div>
      </div>

      <div
        v-else
        class="nb-scroll overflow-auto rounded-[3px] border"
        style="border-color: var(--nb-rule); background-color: var(--nb-card); max-height: 360px;"
      >
        <div
          class="flex items-center gap-2 px-2.5 py-1.5 nb-mono text-[10px] border-b"
          style="color: var(--nb-ink-faint); letter-spacing: 0.14em; font-weight: 700; border-color: var(--nb-rule);"
        >
          <span style="color: var(--nb-sage);">+ 新增</span>
          <span style="color: var(--nb-clay);">− 删减</span>
        </div>
        <pre
          class="nb-mono text-[11.5px] leading-5 px-2 py-1.5"
          style="color: var(--nb-ink-soft);"
        ><span
  v-for="(row, i) in compactRows"
  :key="i"
  class="block whitespace-pre-wrap break-words"
  :style="rowStyle(row)"
><span class="select-none" style="display: inline-block; width: 1ch;">{{ rowSign(row) }}</span>{{ row.text }}</span></pre>
      </div>
    </div>
  </ToolCardShell>
</template>
