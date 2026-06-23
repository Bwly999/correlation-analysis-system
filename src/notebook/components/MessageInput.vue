<script setup lang="ts">
/**
 * MessageInput.vue
 *
 * 消息输入：悬浮卡片样式（参考 Codex），Enter 发送、Shift/Ctrl+Enter 换行，遇到 ask_user 暂停时禁用。
 *
 * 文件上传（按钮 / 拖拽 / 粘贴）：选中的文件立即经 onAttach 写入 workspace inputs/，
 * 输入框上方以附件 chip 展示；发送时把附件与文本一同 emit 给父级，由 runtime 注入路径提示。
 *
 * 视觉风格 ▸ 圆角白卡 + 柔和阴影；放在消息流底部上方浮起。
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { ArrowUp, Gauge, Lock, Paperclip, Square, X } from 'lucide-vue-next'
import ContextUsagePopover from './ContextUsagePopover.vue'
import FileIcon from './FileIcon.vue'
import type { CompactionRecord, UserAttachment } from '../types/messageStream'

const props = defineProps<{
  /** 当 Agent 在 ask_user 等待回答时禁用 */
  awaitingUser: boolean
  /** 当前 Agent 是否在跑（仅显示状态，不强制禁用，让用户能补刀） */
  agentRunning: boolean
  /** 模型上下文窗口使用情况（每轮结束由后端推送） */
  contextUsage?: {
    tokens: number | null
    contextWindow: number
    percent: number | null
  }
  /** 正在压缩中（圆环叠加脉动指示） */
  compactionInProgress?: boolean
  /** 压缩历史记录（透传给 popover 面板） */
  compactionHistory?: CompactionRecord[]
  /** 是否允许上传附件（demo 模式禁用） */
  canAttach?: boolean
  /** 写入 workspace 并返回附件元数据；若提供且 canAttach 则启用上传 */
  onAttach?: (files: File[]) => Promise<UserAttachment[]>
}>()

const emit = defineEmits<{
  send: [text: string, attachments: UserAttachment[]]
  abort: []
  compact: []
  /** 附件校验/写入失败时通知父级弹 toast */
  attachError: [message: string]
}>()

const text = ref('')
const inputRef = ref<HTMLTextAreaElement | null>(null)

// ── 附件上传 ──────────────────────────────────────────────
// 允许的数据/文本文件扩展名白名单（与 fileImport 节点 + workspace 常见类型对齐）
const ALLOWED_EXTS = ['csv', 'json', 'xlsx', 'xls', 'tsv', 'txt', 'md', 'parquet', 'jsonl']
// 单文件大小上限（与 opfsAccess SINGLE_WRITE_LIMIT_BYTES 一致）
const SINGLE_FILE_LIMIT_BYTES = 50 * 1024 * 1024

const attachments = ref<UserAttachment[]>([])
const isImporting = ref(false)
const isDragOver = ref(false)
const fileInputRef = ref<HTMLInputElement | null>(null)

// 上传 UI 是否开启：仅看 canAttach。未提供 onAttach（demo 模式）时走纯 UI 分支，
// 选中的文件直接生成本地附件元数据展示 chip，不写 workspace。
const attachEnabled = computed(() => props.canAttach !== false)

const placeholder = computed(() => {
  if (props.awaitingUser) return '先回答上面的问题，再继续…'
  if (props.agentRunning) return '可以追加补充——Agent 会读到。'
  return '在这里写下你的目标，或追问、修改假设…'
})

const onKeydown = (e: KeyboardEvent) => {
  // Enter 发送；Ctrl/⌘+Enter 或 Shift+Enter 换行
  if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.isComposing) {
    e.preventDefault()
    onSend()
  }
}

const canSend = computed(() => {
  if (props.awaitingUser) return false
  return text.value.trim().length > 0 || attachments.value.length > 0
})

const onSend = () => {
  if (!canSend.value) return
  emit('send', text.value.trim(), attachments.value.slice())
  text.value = ''
  attachments.value = []
}

