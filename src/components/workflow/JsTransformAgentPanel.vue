<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, onUnmounted, ref, watch } from 'vue'
import { Bot, CornerDownLeft, MessageSquarePlus, Sparkles, Wrench } from 'lucide-vue-next'
import type {
  JsTransformAgentContext,
  JsTransformAgentSafeDebugResult,
  WorkflowAiModelProfile,
} from '@/ai/types'
import { useJsTransformAgent } from '@/stores/useJsTransformAgent'
import PiAgentThinkingBlock from '../piAgent/PiAgentThinkingBlock.vue'
import PiAgentToolCallCard from '../piAgent/PiAgentToolCallCard.vue'
import PiAgentMarkdownRenderer from '../piAgent/PiAgentMarkdownRenderer.vue'

const props = defineProps<{
  nodeId: string
  code: string
  context: JsTransformAgentContext
  profile: WorkflowAiModelProfile
  outputData: unknown
  errorMessage?: string
  onApplyCode: (code: string) => void
  onDebugNode: (mode: 'reuse_cached_upstream' | 'rerun_upstream') => Promise<JsTransformAgentSafeDebugResult>
}>()

const agent = useJsTransformAgent()
const messagesScrollRef = ref<HTMLElement | null>(null)
const stickToBottom = ref(true)

const statusLabel = computed(() => {
  switch (agent.status.value) {
    case 'connecting':
      return '连接中...'
    case 'running':
      return '处理中...'
    case 'completed':
      return '完成'
    case 'failed':
      return '失败'
    default:
      return '就绪'
  }
})

const placeholder = computed(() =>
  agent.mode.value === 'ask'
    ? '仅问答模式：解释当前输入结构、报错原因或建议代码写法'
    : 'Agent 模式：描述你想实现的转换逻辑，助手会改代码并调试当前节点',
)

const inputTextProxy = computed({
  get: () => agent.inputText.value,
  set: (value: string) => {
    agent.inputText.value = value
  },
})

const isCaretOnFirstLine = (target: HTMLTextAreaElement) =>
  !target.value.slice(0, target.selectionStart).includes('\n')

const isCaretOnLastLine = (target: HTMLTextAreaElement) =>
  !target.value.slice(target.selectionEnd).includes('\n')

const syncContext = () => {
  agent.currentContext.value = props.context
  if (!agent.sessionId.value && agent.currentProfile.value?.id !== props.profile.id) {
    agent.reset()
  }
  agent.currentProfile.value = props.profile
}

const handleSend = async () => {
  const content = agent.inputText.value.trim()
  if (!content) return

  syncContext()
  await agent.sendMessage({
    prompt: content,
    mode: agent.mode.value,
    nodeId: props.nodeId,
    context: props.context,
    profile: props.profile,
  })
}

const handleReset = () => {
  agent.reset()
  agent.mode.value = 'ask'
}

const handleModeSwitch = async (nextMode: 'ask' | 'agent') => {
  if (agent.mode.value === nextMode) return

  const currentText = agent.inputText.value
  agent.mode.value = nextMode

  try {
    await agent.switchMode({
      mode: nextMode,
      nodeId: props.nodeId,
      context: props.context,
      profile: props.profile,
    })
  } catch (error: any) {
    agent.mode.value = nextMode === 'ask' ? 'agent' : 'ask'
    agent.errorMessage.value = error?.message || '切换模式失败'
    agent.inputText.value = currentText
  }
}

const handleComposerKeydown = async (event: KeyboardEvent) => {
  const target = event.target
  if (!(target instanceof HTMLTextAreaElement)) {
    return
  }

  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    await handleSend()
    return
  }

  if (event.key === 'Escape' && agent.status.value === 'running') {
    event.preventDefault()
    event.stopPropagation()
    await agent.cancelCurrentRun()
    return
  }

  if (event.key === 'ArrowUp' && isCaretOnFirstLine(target)) {
    event.preventDefault()
    agent.recallPreviousInput()
    return
  }

  if (event.key === 'ArrowDown' && isCaretOnLastLine(target)) {
    event.preventDefault()
    agent.recallNextInput()
  }
}

const isNearBottom = () => {
  const el = messagesScrollRef.value
  if (!el) return true

  return el.scrollHeight - el.scrollTop - el.clientHeight < 48
}

