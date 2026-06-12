<script setup lang="ts">
/**
 * NotebookTopBar.vue
 *
 * §3.2 顶栏：关闭 / 标题（可改）/ 重启 / 下载
 */
import { computed, ref } from 'vue'
import { ArrowLeft, Notebook, RotateCcw, Download, Pencil, Check, X } from 'lucide-vue-next'

const props = defineProps<{
  title: string
  sessionId: string
  /** 当前状态徽章，用色和文案由父组件计算 */
  badgeText: string
  badgeTone: 'idle' | 'loading' | 'running' | 'awaiting_user' | 'completed' | 'failed'
}>()

const emit = defineEmits<{
  close: []
  restart: []
  download: []
  rename: [next: string]
}>()

const editing = ref(false)
const draft = ref(props.title)

const beginEdit = () => {
  draft.value = props.title
  editing.value = true
}

const commit = () => {
  const v = draft.value.trim()
  if (v && v !== props.title) emit('rename', v)
  editing.value = false
}

const cancel = () => {
  editing.value = false
}

const badgeKlass = computed(() => {
  switch (props.badgeTone) {
    case 'loading':
      return 'border-amber-200 bg-amber-50 text-amber-700'
    case 'running':
      return 'border-blue-200 bg-blue-50 text-blue-700'
    case 'awaiting_user':
      return 'border-amber-200 bg-amber-50 text-amber-700'
    case 'failed':
      return 'border-rose-200 bg-rose-50 text-rose-700'
    case 'completed':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700'
    default:
      return 'border-slate-200 bg-slate-50 text-slate-600'
  }
})
</script>

<template>
  <header
    class="flex h-12 shrink-0 items-center justify-between border-b border-slate-200 bg-white/95 px-4 backdrop-blur-md"
  >
    <div class="flex min-w-0 items-center gap-3">
      <button
        class="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 text-[12.5px] font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
        aria-label="关闭笔记本"
        @click="emit('close')"
      >
        <ArrowLeft :size="13" />
        关闭笔记本
      </button>

      <span class="h-5 w-px bg-slate-200" />

      <Notebook :size="14" class="text-blue-600" />

      <div v-if="!editing" class="flex min-w-0 items-center gap-2">
        <span class="truncate text-[13.5px] font-semibold tracking-tight text-slate-900">
          {{ title }}
        </span>
        <button
          class="hidden text-slate-400 transition hover:text-slate-700 md:inline-flex"
          aria-label="重命名"
          @click="beginEdit"
        >
          <Pencil :size="12" />
        </button>
        <span class="font-mono text-[10.5px] uppercase tracking-[0.16em] text-slate-400">
          · {{ sessionId.slice(0, 16) }}
        </span>
      </div>
      <div v-else class="flex items-center gap-1">
        <input
          v-model="draft"
          class="h-7 rounded-md border border-blue-300 bg-white px-2 text-[13px] font-semibold text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          @keydown.enter="commit"
          @keydown.esc="cancel"
        />
        <button class="flex h-7 w-7 items-center justify-center rounded-md text-emerald-600 hover:bg-emerald-50" @click="commit">
          <Check :size="14" />
        </button>
        <button class="flex h-7 w-7 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100" @click="cancel">
          <X :size="14" />
        </button>
      </div>

      <span
        class="ml-1 inline-flex items-center rounded-full border px-2 py-0.5 text-[10.5px] font-semibold tracking-wide"
        :class="badgeKlass"
      >
        {{ badgeText }}
      </span>
    </div>

    <div class="flex items-center gap-2">
      <button
        class="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 text-[12px] font-medium text-slate-600 transition hover:border-amber-300 hover:bg-amber-50 hover:text-amber-700"
        title="重启 Python 环境 (⌘/Ctrl + R)"
        @click="emit('restart')"
      >
        <RotateCcw :size="12" />
        重启
      </button>
      <button
        class="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 text-[12px] font-medium text-slate-600 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
        title="下载工作区 (⌘/Ctrl + S)"
        @click="emit('download')"
      >
        <Download :size="12" />
        下载
      </button>
    </div>
  </header>
</template>
