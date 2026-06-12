<script setup lang="ts">
/**
 * MessageInput.vue
 * 消息输入框：Ctrl/⌘+Enter 发送，遇到 ask_user 暂停时禁用。
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { CornerDownLeft, Send, Lock } from 'lucide-vue-next'

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
  if (props.awaitingUser) return 'Agent 在等你回答上面的问题…'
  if (props.agentRunning) return 'Agent 正在分析…可以追加补充'
  return '描述目标，或追问、修改假设…  (⌘/Ctrl + Enter 发送)'
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
</script>

<template>
  <div class="border-t border-slate-200 bg-white/85 px-4 py-3 backdrop-blur">
    <div
      class="rounded-2xl border bg-white shadow-[0_18px_40px_-30px_rgba(15,23,42,0.35)] transition-colors"
      :class="awaitingUser ? 'border-amber-200/80 bg-amber-50/40' : 'border-slate-200 focus-within:border-blue-300'"
    >
      <textarea
        ref="inputRef"
        v-model="text"
        rows="2"
        :disabled="awaitingUser"
        :placeholder="placeholder"
        class="block w-full resize-none rounded-t-2xl bg-transparent px-4 py-3 text-[13px] leading-6 text-slate-800 outline-none placeholder:text-slate-400 disabled:cursor-not-allowed disabled:text-slate-400"
        @keydown="onKeydown"
      />
      <div class="flex items-center justify-between gap-3 border-t border-slate-100 px-3 py-2">
        <div class="flex items-center gap-1.5 text-[11px] text-slate-500">
          <Lock v-if="awaitingUser" :size="12" class="text-amber-500" />
          <CornerDownLeft v-else :size="12" class="text-slate-400" />
          <span v-if="awaitingUser" class="text-amber-700">先回答 Agent 的问题</span>
          <span v-else>
            ⌘/Ctrl + Enter 发送，⌘/Ctrl + K 聚焦
          </span>
        </div>
        <button
          class="inline-flex items-center gap-1.5 rounded-xl bg-slate-950 px-3.5 py-1.5 text-[12.5px] font-semibold text-white shadow-[0_18px_32px_-20px_rgba(15,23,42,0.7)] transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
          :disabled="!text.trim() || awaitingUser"
          @click="onSend"
        >
          <Send :size="13" />
          发送
        </button>
      </div>
    </div>
  </div>
</template>
