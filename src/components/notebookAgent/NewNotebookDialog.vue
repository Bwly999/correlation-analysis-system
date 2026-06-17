<script setup lang="ts">
/**
 * NewNotebookDialog.vue
 *
 * 「AI分析」选数据入口弹窗。
 *
 * 路径：
 *   - 检测到上次分析仍在运行 → resume（直接恢复，跳过 Pyodide 重启，秒回）
 *   - 选择一个画布节点 → start(source)
 *   - 选择「空白笔记本」 → start(null)（不导入数据直接进入）
 *
 * 视觉：克制，与主站既有弹窗（RuntimeInputModal / WorkflowManagerModal）一致——
 *      PrimeVue Dialog 外壳 + Slate/Blue 调色 + lucide 图标。
 */
import { ref, watch } from 'vue'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import { Sparkles, X, Table2, FilePlus2, History } from 'lucide-vue-next'

export interface NotebookDataSource {
  id: string
  kind: 'canvas-node'
  label: string
  rowCount: number
  columnCount: number
  /** 字段名预览（≤ 5 个） */
  fields?: string[]
}

const props = defineProps<{
  open: boolean
  available: NotebookDataSource[]
  /** 是否有存活的笔记本会话（可恢复）。为真时弹窗顶部展示「继续上次分析」。 */
  hasLiveSession?: boolean
}>()

const emit = defineEmits<{
  cancel: []
  start: [source: NotebookDataSource | null]
  /** 恢复上次仍存活的笔记本会话（keep-alive：直接显示，不重建 Pyodide） */
  resume: []
  'update:open': [open: boolean]
}>()

/** 「空白笔记本」选项的哨兵 id */
const BLANK = '__blank__'

const selectedId = ref<string | null>(null)

watch(
  () => props.open,
  (open) => {
    if (!open) selectedId.value = null
  },
)

const onCancel = () => {
  emit('cancel')
  emit('update:open', false)
}

const onStart = () => {
  if (!selectedId.value) return
  if (selectedId.value === BLANK) {
    emit('start', null)
  } else {
    const source = props.available.find((s) => s.id === selectedId.value)
    if (!source) return
    emit('start', source)
  }
  emit('update:open', false)
}

const onResume = () => {
  emit('resume')
  emit('update:open', false)
}
</script>

