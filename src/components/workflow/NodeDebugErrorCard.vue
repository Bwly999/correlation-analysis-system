<script setup lang="ts">
import { AlertCircle, RotateCcw, Radar, ScrollText } from 'lucide-vue-next'

const props = defineProps<{
  message: string
  disabled?: boolean
}>()

const emit = defineEmits<{
  retry: []
  rerunUpstream: []
  openLogs: []
}>()
</script>

<template>
  <section
    data-testid="node-debug-error-card"
    class="node-debug-error-card rounded-[22px] border border-rose-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(255,241,242,0.96)_100%)] px-4 py-4 shadow-[0_18px_34px_rgba(244,63,94,0.10)]"
  >
    <div class="flex items-start gap-3">
      <div
        class="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-rose-200/80 bg-white text-rose-500 shadow-[0_10px_24px_rgba(251,113,133,0.14)]"
      >
        <AlertCircle :size="18" />
      </div>

      <div class="min-w-0 flex-1">
        <div class="flex flex-wrap items-center gap-2">
          <span
            class="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.22em] text-rose-600"
          >
            调试诊断
          </span>
          <h3 class="text-sm font-semibold text-slate-900">本次调试失败</h3>
        </div>

        <p class="mt-2 whitespace-pre-wrap break-words text-[13px] leading-6 text-slate-700">
          {{ props.message }}
        </p>
        <p class="mt-2 text-[12px] leading-5 text-slate-500">
          请先检查当前节点参数、字段映射或上游输入，再继续调试。
        </p>
      </div>
    </div>

    <div class="mt-4 flex flex-wrap items-center gap-2">
      <button
        type="button"
        class="inline-flex h-10 items-center gap-2 rounded-xl bg-slate-900 px-4 text-[12px] font-semibold text-white shadow-[0_12px_24px_rgba(15,23,42,0.18)] transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
        :disabled="props.disabled"
        @click="emit('retry')"
      >
        <RotateCcw :size="14" />
        重新调试
      </button>

      <button
        type="button"
        class="inline-flex h-10 items-center gap-2 rounded-xl border border-amber-200 bg-white px-4 text-[12px] font-semibold text-amber-700 shadow-[0_10px_20px_rgba(245,158,11,0.10)] transition hover:border-amber-300 hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-60"
        :disabled="props.disabled"
        @click="emit('rerunUpstream')"
      >
        <Radar :size="14" />
        重跑上游后调试
      </button>

      <button
        data-testid="node-debug-open-log-button"
        type="button"
        class="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 text-[12px] font-semibold text-slate-700 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
        @click="emit('openLogs')"
      >
        <ScrollText :size="14" />
        查看执行日志
      </button>
    </div>
  </section>
</template>