// running 或 awaiting_user 时都展示终止按钮：
//   - running → 调后端 abort 终止推理
//   - awaiting_user → 等同于取消当前 ask_user 卡片
const showStop = computed(() => props.agentRunning || props.awaitingUser)

const onAbort = () => {
  if (!showStop.value) return
  emit('abort')
}

const focus = () => {
  inputRef.value?.focus()
}

defineExpose({ focus })

const onCtrlK = (e: KeyboardEvent) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault()
    focus()
  }
}

// ESC 终止：Agent 运行中时随时触发（含输入框聚焦时），不 blur
const onEsc = (e: KeyboardEvent) => {
  if (e.key !== 'Escape') return
  if (!showStop.value) return
  e.preventDefault()
  emit('abort')
}
onMounted(() => {
  window.addEventListener('keydown', onCtrlK)
  window.addEventListener('keydown', onEsc)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onCtrlK)
  window.removeEventListener('keydown', onEsc)
})

const charCount = computed(() => text.value.length)

// ── 上下文窗口使用情况圆环 ──
// 无数据 / tokens 未知（紧凑后、首次响应前）→ 静态灰态图标
const ctxHasValue = computed(
  () => !!props.contextUsage && props.contextUsage.percent != null,
)
const ctxPercent = computed(() => props.contextUsage?.percent ?? 0)
// 使用率分级复用 notebook 现有色板：<60% sage / 60-80% amber / >80% clay
const ctxColor = computed(() => {
  if (!ctxHasValue.value) return 'var(--nb-ink-faint)'
  const p = ctxPercent.value
  if (p >= 80) return 'var(--nb-clay)'
  if (p >= 60) return 'var(--nb-amber)'
  return 'var(--nb-sage)'
})
const formatK = (n: number) => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(n))
const ctxTitle = computed(() => {
  const u = props.contextUsage
  if (!u || u.percent == null) return '上下文使用情况待统计'
  const used = u.tokens != null ? formatK(u.tokens) : '?'
  const win = formatK(u.contextWindow)
  return `上下文 ${u.percent}% · ${used} / ${win} tokens`
})

// ── 附件上传：校验 + 写入 ──────────────────────────────────────────────
const sizeLabel = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

const getExt = (name: string): string => {
  const i = name.lastIndexOf('.')
  return i >= 0 ? name.slice(i + 1).toLowerCase() : ''
}

/** 校验单个文件：扩展名白名单 + 单文件大小。返回错误信息或 null。 */
const validateFile = (file: File): string | null => {
  const ext = getExt(file.name)
  if (!ALLOWED_EXTS.includes(ext)) {
    return `不支持的文件类型：${file.name}（仅支持 ${ALLOWED_EXTS.join(' / ')}）`
  }
  if (file.size > SINGLE_FILE_LIMIT_BYTES) {
    return `文件过大：${file.name}（${sizeLabel(file.size)}，上限 ${sizeLabel(SINGLE_FILE_LIMIT_BYTES)}）`
  }
  if (file.size === 0) {
    return `文件为空：${file.name}`
  }
  return null
}

