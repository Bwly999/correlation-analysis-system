<script setup lang="ts">
/**
 * NotebookView.vue
 *
 * iframe 内的笔记本主视图（M1 完整版）。
 *
 * 视觉风格 ▸ Editorial Notebook（暖纸 + 衬线 + 铜色），独立于主站工作流的
 *           Slate-50 / Blue-600 SaaS 体系。
 *
 * 布局（§3.1）：
 *   ┌──────────────────────────────────────────────────┐
 *   │ NotebookTopBar                                    │
 *   ├──────────────────────────────────────────────────┤
 *   │ ConnectionBanner (offline 时)                      │
 *   ├────────────────────────────┬─────────────────────┤
 *   │ NotebookMessageStream       │ WorkspaceTree        │
 *   │                            ├─────────────────────┤
 *   │ TodoPanel                   │ FilePreview          │
 *   │ MessageInput                │                      │
 *   ├────────────────────────────┴─────────────────────┤
 *   │ NotebookStatusBar                                 │
 *   └──────────────────────────────────────────────────┘
 */

import { computed, ref, watch } from 'vue'
import { useWorkspaceTree } from '../composables/useWorkspaceTree'
import { useFreshFileTracker } from '../composables/useFreshFileTracker'
import { useNotebookShortcuts } from '../composables/useNotebookShortcuts'
import { useNotebookToasts } from '../composables/useNotebookToasts'
import { resolvePreviewKind } from '../preview/previewRouter'
import { readFile, readBytes, type OpfsDirectoryHandle, type TreeNode } from '../shared/opfsAccess'
import type { NotebookSessionVm, NotebookMessage } from '../types/messageStream'

import NotebookTopBar from './NotebookTopBar.vue'
import NotebookStatusBar from './NotebookStatusBar.vue'
import NotebookLoadingScreen from './NotebookLoadingScreen.vue'
import NotebookMessageStream from './NotebookMessageStream.vue'
import MessageInput from './MessageInput.vue'
import WorkspaceTree from './WorkspaceTree.vue'
import FilePreview from './FilePreview.vue'
import TodoPanel from './TodoPanel.vue'
import ConnectionBanner from './ConnectionBanner.vue'
import NotebookToast from './NotebookToast.vue'
import ConfirmDialog from './ConfirmDialog.vue'

const props = defineProps<{
  opfsRoot: OpfsDirectoryHandle
  session?: NotebookSessionVm
  /** 旧协议兼容：传简单消息列表时自动包装成 session */
  messages?: NotebookMessage[]
}>()

const emit = defineEmits<{
  close: []
  restart: []
  download: []
  rename: [next: string]
  send: [text: string]
  askUserSubmit: [payload: { askId: string; optionId: string; text?: string }]
  askUserCancel: [askId: string]
  stopExec: []
}>()

// ──────────────────────────────────────────────
// session 派生：兼容旧协议
// ──────────────────────────────────────────────
const session = computed<NotebookSessionVm>(() => {
  if (props.session) return props.session
  return {
    sessionId: 'local',
    title: '分析笔记本',
    phase: { kind: 'ready' },
    agent: 'idle',
    runtime: { memoryMb: 0, cellCount: 0, agentSeconds: 0, isRunning: false },
    messages: props.messages ?? [],
    todos: [],
    connection: 'online',
  }
})

const awaitingUser = computed(() => session.value.agent === 'awaiting_user')

// ──────────────────────────────────────────────
// Workspace tree + fresh tracker
// ──────────────────────────────────────────────
const ws = useWorkspaceTree({ root: props.opfsRoot })
void ws.refresh()
const { isFresh } = useFreshFileTracker({ tree: ws.tree })

// ──────────────────────────────────────────────
// 文件预览：选中 / 内容 / 加载状态
// ──────────────────────────────────────────────
const selectedPath = ref<string | null>(null)
const previewLoading = ref(false)
const previewContent = ref('')
const previewBlobUrl = ref<string | null>(null)
const previewMeta = ref<{ size?: number; modifiedAt?: number } | undefined>(undefined)

const findNodeMeta = (path: string): { size?: number; modifiedAt?: number } | undefined => {
  const parts = path.split('/')
  let cursor: TreeNode | undefined = ws.tree.value ?? undefined
  for (const seg of parts) {
    const child = cursor?.children?.find((c) => c.name === seg)
    if (!child) return undefined
    cursor = child
  }
  if (!cursor) return undefined
  return { size: cursor.size, modifiedAt: cursor.modifiedAt }
}

