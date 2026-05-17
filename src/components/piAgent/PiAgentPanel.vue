<script setup lang="ts">
/**
 * Pi Agent 主面板 - 包含消息列表和输入框
 */
import { Bot, CornerDownLeft, Sparkles, Bug } from 'lucide-vue-next'
import { ref } from 'vue'
import { isAgentObservabilityEnabledInDev } from '@/utils/devtoolsEnvironment'
import { usePiAgentStore } from '../../stores/piAgentStore'
import PiAgentMessageList from './PiAgentMessageList.vue'

const store = usePiAgentStore()
const isDev = isAgentObservabilityEnabledInDev()
const showRawContent = ref(false)

function handleSend() {
  if (store.canSend) {
    store.sendMessage()
  }
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    handleSend()
  }
}
</script>

<template>
  <div
    class="pi-agent-panel relative flex h-full flex-col overflow-hidden border-r border-slate-200 bg-[radial-gradient(circle_at_top,_rgba(37,99,235,0.08),_transparent_28%),linear-gradient(180deg,_#f8fafc_0%,_#eef4f8_100%)]"
    @keydown.stop
  >
    <div class="flex items-start justify-between border-b border-slate-200/80 bg-white/70 px-5 py-4 backdrop-blur-xl">
      <div class="flex min-w-0 items-start gap-3">
        <div class="mt-0.5 flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-slate-950 text-blue-300 shadow-[0_18px_30px_-24px_rgba(15,23,42,0.8)]">
          <Bot :size="18" />
        </div>
        <div class="min-w-0">
          <div class="flex items-center gap-2">
            <span class="text-[15px] font-bold tracking-[-0.02em] text-slate-900">Pi Agent</span>
            <span class="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-blue-700">
              <Sparkles :size="11" />
              Workspace
            </span>
            <button
              v-if="isDev"
              class="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition"
              :class="showRawContent ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-slate-200 bg-white text-slate-500 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700'"
              @click="showRawContent = !showRawContent"
            >
              <Bug :size="11" />
              {{ showRawContent ? '关闭原文' : '显示原文' }}
            </button>
          </div>
          <p class="mt-1 text-[12px] leading-5 text-slate-500">
            面向当前工作流的分析与执行助手
          </p>
        </div>
      </div>
      <span
        class="shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-bold"
        :class="{
          'border-slate-200 bg-slate-100 text-slate-600': store.status === 'idle',
          'border-amber-200 bg-amber-50 text-amber-700': store.status === 'connecting',
          'border-blue-200 bg-blue-50 text-blue-700': store.status === 'running',
          'border-emerald-200 bg-emerald-50 text-emerald-700': store.status === 'completed',
          'border-rose-200 bg-rose-50 text-rose-700': store.status === 'failed',
        }"
      >
        {{ store.status === 'idle' ? '就绪' : store.status === 'running' ? '处理中...' : store.status === 'completed' ? '完成' : store.status === 'failed' ? '失败' : '连接中...' }}
      </span>
    </div>

    <PiAgentMessageList :debug-visible="showRawContent" />

    <div class="border-t border-slate-200/80 bg-white/85 px-4 py-4 backdrop-blur-xl">
      <div class="rounded-[22px] border border-slate-200 bg-white shadow-[0_18px_40px_-30px_rgba(15,23,42,0.35)]">
        <textarea
          v-model="store.inputText"
          class="min-h-[88px] w-full resize-none rounded-t-[22px] border-0 bg-transparent px-4 py-3.5 text-[13px] leading-6 text-slate-800 outline-none placeholder:text-slate-400 disabled:cursor-not-allowed disabled:bg-slate-50"
          placeholder="输入你的问题，或让 Pi Agent 帮你分析当前工作流..."
          rows="3"
          :disabled="store.status === 'connecting'"
          @keydown="handleKeydown"
        />
        <div class="flex items-center justify-between border-t border-slate-100 px-3 py-3">
          <div class="flex items-center gap-2 text-[11px] text-slate-500">
            <CornerDownLeft :size="13" class="text-slate-400" />
            Enter 发送，Shift + Enter 换行
          </div>
          <button
            class="inline-flex items-center justify-center rounded-xl bg-slate-950 px-4 py-2.5 text-[13px] font-semibold text-white shadow-[0_18px_32px_-20px_rgba(15,23,42,0.7)] transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
            :disabled="!store.canSend"
            @click="handleSend"
          >
            发送
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