const scrollToBottom = async () => {
  await nextTick()
  const el = messagesScrollRef.value
  if (!el) return
  el.scrollTop = el.scrollHeight
}

const handleMessagesScroll = () => {
  stickToBottom.value = isNearBottom()
}

const handleToolExecute = async (event: any) => {
  try {
    if (event.toolName === 'js_update_code') {
      const nextCode = typeof event.params?.code === 'string' ? event.params.code : ''
      props.onApplyCode(nextCode)
      await agent.handleToolResult({
        toolCallId: event.toolCallId,
        result: {
          content: [{ type: 'text', text: '当前代码已更新到编辑器' }],
          details: {
            ok: true,
            status: 'success',
            summary: '当前代码已更新到编辑器',
            outputSample: [],
            errorMessage: '',
          },
        },
      })
      return
    }

    if (event.toolName === 'js_debug_node') {
      const result = await props.onDebugNode(event.params?.mode === 'rerun_upstream' ? 'rerun_upstream' : 'reuse_cached_upstream')
      await agent.handleToolResult({
        toolCallId: event.toolCallId,
        result: {
          content: [{ type: 'text', text: result.summary }],
          details: result,
          isError: !result.ok,
        },
      })
      return
    }
  } catch (error: any) {
    const message = error?.message || '工具执行失败'
    await agent.handleToolResult({
      toolCallId: event.toolCallId,
      result: {
        content: [{ type: 'text', text: message }],
        details: {
          ok: false,
          status: 'error',
          summary: message,
          outputSample: [],
          errorMessage: message,
        },
        isError: true,
      },
    })
  }
}

agent.externalEventHandler.value = async (event: any) => {
  if (event.type !== 'tool.execute') {
    return false
  }

  await handleToolExecute(event)
  return true
}

watch(
  () => agent.messages.value.map((message) => `${message.id}:${message.content}:${message.thinking}:${message.toolCalls.map((item) => `${item.id}:${item.status}`).join(',')}`).join('|'),
  async () => {
    if (stickToBottom.value) {
      await scrollToBottom()
    }
  },
  { flush: 'post' },
)

watch(
  () => agent.errorMessage.value,
  async () => {
    if (stickToBottom.value) {
      await scrollToBottom()
    }
  },
)

onMounted(() => {
  scrollToBottom()
})

onUnmounted(() => {
  const el = messagesScrollRef.value
  if (el) {
    el.removeEventListener('scroll', handleMessagesScroll)
  }
})

onBeforeUnmount(() => {
  if (agent.externalEventHandler.value) {
    agent.externalEventHandler.value = null
  }
  const el = messagesScrollRef.value
  if (el) {
    el.removeEventListener('scroll', handleMessagesScroll)
  }
})
</script>