const onSelect = async (path: string) => {
  selectedPath.value = path
  previewLoading.value = true

  if (previewBlobUrl.value) {
    URL.revokeObjectURL(previewBlobUrl.value)
    previewBlobUrl.value = null
  }

  const kind = resolvePreviewKind(path)
  previewMeta.value = findNodeMeta(path)

  try {
    if (kind === 'image') {
      const bytes = await readBytes(props.opfsRoot, path)
      const blob = new Blob([bytes as unknown as ArrayBuffer], { type: inferImageMime(path) })
      previewBlobUrl.value = URL.createObjectURL(blob)
      previewContent.value = previewBlobUrl.value
    } else if (kind === 'meta' || kind === 'parquet-meta') {
      previewContent.value = ''
    } else {
      previewContent.value = await readFile(props.opfsRoot, path)
    }
  } catch (err) {
    previewContent.value = ''
    toasts.push({
      kind: 'error',
      title: '文件读取失败',
      message: err instanceof Error ? err.message : String(err),
    })
  } finally {
    previewLoading.value = false
  }
}

const inferImageMime = (path: string): string => {
  const ext = path.slice(path.lastIndexOf('.')).toLowerCase()
  switch (ext) {
    case '.png':
      return 'image/png'
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.svg':
      return 'image/svg+xml'
    case '.gif':
      return 'image/gif'
    case '.webp':
      return 'image/webp'
    default:
      return 'application/octet-stream'
  }
}

const onDownload = async (path: string) => {
  try {
    const bytes = await readBytes(props.opfsRoot, path)
    const blob = new Blob([bytes as unknown as ArrayBuffer])
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = path.split('/').pop() ?? 'file'
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  } catch (err) {
    toasts.push({
      kind: 'error',
      title: '下载失败',
      message: err instanceof Error ? err.message : String(err),
    })
  }
}

const onCopyPath = async (path: string) => {
  try {
    await navigator.clipboard.writeText(path)
    toasts.push({ kind: 'success', title: '已复制路径', message: path })
  } catch {
    toasts.push({ kind: 'warning', title: '复制失败', message: '请手动选择文本复制' })
  }
}

// ──────────────────────────────────────────────
// 三栏宽度：拖动调宽 + localStorage 记忆
// ──────────────────────────────────────────────
const splitKey = 'notebook:layout:leftRatio'
const leftRatio = ref<number>(
  Number(typeof localStorage !== 'undefined' ? localStorage.getItem(splitKey) : null) || 0.6,
)
watch(leftRatio, (v) => {
  if (typeof localStorage !== 'undefined') localStorage.setItem(splitKey, String(v))
})

const onSplitDrag = (e: PointerEvent) => {
  const root = (e.currentTarget as HTMLElement).closest('[data-split-root]') as HTMLElement | null
  if (!root) return
  const rect = root.getBoundingClientRect()
  const move = (ev: PointerEvent) => {
    const ratio = (ev.clientX - rect.left) / rect.width
    leftRatio.value = Math.max(0.32, Math.min(0.78, ratio))
  }
  const up = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
}

// ──────────────────────────────────────────────
// 顶栏徽章
// ──────────────────────────────────────────────
const badge = computed(() => {
  switch (session.value.agent) {
    case 'running':
      return { text: '运行中', tone: 'running' as const }
    case 'awaiting_user':
      return { text: '等待答复', tone: 'awaiting_user' as const }
    case 'completed':
      return { text: '已完成', tone: 'completed' as const }
    case 'failed':
      return { text: '失败', tone: 'failed' as const }
    default:
      return { text: '空闲', tone: 'idle' as const }
  }
})

// ──────────────────────────────────────────────
// 关闭确认 / 重启确认
// ──────────────────────────────────────────────
const closeConfirmOpen = ref(false)
const restartConfirmOpen = ref(false)

const tryClose = () => {
  if (session.value.runtime.isRunning || session.value.agent === 'running') {
    closeConfirmOpen.value = true
  } else {
    emit('close')
  }
}

const tryRestart = () => {
  restartConfirmOpen.value = true
}

useNotebookShortcuts({
  onClose: tryClose,
  onRestart: tryRestart,
  onDownload: () => emit('download'),
})

const toasts = useNotebookToasts()

defineExpose({
  toasts,
  refreshTree: ws.refresh,
  notifyTree: ws.notify,
})

