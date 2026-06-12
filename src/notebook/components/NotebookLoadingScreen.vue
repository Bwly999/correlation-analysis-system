<script setup lang="ts">
/**
 * NotebookLoadingScreen.vue
 *
 * §4 首次加载体验：全屏中心进度条阻塞。
 *
 * 输入：
 *   - phase: SessionPhase（loading | failed | ready）
 *   - 完成后由父组件控制 unmount，本组件只负责"加载中/失败"两态。
 *
 * 视觉：
 *   - 主站 Slate-900 + Blue-600 体系
 *   - 中央卡片：阶段标签 + 渐变进度条 + 当前包名
 *   - 极简、克制；动效仅条带流光与点状脉冲，不喧宾夺主
 */

import { computed } from 'vue'
import { Loader2, RefreshCcw, AlertTriangle, X } from 'lucide-vue-next'
import type { SessionPhase, LoadingStage } from '../types/messageStream'

const props = defineProps<{
  phase: SessionPhase
}>()

const emit = defineEmits<{
  retry: []
  cancel: []
}>()

const stageLabel: Record<LoadingStage, string> = {
  load_runtime: '加载 Pyodide 运行时',
  load_packages: '加载科学计算包',
  mount_fs: '挂载工作区文件系统',
  lock_sandbox: '锁定沙箱',
}

const stages: LoadingStage[] = ['load_runtime', 'load_packages', 'mount_fs', 'lock_sandbox']

const stageIndex = computed(() => {
  if (props.phase.kind !== 'loading') return -1
  return stages.indexOf(props.phase.progress.stage)
})

const percent = computed(() => {
  if (props.phase.kind !== 'loading') return 0
  return Math.max(0, Math.min(100, props.phase.progress.percent))
})

const detail = computed(() => {
  if (props.phase.kind !== 'loading') return ''
  return props.phase.progress.detail ?? ''
})
</script>

<template>
  <div
    v-if="phase.kind === 'loading' || phase.kind === 'failed'"
    class="absolute inset-0 z-40 flex items-center justify-center bg-slate-950/[0.96] backdrop-blur-md"
  >
    <!-- 背景细网格 -->
    <div
      class="pointer-events-none absolute inset-0 opacity-[0.06]"
      :style="{
        backgroundImage:
          'linear-gradient(rgba(148,163,184,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.6) 1px, transparent 1px)',
        backgroundSize: '32px 32px',
      }"
    />

    <!-- 加载中 -->
    <div
      v-if="phase.kind === 'loading'"
      class="relative w-[440px] max-w-[90vw] rounded-2xl border border-slate-800/80 bg-slate-900/90 p-7 shadow-[0_60px_120px_-40px_rgba(15,23,42,0.95)]"
    >
      <div class="flex items-center gap-3">
        <span class="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-700/80 bg-slate-950">
          <Loader2 :size="16" class="animate-spin text-blue-400" />
        </span>
        <div>
          <div class="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
            Notebook · Booting
          </div>
          <div class="text-[15px] font-semibold tracking-tight text-slate-100">
            准备 Python 环境
          </div>
        </div>
      </div>

      <!-- 阶段步骤条 -->
      <ol class="mt-6 grid grid-cols-4 gap-1.5">
        <li
          v-for="(stage, i) in stages"
          :key="stage"
          class="space-y-1.5"
        >
          <div
            class="h-[3px] rounded-full transition-colors duration-500"
            :class="
              i < stageIndex
                ? 'bg-emerald-400/80'
                : i === stageIndex
                ? 'bg-gradient-to-r from-blue-500 via-blue-400 to-blue-300'
                : 'bg-slate-800'
            "
          />
          <div
            class="text-[10px] font-medium tracking-wide transition-colors"
            :class="
              i <= stageIndex ? 'text-slate-300' : 'text-slate-600'
            "
          >
            {{ stageLabel[stage] }}
          </div>
        </li>
      </ol>

      <!-- 主进度条 -->
      <div class="mt-7">
        <div class="flex items-end justify-between text-[11px] font-mono text-slate-400">
          <span class="tracking-wide">{{ stageLabel[phase.progress.stage] }}</span>
          <span class="text-slate-200 tabular-nums text-[13px] font-semibold">{{ percent }}%</span>
        </div>
        <div class="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-800/80">
          <div
            class="relative h-full rounded-full bg-gradient-to-r from-blue-600 via-blue-400 to-blue-300 transition-[width] duration-500 ease-out"
            :style="{ width: percent + '%' }"
          >
            <div
              class="absolute inset-0 -translate-x-full animate-[shimmer_2.4s_infinite] bg-gradient-to-r from-transparent via-white/40 to-transparent"
            />
          </div>
        </div>
        <div class="mt-2 truncate text-[11px] text-slate-500 font-mono">
          {{ detail || '—' }}
        </div>
      </div>

      <!-- 文案 -->
      <p class="mt-6 text-[12px] leading-5 text-slate-400">
        首次加载约需 <span class="font-semibold text-slate-200">30–90 秒</span>，
        之后浏览器会缓存 wheel 文件，下次秒开。
      </p>

      <div class="mt-5 flex justify-end">
        <button
          class="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-1.5 text-[12px] font-medium text-slate-300 transition hover:border-slate-600 hover:bg-slate-800 hover:text-slate-100"
          @click="emit('cancel')"
        >
          <X :size="13" />
          取消
        </button>
      </div>
    </div>

    <!-- 失败 -->
    <div
      v-else
      class="relative w-[440px] max-w-[90vw] rounded-2xl border border-rose-900/60 bg-slate-900/95 p-7 shadow-[0_60px_120px_-40px_rgba(15,23,42,0.95)]"
    >
      <div class="flex items-start gap-3">
        <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-rose-700/60 bg-rose-950/40 text-rose-300">
          <AlertTriangle :size="16" />
        </span>
        <div class="min-w-0">
          <div class="text-[10px] font-bold uppercase tracking-[0.18em] text-rose-400/80">
            Boot Failed
          </div>
          <div class="text-[15px] font-semibold tracking-tight text-slate-100">
            Python 环境加载失败
          </div>
        </div>
      </div>

      <div class="mt-5 rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-[12px] font-mono leading-5 text-rose-200">
        <div class="text-rose-300">{{ phase.failure.reason }}</div>
        <div v-if="phase.failure.detail" class="mt-1 text-slate-400 break-all">
          {{ phase.failure.detail }}
        </div>
      </div>

      <p class="mt-5 text-[12px] leading-5 text-slate-400">
        如果反复失败，请联系管理员检查 Pyodide 资源是否正确部署，或查看浏览器控制台的网络日志。
      </p>

      <div class="mt-6 flex justify-end gap-2">
        <button
          class="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-1.5 text-[12px] font-medium text-slate-300 transition hover:border-slate-600 hover:bg-slate-800 hover:text-slate-100"
          @click="emit('cancel')"
        >
          关闭笔记本
        </button>
        <button
          class="inline-flex items-center gap-1.5 rounded-lg border border-blue-500 bg-blue-600 px-3 py-1.5 text-[12px] font-semibold text-white shadow-[0_8px_20px_-12px_rgba(37,99,235,0.8)] transition hover:bg-blue-500"
          @click="emit('retry')"
        >
          <RefreshCcw :size="13" />
          重试
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
@keyframes shimmer {
  0% {
    transform: translateX(-100%);
  }
  100% {
    transform: translateX(100%);
  }
}
</style>
