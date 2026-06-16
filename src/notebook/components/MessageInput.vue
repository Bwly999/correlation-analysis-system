<script setup lang="ts">
/**
 * MessageInput.vue
 *
 * 消息输入：悬浮卡片样式（参考 Codex），Enter 发送、Shift/Ctrl+Enter 换行，遇到 ask_user 暂停时禁用。
 *
 * 视觉风格 ▸ 圆角白卡 + 柔和阴影；放在消息流底部上方浮起。
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { ArrowUp, Gauge, Lock } from 'lucide-vue-next'

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
}>()

const emit = defineEmits<{
  send: [text: string]
}>()

const text = ref('')
const inputRef = ref<HTMLTextAreaElement | null>(null)

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

const onSend = () => {
  const v = text.value.trim()
  if (!v || props.awaitingUser) return
  emit('send', v)
  text.value = ''
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
onMounted(() => window.addEventListener('keydown', onCtrlK))
onBeforeUnmount(() => window.removeEventListener('keydown', onCtrlK))

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
</script>

<template>
  <div
    class="rounded-[var(--nb-radius-lg)] border transition-colors"
    :style="
      awaitingUser
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
  >
    <textarea
      ref="inputRef"
      v-model="text"
      rows="2"
      :disabled="awaitingUser"
      :placeholder="placeholder"
      class="nb-focus block w-full resize-none rounded-t-[var(--nb-radius-lg)] bg-transparent px-4 pt-3 pb-2 text-[14px] leading-[1.7] outline-none disabled:cursor-not-allowed"
      style="
        color: var(--nb-ink);
        font-family: var(--nb-font-sans);
      "
      @keydown="onKeydown"
    />
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
        <span v-else>Enter 发送 · Shift/Ctrl + Enter 换行 · ⌘ + K 聚焦</span>
        <span v-if="charCount > 0" style="color: var(--nb-rule-strong);">·</span>
        <span v-if="charCount > 0" class="tabular-nums">{{ charCount }} 字</span>
      </div>
      <div class="flex items-center gap-1.5">
        <!-- 上下文窗口使用情况：圆环 Icon，紧贴发送按钮左侧 -->
        <span
          class="nb-focus inline-flex h-8 w-8 items-center justify-center rounded-full"
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
              />
            </svg>
          </template>
          <Gauge v-else :size="14" :stroke-width="1.6" style="color: var(--nb-ink-faint);" />
        </span>
        <button
          class="nb-focus inline-flex h-8 w-8 items-center justify-center rounded-full transition disabled:cursor-not-allowed"
          :style="
            !text.trim() || awaitingUser
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
          :disabled="!text.trim() || awaitingUser"
          :title="awaitingUser ? '等待回答' : '发送 (Enter)'"
          @click="onSend"
        >
          <ArrowUp :size="14" :stroke-width="2.2" />
        </button>
      </div>
    </div>
  </div>
</template>