const onSend = (text: string) => emit('send', text)
</script>

<template>
  <div class="nb-root relative flex h-full w-full flex-col">
    <!-- 全局纸面颗粒 -->
    <div class="nb-grain" />

    <NotebookTopBar
      :title="session.title"
      :session-id="session.sessionId"
      :badge-text="
        session.phase.kind === 'loading' ? '准备 Python 环境' : badge.text
      "
      :badge-tone="session.phase.kind === 'loading' ? 'loading' : badge.tone"
      @close="tryClose"
      @restart="tryRestart"
      @download="emit('download')"
      @rename="(v) => emit('rename', v)"
    />

    <ConnectionBanner :state="session.connection" />

    <!-- 主区：三栏 -->
    <div data-split-root class="relative flex min-h-0 flex-1">
      <!-- 左栏：消息流 + TodoPanel + Input -->
      <section
        class="flex min-h-0 flex-col border-r"
        style="
          flex-basis: 60%;
          background-color: var(--nb-paper);
          border-color: var(--nb-rule);
        "
        :style="{ flexBasis: leftRatio * 100 + '%' }"
        aria-label="消息流"
      >
        <div class="flex min-h-0 flex-1 flex-col">
          <NotebookMessageStream
            class="flex-1 min-h-0"
            :messages="session.messages"
            :session-title="session.title"
            @ask-user-submit="(p) => emit('askUserSubmit', p)"
            @ask-user-cancel="(id) => emit('askUserCancel', id)"
            @open-in-tree="onSelect"
          />
          <TodoPanel :todos="session.todos" />
        </div>
        <MessageInput
          :awaiting-user="awaitingUser"
          :agent-running="session.runtime.isRunning"
          @send="onSend"
        />
      </section>

      <!-- 拖拽分隔条 -->
      <button
        class="group relative w-1 shrink-0 cursor-col-resize transition-colors"
        style="background-color: transparent;"
        aria-label="拖动调整宽度"
        @pointerdown.prevent="onSplitDrag"
      >
        <span
          class="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 transition"
          style="background-color: var(--nb-rule);"
        />
        <span
          class="absolute left-1/2 top-1/2 h-10 w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full transition group-hover:opacity-100"
          style="background-color: var(--nb-copper); opacity: 0;"
        />
      </button>

      <!-- 右栏：Workspace + Preview -->
      <section
        class="flex min-h-0 flex-1 flex-col"
        style="background-color: var(--nb-sidebar);"
        aria-label="Workspace"
      >
        <div class="flex min-h-0 flex-1 flex-col">
          <div
            class="flex min-h-0 basis-[42%] flex-col border-b"
            style="border-color: var(--nb-rule);"
          >
            <WorkspaceTree
              :tree="ws.tree.value"
              :selected-path="selectedPath"
              :is-fresh="isFresh"
              @select="onSelect"
              @download="onDownload"
              @copy-path="onCopyPath"
            />
          </div>
          <div class="flex min-h-0 basis-[58%] flex-col" aria-label="预览">
            <FilePreview
              :selected-path="selectedPath"
              :content="previewContent"
              :loading="previewLoading"
              :meta="previewMeta"
            />
          </div>
        </div>
      </section>
    </div>

    <NotebookStatusBar
      :stats="session.runtime"
      :memory-limit-mb="4096"
      @stop="emit('stopExec')"
    />

    <NotebookLoadingScreen
      :phase="session.phase"
      @retry="emit('restart')"
      @cancel="emit('close')"
    />

    <NotebookToast :toasts="toasts.toasts.value" @dismiss="toasts.dismiss" />

    <ConfirmDialog
      :open="closeConfirmOpen"
      title="Agent 还在工作"
      message="关闭后当前操作会被中断，工作区文件不丢失。下次仍可从顶部菜单进入此 session。"
      confirm-text="仍然关闭"
      cancel-text="取消"
      tone="warning"
      @confirm="closeConfirmOpen = false; emit('close')"
      @cancel="closeConfirmOpen = false"
    />

    <ConfirmDialog
      :open="restartConfirmOpen"
      title="重启 Python 环境？"
      message="重启会销毁当前 kernel，已加载的变量将被清空。Workspace 文件保留。"
      confirm-text="重启"
      cancel-text="取消"
      tone="warning"
      @confirm="restartConfirmOpen = false; emit('restart')"
      @cancel="restartConfirmOpen = false"
    />
  </div>
</template>
