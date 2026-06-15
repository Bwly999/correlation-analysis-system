<script setup lang="ts">
/**
 * MessageInput.vue
 *
 * 消息输入：悬浮卡片样式（参考 Codex），Ctrl/⌘+Enter 发送，遇到 ask_user 暂停时禁用。
 *
 * 视觉风格 ▸ 圆角白卡 + 柔和阴影；放在消息流底部上方浮起。
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { ArrowUp, Lock } from 'lucide-vue-next'

const props = defineProps<{
  /** 当 Agent 在 ask_user 等待回答时禁用 */
  awaitingUser: boolean
  /** 当前 Agent 是否在跑（仅显示状态，不强制禁用，让用户能补刀） */
  agentRunning: boolean
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
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
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
        <span v-else>⌘ + Enter 发送 · ⌘ + K 聚焦</span>
        <span v-if="charCount > 0" style="color: var(--nb-rule-strong);">·</span>
        <span v-if="charCount > 0" class="tabular-nums">{{ charCount }} 字</span>
      </div>
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
        :title="awaitingUser ? '等待回答' : '发送 (⌘+Enter)'"
        @click="onSend"
      >
        <ArrowUp :size="14" :stroke-width="2.2" />
      </button>
    </div>
  </div>
</template>
