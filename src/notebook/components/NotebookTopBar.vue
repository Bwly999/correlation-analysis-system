<script setup lang="ts">
/**
 * NotebookTopBar.vue
 *
 * §3.2 顶栏：关闭 / 标题（可改）/ 重启 / 下载
 *
 * 视觉：暖色纸面 + 衬线显示字 + 铜色品牌点。
 */
import { computed, ref } from 'vue'
import { ArrowLeft, RotateCcw, Download, Pencil, Check, X } from 'lucide-vue-next'

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

const badgeTone = computed(() => {
  switch (props.badgeTone) {
    case 'loading':
    case 'running':
    case 'awaiting_user':
      return 'amber'
    case 'failed':
      return 'clay'
    case 'completed':
      return 'sage'
    default:
      return 'default'
  }
})

const dotColor = computed(() => {
  switch (props.badgeTone) {
    case 'loading':
    case 'running':
      return 'bg-[color:var(--nb-amber)]'
    case 'awaiting_user':
      return 'bg-[color:var(--nb-copper)]'
    case 'failed':
      return 'bg-[color:var(--nb-clay)]'
    case 'completed':
      return 'bg-[color:var(--nb-sage)]'
    default:
      return 'bg-[color:var(--nb-ink-faint)]'
  }
})

const isLive = computed(() =>
  props.badgeTone === 'running' || props.badgeTone === 'loading',
)
</script>

<template>
  <header
    class="relative z-10 flex h-14 shrink-0 items-center gap-4 border-b px-5"
    style="
      border-color: var(--nb-rule);
      background: linear-gradient(180deg, var(--nb-paper) 0%, var(--nb-paper) 70%, var(--nb-paper-tint) 100%);
    "
  >
    <!-- 关闭 -->
    <button
      class="nb-focus group inline-flex h-8 items-center gap-1.5 rounded-[var(--nb-radius-sm)] border px-2.5 text-[12px] font-medium transition"
      style="border-color: var(--nb-rule); color: var(--nb-ink-mute); background-color: var(--nb-card);"
      aria-label="关闭笔记本"
      @click="emit('close')"
    >
      <ArrowLeft :size="13" :stroke-width="1.8" />
      <span>返回</span>
    </button>

    <!-- 品牌点：铜色三角形 + Notebook 字样 -->
    <div class="flex items-center gap-2.5">
      <span
        class="flex h-7 w-7 items-center justify-center rounded-[var(--nb-radius-xs)]"
        style="background-color: var(--nb-ink); color: var(--nb-paper);"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M2 1.5h7l3 3v8H2V1.5z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round" />
          <path d="M9 1.5v3h3" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round" />
          <path d="M4.6 7.5h4.8M4.6 9.6h3.2" stroke="var(--nb-copper)" stroke-width="1.2" stroke-linecap="round" />
        </svg>
      </span>
      <div class="flex flex-col leading-tight">
        <span
          class="nb-eyebrow"
          style="font-size: 9.5px; letter-spacing: 0.26em;"
        >
          NOTEBOOK
        </span>
        <span class="nb-display text-[11px] italic" style="color: var(--nb-ink-mute); font-weight: 400;">
          analyse · explain · report
        </span>
      </div>
    </div>

    <span class="h-6 w-px" style="background-color: var(--nb-rule);" />

    <!-- 标题 -->
    <div v-if="!editing" class="group flex min-w-0 flex-1 items-center gap-2">
      <h1
        class="nb-display truncate text-[18px] font-medium"
        style="color: var(--nb-ink); letter-spacing: -0.01em;"
      >
        {{ title }}
      </h1>
      <button
        class="nb-focus inline-flex h-6 w-6 items-center justify-center rounded-[var(--nb-radius-xs)] opacity-0 transition group-hover:opacity-100"
        style="color: var(--nb-ink-faint);"
        aria-label="重命名"
        @click="beginEdit"
      >
        <Pencil :size="12" :stroke-width="1.6" />
      </button>
      <span
        class="nb-mono text-[10.5px]"
        style="color: var(--nb-ink-faint); letter-spacing: 0.06em;"
      >
        / {{ sessionId.slice(0, 14) }}
      </span>
    </div>
    <div v-else class="flex flex-1 items-center gap-1.5">
      <input
        v-model="draft"
        class="nb-display nb-focus h-8 flex-1 max-w-md rounded-[var(--nb-radius-sm)] border bg-transparent px-2.5 text-[17px] font-medium outline-none"
        style="border-color: var(--nb-copper); color: var(--nb-ink);"
        @keydown.enter="commit"
        @keydown.esc="cancel"
      />
      <button
        class="flex h-7 w-7 items-center justify-center rounded-[var(--nb-radius-xs)]"
        style="color: var(--nb-sage); background-color: var(--nb-sage-soft);"
        @click="commit"
      >
        <Check :size="13" :stroke-width="2" />
      </button>
      <button
        class="flex h-7 w-7 items-center justify-center rounded-[var(--nb-radius-xs)]"
        style="color: var(--nb-ink-mute);"
        @click="cancel"
      >
        <X :size="13" :stroke-width="2" />
      </button>
    </div>

    <!-- 状态徽章 -->
    <div
      class="nb-chip"
      :data-tone="badgeTone"
    >
      <span
        class="relative inline-flex h-1.5 w-1.5 items-center justify-center rounded-full"
        :class="dotColor"
      >
        <span
          v-if="isLive"
          class="absolute inset-0 animate-ping rounded-full"
          :class="dotColor"
          style="opacity: 0.5;"
        />
      </span>
      <span class="nb-mono text-[10px]" style="letter-spacing: 0.1em;">{{ badgeText }}</span>
    </div>

    <!-- 操作 -->
    <div class="flex items-center gap-1">
      <button
        class="nb-focus inline-flex h-8 items-center gap-1.5 rounded-[var(--nb-radius-sm)] px-2.5 text-[12px] font-medium transition hover:bg-[color:var(--nb-overlay)]"
        style="color: var(--nb-ink-mute);"
        title="重启 Python 环境 (⌘/Ctrl + R)"
        @click="emit('restart')"
      >
        <RotateCcw :size="13" :stroke-width="1.6" />
        <span>重启</span>
      </button>
      <button
        class="nb-focus inline-flex h-8 items-center gap-1.5 rounded-[var(--nb-radius-sm)] px-2.5 text-[12px] font-medium transition hover:bg-[color:var(--nb-overlay)]"
        style="color: var(--nb-ink-mute);"
        title="下载工作区 (⌘/Ctrl + S)"
        @click="emit('download')"
      >
        <Download :size="13" :stroke-width="1.6" />
        <span>下载</span>
      </button>
    </div>
  </header>
</template>