<template>
  <section
    data-testid="js-transform-agent-panel"
    class="flex h-full min-h-0 flex-col overflow-hidden rounded-[24px] border border-blue-200 bg-[radial-gradient(circle_at_top,_rgba(37,99,235,0.08),_transparent_26%),linear-gradient(180deg,_#f8fbff_0%,_#eef6ff_100%)] shadow-[0_24px_44px_-34px_rgba(37,99,235,0.35)]"
  >
    <div class="shrink-0 flex items-start justify-between gap-3 border-b border-blue-100 bg-white/75 px-4 py-4 pr-16 backdrop-blur">
      <div class="flex min-w-0 flex-1 items-start gap-3">
        <div class="flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-slate-950 text-blue-300">
          <Bot :size="18" />
        </div>
        <div class="min-w-0">
          <div class="flex items-center gap-2">
            <span class="text-[15px] font-bold tracking-[-0.02em] text-slate-900">AI 编码助手</span>
            <span class="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-blue-700">
              <Sparkles :size="11" />
              JS Node
            </span>
          </div>
          <p class="mt-1 text-[12px] leading-5 text-slate-500">
            ask 只回答问题，agent 可实时改代码并调试当前节点
          </p>
        </div>
      </div>
      <span
        class="shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-bold"
        :class="{
          'border-slate-200 bg-slate-100 text-slate-600': agent.status.value === 'idle',
          'border-amber-200 bg-amber-50 text-amber-700': agent.status.value === 'connecting',
          'border-blue-200 bg-blue-50 text-blue-700': agent.status.value === 'running',
          'border-emerald-200 bg-emerald-50 text-emerald-700': agent.status.value === 'completed',
          'border-rose-200 bg-rose-50 text-rose-700': agent.status.value === 'failed',
        }"
      >
        {{ statusLabel }}
      </span>
    </div>
    <div
      ref="messagesScrollRef"
      class="min-h-0 flex-1 overflow-y-auto px-4 py-4 custom-scrollbar"
      @scroll="handleMessagesScroll"
    >
      <div
        v-for="message in agent.messages.value"
        :key="message.id"
        class="mb-4 flex flex-col"
        :class="message.role === 'user' ? 'items-end' : 'items-start'"
      >
        <div
          v-if="message.role === 'user'"
          class="max-w-[88%] rounded-[20px] rounded-br-md bg-slate-950 px-4 py-3 text-[13px] leading-6 text-white"
        >
          {{ message.content }}
        </div>

        <div v-else class="max-w-[94%] space-y-2">
          <PiAgentThinkingBlock v-if="message.thinking" :thinking="message.thinking" />
          <PiAgentToolCallCard
            v-for="toolCall in message.toolCalls"
            :key="toolCall.id"
            :tool-call="toolCall as any"
          />
          <div
            v-if="message.content"
            class="rounded-[24px] rounded-tl-md border border-slate-200/80 bg-white/92 px-4 py-4"
          >
            <PiAgentMarkdownRenderer :content="message.content" />
          </div>
        </div>
      </div>

      <div
        v-if="agent.errorMessage.value"
        class="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-[12px] leading-6 text-rose-700"
      >
        {{ agent.errorMessage.value }}
      </div>
    </div>

    <div class="shrink-0 border-t border-blue-100/80 bg-white/85 px-4 py-4">
      <div class="rounded-[22px] border border-slate-200 bg-white">
        <textarea
          v-model="inputTextProxy"
          class="min-h-[88px] w-full resize-none rounded-t-[22px] border-0 bg-transparent px-4 py-3.5 text-[13px] leading-6 text-slate-800 outline-none placeholder:text-slate-400"
          :placeholder="placeholder"
          rows="3"
          @keydown="(event) => void handleComposerKeydown(event)"
        />
        <div class="flex items-center justify-between gap-3 border-t border-slate-100 px-3 py-3">
          <div class="flex min-w-0 flex-1 items-center gap-2">
            <button
              v-tooltip.top="'新建对话'"
              type="button"
              class="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
              @click="handleReset"
            >
              <MessageSquarePlus :size="15" />
            </button>
            <div class="inline-flex shrink-0 items-center rounded-xl border border-slate-200 bg-slate-50 p-1">
              <button
                type="button"
                class="rounded-lg px-3 py-1.5 text-[12px] font-semibold transition"
                :class="agent.mode.value === 'ask'
                  ? 'bg-slate-950 text-white shadow-sm'
                  : 'text-slate-600 hover:text-blue-700'"
                @click="void handleModeSwitch('ask')"
              >
                Ask
              </button>
              <button
                type="button"
                class="rounded-lg px-3 py-1.5 text-[12px] font-semibold transition"
                :class="agent.mode.value === 'agent'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-blue-700'"
                @click="void handleModeSwitch('agent')"
              >
                Agent
              </button>
            </div>
            <div class="hidden min-w-0 max-w-[220px] items-center gap-2 truncate text-[10px] text-slate-500 lg:max-w-[240px] sm:flex">
              <CornerDownLeft :size="13" class="text-slate-400" />
              <span class="truncate">Enter 发送，Shift + Enter 换行，Esc 取消本轮，上下箭头可翻历史</span>
            </div>
          </div>
          <button
            class="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-[13px] font-semibold text-white transition disabled:cursor-not-allowed disabled:bg-slate-300"
            :class="agent.mode.value === 'agent' ? 'bg-blue-600 hover:bg-blue-500' : 'bg-slate-950 hover:bg-slate-800'"
            :disabled="!agent.canSend.value"
            @click="handleSend"
          >
            <Wrench v-if="agent.mode.value === 'agent'" :size="14" />
            <span>{{ '发送' }}</span>
          </button>
        </div>
      </div>
    </div>
  </section>
</template>
