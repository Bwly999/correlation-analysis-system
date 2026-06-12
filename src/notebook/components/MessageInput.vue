<script setup lang="ts">
/**
 * MessageInput.vue
 *
 * 消息输入框：Ctrl/⌘+Enter 发送，遇到 ask_user 暂停时禁用。
 *
 * 视觉风格 ▸ 稿纸的最后一行：双线分隔上方稿件，铜色细横线作为输入区域的 baseline。
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
    class="relative px-10 pt-5 pb-6"
    style="background: linear-gradient(180deg, transparent 0%, var(--nb-paper-tint) 100%);"
  >
    <!-- 双线 baseline（编辑稿感） -->
    <div class="mx-auto mb-3 max-w-[680px]">
      <div class="nb-rule-double" />
    </div>

    <div class="mx-auto max-w-[680px]">
      <div class="flex items-center justify-between">
        <span
          class="nb-eyebrow"
          style="
            font-size: 9.5px;
            letter-spacing: 0.26em;
            color: var(--nb-ink-mute);
          "
        >
          Compose / 撰写
        </span>
        <div
          class="flex items-center gap-2 nb-mono text-[10px]"
          style="color: var(--nb-ink-faint); letter-spacing: 0.06em;"
        >
          <Lock v-if="awaitingUser" :size="10" :stroke-width="1.8" />
          <span v-if="awaitingUser" style="color: var(--nb-copper-deep);">
            等待回答
          </span>
          <span v-else>⌘ + Enter 发送 · ⌘ + K 聚焦</span>
        </div>
      </div>

      <div
        class="mt-2 rounded-[3px] border transition-colors"
        :style="
          awaitingUser
            ? {
                borderColor: 'rgba(204, 120, 92, 0.4)',
                backgroundColor: 'var(--nb-copper-soft)',
              }
            : {
                borderColor: 'var(--nb-rule-strong)',
                backgroundColor: 'var(--nb-card)',
              }
        "
      >
        <textarea
          ref="inputRef"
          v-model="text"
          rows="2"
          :disabled="awaitingUser"
          :placeholder="placeholder"
          class="nb-focus block w-full resize-none rounded-t-[3px] bg-transparent px-4 py-3 text-[14px] leading-[1.7] outline-none disabled:cursor-not-allowed"
          style="
            color: var(--nb-ink);
            font-family: var(--nb-font-sans);
          "
          @keydown="onKeydown"
        />
        <div
          class="flex items-center justify-between gap-3 border-t px-3 py-2"
          style="border-color: var(--nb-rule);"
        >
          <span
            class="nb-mono text-[10px] tabular-nums"
            style="color: var(--nb-ink-faint); letter-spacing: 0.04em;"
          >
            {{ charCount }} 字
          </span>
          <button
            class="nb-focus inline-flex items-center gap-1.5 rounded-[3px] px-3 py-1.5 text-[12px] font-semibold transition disabled:cursor-not-allowed"
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
            @click="onSend"
          >
            <span>发送</span>
            <ArrowUp :size="12" :stroke-width="2" />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