<template>
  <Dialog
    :visible="open"
    modal
    :closable="false"
    :draggable="false"
    :style="{ width: 'min(560px, calc(100vw - 32px))' }"
    @update:visible="(v) => !v && onCancel()"
  >
    <template #header>
      <div class="flex w-full items-center justify-between pr-1">
        <div class="flex items-center gap-3">
          <div class="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
            <Sparkles :size="18" :stroke-width="2.5" />
          </div>
          <div class="flex flex-col">
            <span class="text-base font-bold text-slate-900">新建分析笔记本</span>
            <span class="text-xs text-slate-500">导入画布节点数据，或直接进入空白笔记本</span>
          </div>
        </div>
        <button
          type="button"
          class="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-all hover:bg-slate-100 hover:text-slate-600"
          aria-label="关闭"
          @click="onCancel"
        >
          <X :size="18" :stroke-width="2.5" />
        </button>
      </div>
    </template>

    <div class="py-2">
      <!-- 恢复上次分析（keep-alive：有存活会话时展示，秒回，不重建 Pyodide） -->
      <button
        v-if="hasLiveSession"
        type="button"
        class="mb-3 flex w-full items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50/70 p-3 text-left transition-all hover:border-emerald-400 hover:bg-emerald-50"
        @click="onResume"
      >
        <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600">
          <History :size="16" :stroke-width="2" />
        </span>
        <div class="min-w-0 flex-1">
          <div class="text-sm font-semibold text-slate-900">继续上次分析</div>
          <div class="mt-0.5 text-xs text-slate-500">上次的分析仍在运行，直接恢复（秒回）</div>
        </div>
        <span class="shrink-0 rounded-full bg-emerald-600 px-2.5 py-0.5 text-[11px] font-bold text-white">
          推荐
        </span>
      </button>

      <!-- 画布节点 -->
      <div class="mb-2 flex items-center gap-2">
        <span class="text-xs font-semibold tracking-wide text-slate-400">画布节点</span>
        <span class="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
          {{ available.length }}
        </span>
      </div>

      <div v-if="available.length" class="max-h-64 space-y-2 overflow-auto pr-1">
        <button
          v-for="item in available"
          :key="item.id"
          type="button"
          class="group flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-all"
          :class="
            selectedId === item.id
              ? 'border-blue-500 bg-blue-50/70 ring-1 ring-blue-500'
              : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
          "
          @click="selectedId = item.id"
        >
          <span
            class="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors"
            :class="selectedId === item.id ? 'border-blue-600' : 'border-slate-300 group-hover:border-slate-400'"
          >
            <span v-if="selectedId === item.id" class="h-1.5 w-1.5 rounded-full bg-blue-600" />
          </span>
          <span
            class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500 transition-colors group-hover:bg-slate-200"
          >
            <Table2 :size="16" :stroke-width="2" />
          </span>
          <div class="min-w-0 flex-1">
            <div class="truncate text-sm font-semibold text-slate-900">{{ item.label }}</div>
            <div v-if="item.fields?.length" class="mt-0.5 truncate text-xs text-slate-500">
              {{ item.fields.slice(0, 5).join(', ') }}
            </div>
          </div>
          <div class="shrink-0 text-xs tabular-nums text-slate-500">
            {{ item.rowCount.toLocaleString() }} 行 × {{ item.columnCount }} 列
          </div>
        </button>
      </div>

      <div v-else class="rounded-lg border border-dashed border-slate-200 bg-slate-50/50 px-4 py-6 text-center">
        <p class="text-sm text-slate-400">当前画布没有可导入数据的节点</p>
        <p class="mt-0.5 text-xs text-slate-400">可直接进入空白笔记本</p>
      </div>

      <!-- 分隔：或 -->
      <div class="my-3 flex items-center gap-3">
        <div class="h-px flex-1 bg-slate-100" />
        <span class="text-[11px] font-medium text-slate-300">或</span>
        <div class="h-px flex-1 bg-slate-100" />
      </div>

      <!-- 空白笔记本（不导入数据直接进入） -->
      <button
        type="button"
        class="flex w-full items-center gap-3 rounded-lg border border-dashed p-3 text-left transition-all"
        :class="
          selectedId === BLANK
            ? 'border-blue-500 bg-blue-50/70 ring-1 ring-blue-500'
            : 'border-slate-300 bg-white hover:border-blue-400 hover:bg-slate-50'
        "
        @click="selectedId = BLANK"
      >
        <span
          class="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors"
          :class="selectedId === BLANK ? 'border-blue-600' : 'border-slate-300'"
        >
          <span v-if="selectedId === BLANK" class="h-1.5 w-1.5 rounded-full bg-blue-600" />
        </span>
        <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
          <FilePlus2 :size="16" :stroke-width="2" />
        </span>
        <div class="min-w-0 flex-1">
          <div class="text-sm font-semibold text-slate-900">空白笔记本</div>
          <div class="mt-0.5 text-xs text-slate-500">不导入数据，直接进入</div>
        </div>
      </button>
    </div>

    <template #footer>
      <div class="flex w-full items-center justify-end gap-3">
        <Button
          label="取消"
          severity="secondary"
          variant="text"
          class="px-6 font-bold !text-slate-500 hover:!bg-slate-100"
          @click="onCancel"
        />
        <Button
          label="开始分析"
          class="rounded-xl px-8 font-bold shadow-lg shadow-blue-200"
          :disabled="!selectedId"
          @click="onStart"
        />
      </div>
    </template>
  </Dialog>
</template>
