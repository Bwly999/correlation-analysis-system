<script setup lang="ts">
/**
 * NewNotebookDialog.vue
 *
 * 选数据源 dialog（M1 简版）。
 *
 * 输入：available 列表（每项含 id / kind / label / rowCount / columnCount / fields）
 *      调用方负责把画布节点 / 全局数据源 → NotebookDataSource[] 拉好，再传进来
 *
 * 输出：start 事件 → { source: NotebookDataSource }
 *      调用方拿到 source 后再去拉真实数据 + 转 CSV 灌入 NotebookFrame
 */

import { computed, ref, watch } from 'vue'

export interface NotebookDataSource {
  id: string
  kind: 'canvas-node' | 'data-source'
  label: string
  rowCount: number
  columnCount: number
  /** 字段名预览（≤ 5 个） */
  fields?: string[]
}

const props = defineProps<{
  open: boolean
  available: NotebookDataSource[]
}>()

const emit = defineEmits<{
  cancel: []
  start: [source: NotebookDataSource]
  'update:open': [open: boolean]
}>()

const selectedTab = ref<'canvas-node' | 'data-source'>('canvas-node')
const selectedId = ref<string | null>(null)

watch(
  () => props.open,
  (open) => {
    if (!open) {
      selectedId.value = null
    }
  },
)

const visibleList = computed(() =>
  props.available.filter((s) => s.kind === selectedTab.value),
)

const counts = computed(() => ({
  'canvas-node': props.available.filter((s) => s.kind === 'canvas-node').length,
  'data-source': props.available.filter((s) => s.kind === 'data-source').length,
}))

const selected = computed(() =>
  visibleList.value.find((s) => s.id === selectedId.value) ?? null,
)

const onCancel = () => {
  emit('cancel')
  emit('update:open', false)
}

const onStart = () => {
  if (!selected.value) return
  emit('start', selected.value)
  emit('update:open', false)
}
</script>

<template>
  <div
    v-if="open"
    class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40"
    role="dialog"
    aria-label="新建分析笔记本"
    @click.self="onCancel"
  >
    <div
      class="w-[640px] max-w-[90vw] rounded-lg border border-slate-200 bg-white shadow-xl"
    >
      <header class="flex items-center justify-between border-b border-slate-200 px-5 py-3">
        <div class="text-base font-semibold text-slate-900">新建分析笔记本</div>
        <button
          class="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          aria-label="关闭"
          @click="onCancel"
        >×</button>
      </header>
      <div class="px-5 pt-4 pb-2 text-sm font-medium text-slate-700">选择数据来源：</div>
      <div class="flex gap-2 px-5">
        <button
          class="rounded-md border px-3 py-1.5 text-sm font-medium"
          :class="
            selectedTab === 'canvas-node'
              ? 'border-blue-500 bg-blue-50 text-blue-700'
              : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
          "
          @click="selectedTab = 'canvas-node'"
        >画布节点 ({{ counts['canvas-node'] }})</button>
        <button
          class="rounded-md border px-3 py-1.5 text-sm font-medium"
          :class="
            selectedTab === 'data-source'
              ? 'border-blue-500 bg-blue-50 text-blue-700'
              : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
          "
          @click="selectedTab = 'data-source'"
        >全局数据源 ({{ counts['data-source'] }})</button>
      </div>
      <ul class="m-5 max-h-72 overflow-auto rounded-md border border-slate-200">
        <li
          v-for="item in visibleList"
          :key="item.id"
          class="flex cursor-pointer items-start gap-3 border-b border-slate-100 p-3 last:border-b-0 hover:bg-slate-50"
          :class="{ 'bg-blue-50': selectedId === item.id }"
          @click="selectedId = item.id"
        >
          <input
            type="radio"
            class="mt-1"
            :checked="selectedId === item.id"
            :aria-label="item.label"
            @change="selectedId = item.id"
          />
          <div class="flex-1 min-w-0">
            <div class="flex items-center justify-between gap-3">
              <div class="truncate text-sm font-medium text-slate-900">{{ item.label }}</div>
              <div class="shrink-0 text-xs text-slate-500">
                {{ item.rowCount.toLocaleString() }} 行 × {{ item.columnCount }} 列
              </div>
            </div>
            <div v-if="item.fields?.length" class="mt-0.5 truncate text-xs text-slate-500">
              {{ item.fields.slice(0, 5).join(', ') }}
            </div>
          </div>
        </li>
        <li v-if="visibleList.length === 0" class="p-4 text-center text-sm text-slate-500">
          没有可用项
        </li>
      </ul>
      <footer class="flex justify-end gap-2 border-t border-slate-200 px-5 py-3">
        <button
          class="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          @click="onCancel"
        >取消</button>
        <button
          class="rounded-md border border-blue-600 bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-300"
          :disabled="!selected"
          @click="onStart"
        >开始分析</button>
      </footer>
    </div>
  </div>
</template>
