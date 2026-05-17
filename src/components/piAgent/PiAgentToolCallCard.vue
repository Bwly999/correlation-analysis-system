<script setup lang="ts">
/**
 * Pi Agent 工具调用卡片
 */
import { CheckCircle2, ChevronRight, CircleDot, LoaderCircle, OctagonAlert } from 'lucide-vue-next'
import { ref } from 'vue'
import type { PiAgentToolCall } from '../../stores/piAgentStore'

defineProps<{
  toolCall: PiAgentToolCall
}>()

const expanded = ref(false)
</script>

<template>
  <div
    class="overflow-hidden rounded-2xl border text-[12px] shadow-[0_16px_28px_-28px_rgba(15,23,42,0.45)]"
    :class="{
      'status-running border-amber-200 bg-amber-50/70': toolCall.status === 'running',
      'status-success border-emerald-200 bg-emerald-50/70': toolCall.status === 'success',
      'status-failed border-rose-200 bg-rose-50/70': toolCall.status === 'failed',
    }"
  >
    <button
      class="flex w-full items-center gap-2 px-3.5 py-3 text-left"
      @click="expanded = !expanded"
    >
      <span
        class="flex h-7 w-7 items-center justify-center rounded-xl border bg-white"
        :class="{
          'border-amber-200 text-amber-600': toolCall.status === 'running',
          'border-emerald-200 text-emerald-600': toolCall.status === 'success',
          'border-rose-200 text-rose-600': toolCall.status === 'failed',
        }"
      >
        <LoaderCircle v-if="toolCall.status === 'running'" :size="14" class="animate-spin" />
        <CheckCircle2 v-else-if="toolCall.status === 'success'" :size="14" />
        <OctagonAlert v-else-if="toolCall.status === 'failed'" :size="14" />
      </span>
      <div class="min-w-0 flex-1">
        <div class="truncate font-semibold text-slate-800">{{ toolCall.displayName }}</div>
        <div class="mt-0.5 flex items-center gap-1.5 text-[11px]" :class="{
          'text-amber-700': toolCall.status === 'running',
          'text-emerald-700': toolCall.status === 'success',
          'text-rose-700': toolCall.status === 'failed',
        }">
          <CircleDot :size="10" />
          {{ toolCall.status === 'running' ? '执行中' : toolCall.status === 'success' ? '已完成' : '执行失败' }}
        </div>
      </div>
      <ChevronRight
        :size="14"
        class="shrink-0 text-slate-400 transition"
        :class="expanded ? 'rotate-90' : ''"
      />
    </button>
    <div
      v-if="expanded"
      class="border-t border-slate-200/80 bg-white/80 px-3.5 py-3"
    >
      <div v-if="toolCall.args" class="mb-3 last:mb-0">
        <div class="mb-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">参数</div>
        <pre class="overflow-x-auto rounded-xl bg-slate-950 px-3 py-2.5 font-mono text-[11px] leading-5 text-slate-100">{{ JSON.stringify(toolCall.args, null, 2) }}</pre>
      </div>
      <div v-if="toolCall.result">
        <div class="mb-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">结果</div>
        <pre
          class="overflow-x-auto rounded-xl px-3 py-2.5 font-mono text-[11px] leading-5"
          :class="toolCall.isError ? 'bg-rose-50 text-rose-700' : 'bg-slate-100 text-slate-700'"
        >{{ toolCall.result }}</pre>
      </div>
    </div>
  </div>
</template>