const ingestFiles = async (fileList: File[] | FileList | null) => {
  if (!fileList || !attachEnabled.value) return
  const files = Array.from(fileList)
  if (files.length === 0) return

  // 先做本地校验，过滤掉非法文件；首个错误推 toast
  const valid: File[] = []
  for (const file of files) {
    const err = validateFile(file)
    if (err) {
      emit('attachError', err)
      continue
    }
    valid.push(file)
  }
  if (valid.length === 0) return

  isImporting.value = true
  try {
    if (props.onAttach) {
      // 真实模式：写 workspace inputs/，返回带真实路径的元数据
      const result = await props.onAttach(valid)
      attachments.value = [...attachments.value, ...result]
    } else {
      // demo 模式：纯 UI，不写文件，直接用 File 信息生成本地附件元数据
      attachments.value = [
        ...attachments.value,
        ...valid.map((file) => ({
          id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          name: file.name,
          path: `inputs/${file.name}`,
          size: file.size,
          mimeType: file.type || undefined,
        })),
      ]
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    emit('attachError', `文件写入失败：${message}`)
  } finally {
    isImporting.value = false
  }
}

const openFilePicker = () => {
  if (!attachEnabled.value || isImporting.value) return
  fileInputRef.value?.click()
}

const onFileInputChange = (e: Event) => {
  const target = e.target as HTMLInputElement
  void ingestFiles(target.files)
  // 清空 input，使相同文件可重复选择
  target.value = ''
}

const onPaste = (e: ClipboardEvent) => {
  if (!attachEnabled.value) return
  const files = e.clipboardData?.files
  if (files && files.length > 0) {
    e.preventDefault()
    void ingestFiles(files)
  }
}

const onDragOver = (e: DragEvent) => {
  if (!attachEnabled.value || isImporting.value) return
  // 仅当拖入的是文件时才高亮
  if (!e.dataTransfer?.types?.includes('Files')) return
  e.preventDefault()
}

const onDrop = (e: DragEvent) => {
  if (!attachEnabled.value) return
  e.preventDefault()
  isDragOver.value = false
  dragCounter.value = 0
  void ingestFiles(e.dataTransfer?.files ?? null)
}

const removeAttachment = (id: string) => {
  attachments.value = attachments.value.filter((a) => a.id !== id)
}

// 拖入计数：dragenter/dragleave 在经过子元素时会成对触发，
// 用计数器避免移入子元素时误判为"离开"导致高亮闪烁。
const dragCounter = ref(0)
const onDragEnterCounted = (e: DragEvent) => {
  if (!attachEnabled.value || isImporting.value) return
  if (!e.dataTransfer?.types?.includes('Files')) return
  e.preventDefault()
  dragCounter.value += 1
  isDragOver.value = true
}
const onDragLeaveCounted = (e: DragEvent) => {
  if (!attachEnabled.value) return
  e.preventDefault()
  dragCounter.value = Math.max(0, dragCounter.value - 1)
  if (dragCounter.value === 0) isDragOver.value = false
}
</script>

<template>
  <div
    class="relative rounded-[var(--nb-radius-lg)] border transition-colors"
    :style="
      isDragOver
        ? {
            borderColor: 'var(--nb-copper)',
            backgroundColor: 'var(--nb-copper-soft)',
            boxShadow: 'var(--nb-shadow-lg), 0 0 0 2px var(--nb-copper-glow)',
          }
        : awaitingUser
          ? {
              borderColor: 'rgba(199, 107, 74, 0.45)',
              backgroundColor: 'var(--nb-card)',
              boxShadow: 'var(--nb-shadow-lg), 0 0 0 1px var(--nb-copper-glow)',
            }
          : {
              borderColor: 'var(--nb-rule-strong)',
              backgroundColor: 'var(--nb-card)',
              boxShadow: 'var(--nb-shadow-lg)',
            }
    "
    @dragenter="onDragEnterCounted"
    @dragover="onDragOver"
    @dragleave="onDragLeaveCounted"
    @drop="onDrop"
  >
    <!-- 附件 chip 列表 -->
    <div
      v-if="attachments.length > 0"
      class="flex flex-wrap gap-1.5 px-3 pt-3"
    >
      <span
        v-for="att in attachments"
        :key="att.id"
        class="group inline-flex items-center gap-1.5 rounded-[var(--nb-radius-xs)] border py-1 pl-1.5 pr-1"
        style="border-color: var(--nb-rule-strong); background-color: var(--nb-overlay);"
      >
        <FileIcon :name="att.name" :size="13" />
        <span
          class="max-w-[180px] truncate text-[11.5px]"
          style="color: var(--nb-ink);"
          :title="att.path"
        >
          {{ att.name }}
        </span>
        <span
          class="nb-mono text-[10px] tabular-nums"
          style="color: var(--nb-ink-faint);"
        >
          {{ sizeLabel(att.size) }}
        </span>
        <button
          class="flex h-4 w-4 items-center justify-center rounded-[var(--nb-radius-xs)] transition"
          style="color: var(--nb-ink-mute);"
          title="移除附件"
          :disabled="isImporting"
          @click="removeAttachment(att.id)"
          @mouseenter="(e) => {
            (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--nb-copper-soft)';
            (e.currentTarget as HTMLElement).style.color = 'var(--nb-copper-deep)'
          }"
          @mouseleave="(e) => {
            (e.currentTarget as HTMLElement).style.backgroundColor = '';
            (e.currentTarget as HTMLElement).style.color = 'var(--nb-ink-mute)'
          }"
        >
          <X :size="11" :stroke-width="2" />
        </button>
      </span>
    </div>

    <textarea
      ref="inputRef"
      v-model="text"
      rows="2"
      :disabled="awaitingUser"
      :placeholder="placeholder"
      class="nb-focus block w-full resize-none rounded-t-[var(--nb-radius-lg)] bg-transparent px-4 pt-3 pb-2 text-[14px] leading-[1.7] outline-none disabled:cursor-not-allowed"
      :class="attachments.length > 0 ? 'rounded-t-none border-t' : ''"
      :style="[
        { color: 'var(--nb-ink)', fontFamily: 'var(--nb-font-sans)' },
        attachments.length > 0
          ? { borderColor: 'var(--nb-rule)' }
          : {},
      ]"
      @keydown="onKeydown"
      @paste="onPaste"
    />
    <!-- 拖拽提示遮罩 -->
    <div
      v-if="isDragOver"
      class="pointer-events-none absolute inset-0 flex items-center justify-center rounded-[var(--nb-radius-lg)]"
      style="background-color: rgba(15, 23, 42, 0.04);"
    >
      <span
        class="nb-eyebrow"
        style="color: var(--nb-copper-deep); font-size: 12px; letter-spacing: 0.1em;"
      >
        松开以导入到 inputs/
      </span>
    </div>
    <div
      class="flex items-center justify-between gap-3 px-3 py-2"
    >
      <div
        class="flex items-center gap-2 nb-mono text-[10.5px]"
        style="color: var(--nb-ink-faint); letter-spacing: 0.06em;"
      >
        <Lock v-if="awaitingUser" :size="10" :stroke-width="1.8" />
        <span v-if="awaitingUser" style="color: var(--nb-copper-deep);">
          等待回答
        </span>
        <span v-else-if="agentRunning">
          Agent 工作中 · <span style="color: var(--nb-clay);">ESC 终止</span>
        </span>
        <span v-else-if="isImporting">正在写入文件…</span>
        <span v-else>Enter 发送 · Shift/Ctrl + Enter 换行 · ⌘ + K 聚焦</span>
        <span v-if="charCount > 0" style="color: var(--nb-rule-strong);">·</span>
        <span v-if="charCount > 0" class="tabular-nums">{{ charCount }} 字</span>
      </div>
      <div class="flex items-center gap-1.5">
        <!-- 隐藏文件选择 input -->
        <input
          ref="fileInputRef"
          type="file"
          multiple
          class="hidden"
          :accept="ALLOWED_EXTS.map((e) => '.' + e).join(',')"
          @change="onFileInputChange"
        >
        <!-- 上传按钮 -->
        <button
          v-if="attachEnabled"
          class="nb-focus inline-flex h-8 w-8 items-center justify-center rounded-full transition disabled:cursor-not-allowed disabled:opacity-40"
          style="color: var(--nb-ink-mute);"
          :title="isImporting ? '正在写入…' : '上传文件到 inputs/'"
          :disabled="isImporting"
          @click="openFilePicker"
          @mouseenter="(e) => {
            if (!isImporting) {
              (e.currentTarget as HTMLElement).style.color = 'var(--nb-copper-deep)';
              (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--nb-copper-soft)'
            }
          }"
          @mouseleave="(e) => {
            (e.currentTarget as HTMLElement).style.color = 'var(--nb-ink-mute)';
            (e.currentTarget as HTMLElement).style.backgroundColor = ''
          }"
        >
          <Paperclip :size="14" :stroke-width="1.8" />
        </button>
        <!-- 上下文窗口使用情况：圆环 Icon + hover 弹出详情面板 -->
        <div class="group relative">
          <span
            class="nb-focus inline-flex h-8 w-8 cursor-help items-center justify-center rounded-full"
            :title="ctxTitle"
            role="img"
            :aria-label="ctxTitle"
          >
            <template v-if="ctxHasValue">
              <!-- 16px 圆环：stroke-dasharray 控制填充弧长 -->
              <svg width="16" height="16" viewBox="0 0 16 16">
                <circle
                  cx="8"
                  cy="8"
                  r="6"
                  fill="none"
                  :stroke="'var(--nb-rule-strong)'"
                  stroke-width="1.6"
                />
                <circle
                  cx="8"
                  cy="8"
                  r="6"
                  fill="none"
                  :stroke="ctxColor"
                  stroke-width="1.6"
                  stroke-linecap="round"
                  :stroke-dasharray="`${(ctxPercent / 100) * 2 * Math.PI * 6} ${2 * Math.PI * 6}`"
                  :transform="'rotate(-90 8 8)'"
                  :style="
                    compactionInProgress
                      ? { animation: 'nb-pulse 1.1s ease-in-out infinite' }
                      : undefined
                  "
                />
              </svg>
            </template>
            <Gauge v-else :size="14" :stroke-width="1.6" style="color: var(--nb-ink-faint);" />
          </span>
          <!-- hover 详情面板：group-hover 触发，鼠标移入面板也能保持显示 -->
          <div
            class="invisible absolute opacity-0 transition-opacity duration-150 group-hover:visible group-hover:opacity-100"
            style="bottom: calc(100% + 8px); right: 0; z-index: 50;"
          >
            <ContextUsagePopover
              :context-usage="contextUsage"
              :compaction-in-progress="!!compactionInProgress"
              :compaction-history="compactionHistory ?? []"
              @compact="emit('compact')"
            />
          </div>
        </div>
        <!-- 终止按钮：Agent 运行中或等待回答时替换发送按钮 -->
        <button
          v-if="showStop"
          class="nb-focus inline-flex h-8 w-8 items-center justify-center rounded-full transition hover:brightness-110 active:brightness-95"
          style="
            background-color: var(--nb-clay);
            color: var(--nb-paper);
            border: 1px solid var(--nb-clay);
            box-shadow: var(--nb-shadow-sm);
          "
          :title="awaitingUser ? '取消该问题 (ESC)' : '终止 (ESC)'"
          aria-label="终止"
          @click="onAbort"
        >
          <Square :size="12" :stroke-width="2.4" fill="currentColor" />
        </button>
        <button
          v-else
          class="nb-focus inline-flex h-8 w-8 items-center justify-center rounded-full transition disabled:cursor-not-allowed"
          :style="
            !canSend
              ? {
                  backgroundColor: 'var(--nb-paper-tint)',
                  color: 'var(--nb-ink-faint)',
                  border: '1px solid var(--nb-rule)',
                }
              : {
                  backgroundColor: 'var(--nb-ink)',
                  color: 'var(--nb-paper)',
                  border: '1px solid var(--nb-ink)',
                }
          "
          :disabled="!canSend"
          :title="awaitingUser ? '等待回答' : '发送 (Enter)'"
          @click="onSend"
        >
          <ArrowUp :size="14" :stroke-width="2.2" />
        </button>
      </div>
    </div>
  </div>
</template>
