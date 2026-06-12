<script setup lang="ts">
/**
 * NotebookLoadingScreen.vue
 *
 * §4 首次加载体验：全屏中心进度卡片阻塞。
 *
 * 视觉风格 ▸ 排版车间——奶油纸面 + 铜色印章 + 渐进的章节进度。
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
    class="absolute inset-0 z-40 flex items-center justify-center"
    style="background-color: rgba(250, 249, 245, 0.96); backdrop-filter: blur(6px);"
  >
    <!-- 背景：极细线条网格（编辑稿尺规感） -->
    <div
      class="pointer-events-none absolute inset-0"
      style="
        opacity: 0.5;
        background-image:
          linear-gradient(rgba(40, 40, 38, 0.06) 1px, transparent 1px),
          linear-gradient(90deg, rgba(40, 40, 38, 0.06) 1px, transparent 1px);
        background-size: 40px 40px;
      "
    />

    <!-- 加载中 -->
    <div
      v-if="phase.kind === 'loading'"
      class="nb-fade-up relative w-[480px] max-w-[90vw] overflow-hidden rounded-[3px] border"
      style="
        background-color: var(--nb-card);
        border-color: var(--nb-rule-strong);
        box-shadow: 0 40px 80px -30px rgba(40, 40, 38, 0.25);
      "
    >
      <!-- 顶部铜色细线 -->
      <div style="height: 3px; background-color: var(--nb-copper);" />

      <div class="px-7 py-7">
        <!-- 章节眉签 -->
        <div class="flex items-center gap-2.5">
          <span
            class="flex h-9 w-9 items-center justify-center rounded-[3px]"
            style="background-color: var(--nb-ink); color: var(--nb-paper);"
          >
            <Loader2 :size="14" :stroke-width="1.8" class="animate-spin" />
          </span>
          <div class="flex-1">
            <div
              class="nb-eyebrow"
              style="font-size: 10px; letter-spacing: 0.26em; color: var(--nb-copper-deep);"
            >
              Notebook · Booting
            </div>
            <div
              class="nb-display mt-0.5 text-[19px] font-medium leading-tight"
              style="color: var(--nb-ink); letter-spacing: -0.012em;"
            >
              准备 Python 环境
            </div>
          </div>
          <span
            class="nb-mono text-[20px] tabular-nums"
            style="color: var(--nb-ink); font-weight: 600; letter-spacing: -0.02em;"
          >
            {{ percent }}<span class="text-[12px]" style="color: var(--nb-ink-faint);">%</span>
          </span>
        </div>

        <!-- 阶段步骤条：编辑稿目录式 -->
        <ol class="mt-7 space-y-2.5">
          <li
            v-for="(stage, i) in stages"
            :key="stage"
            class="flex items-center gap-3"
          >
            <!-- 罗马式编号 -->
            <span
              class="nb-mono w-6 text-[10px] tabular-nums"
              :style="
                i <= stageIndex
                  ? { color: 'var(--nb-copper-deep)', fontWeight: 700, letterSpacing: '0.06em' }
                  : { color: 'var(--nb-ink-faint)', fontWeight: 700, letterSpacing: '0.06em' }
              "
            >
              {{ String(i + 1).padStart(2, '0') }}
            </span>
            <!-- 状态符号 -->
            <span class="flex h-4 w-4 shrink-0 items-center justify-center">
              <span
                v-if="i < stageIndex"
                class="flex h-3.5 w-3.5 items-center justify-center rounded-full"
                style="background-color: var(--nb-sage);"
              >
                <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                  <path
                    d="M1.5 4 L3.2 5.6 L6.5 2.2"
                    stroke="white"
                    stroke-width="1.6"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                </svg>
              </span>
              <span
                v-else-if="i === stageIndex"
                class="relative flex h-3 w-3 items-center justify-center"
              >
                <span
                  class="absolute h-3 w-3 animate-ping rounded-full"
                  style="background-color: var(--nb-copper); opacity: 0.5;"
                />
                <span
                  class="h-2 w-2 rounded-full"
                  style="background-color: var(--nb-copper);"
                />
              </span>
              <span
                v-else
                class="h-2.5 w-2.5 rounded-full border"
                style="border-color: var(--nb-rule-strong);"
              />
            </span>
            <span
              class="text-[12.5px] transition-colors"
              :style="
                i < stageIndex
                  ? { color: 'var(--nb-ink-mute)', textDecoration: 'line-through', textDecorationColor: 'var(--nb-rule-strong)' }
                  : i === stageIndex
                  ? { color: 'var(--nb-ink)', fontWeight: 600 }
                  : { color: 'var(--nb-ink-faint)' }
              "
            >
              {{ stageLabel[stage] }}
            </span>
            <span class="flex-1" />
            <!-- 当前阶段细进度条 -->
            <span
              v-if="i === stageIndex"
              class="relative h-[2px] w-20 overflow-hidden rounded-full"
              style="background-color: var(--nb-copper-soft);"
            >
              <span
                class="absolute inset-y-0 left-0 rounded-full transition-[width] duration-500"
                :style="{ width: percent + '%', backgroundColor: 'var(--nb-copper)' }"
              >
                <span
                  class="absolute inset-0 -translate-x-full"
                  style="
                    background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.55), transparent);
                    animation: nb-shimmer 2s infinite;
                  "
                />
              </span>
            </span>
          </li>
        </ol>

        <!-- 详情 -->
        <div
          class="mt-6 rounded-[3px] border px-3 py-2 nb-mono text-[10.5px]"
          style="
            border-color: var(--nb-rule);
            background-color: var(--nb-paper-tint);
            color: var(--nb-ink-mute);
            letter-spacing: 0.02em;
          "
        >
          <span style="color: var(--nb-ink-faint); font-weight: 700; letter-spacing: 0.14em;">
            DETAIL
          </span>
          <span class="ml-2">{{ detail || '—' }}</span>
        </div>

        <p
          class="nb-display-italic mt-5 text-[12.5px] leading-6"
          style="color: var(--nb-ink-mute);"
        >
          首次加载约需
          <span class="not-italic" style="color: var(--nb-ink); font-weight: 600;">30–90 秒</span>，
          此后浏览器会缓存 wheel 文件，下次秒开。
        </p>

        <div class="mt-5 flex justify-end">
          <button
            class="nb-focus inline-flex items-center gap-1.5 rounded-[3px] border px-3 py-1.5 text-[12px] font-medium transition hover:bg-[color:var(--nb-overlay)]"
            style="border-color: var(--nb-rule); color: var(--nb-ink-mute); background-color: transparent;"
            @click="emit('cancel')"
          >
            <X :size="12" :stroke-width="1.6" />
            取消
          </button>
        </div>
      </div>
    </div>

    <!-- 失败 -->
    <div
      v-else
      class="nb-fade-up relative w-[480px] max-w-[90vw] overflow-hidden rounded-[3px] border"
      style="
        background-color: var(--nb-card);
        border-color: rgba(184, 84, 80, 0.4);
        box-shadow: 0 40px 80px -30px rgba(184, 84, 80, 0.3);
      "
    >
      <div style="height: 3px; background-color: var(--nb-clay);" />
      <div class="px-7 py-7">
        <div class="flex items-start gap-3">
          <span
            class="flex h-9 w-9 shrink-0 items-center justify-center rounded-[3px]"
            style="background-color: var(--nb-clay); color: white;"
          >
            <AlertTriangle :size="14" :stroke-width="1.8" />
          </span>
          <div class="min-w-0 flex-1">
            <div
              class="nb-eyebrow"
              style="font-size: 10px; letter-spacing: 0.26em; color: #8B3A37;"
            >
              Boot Failed
            </div>
            <div
              class="nb-display mt-0.5 text-[19px] font-medium leading-tight"
              style="color: var(--nb-ink); letter-spacing: -0.012em;"
            >
              Python 环境加载失败
            </div>
          </div>
        </div>

        <div
          class="mt-5 rounded-[3px] border px-3 py-2.5 nb-mono text-[11.5px] leading-5"
          style="border-color: rgba(184, 84, 80, 0.3); background-color: var(--nb-clay-soft); color: #6E2D2A;"
        >
          <div style="color: #8B3A37; font-weight: 600;">{{ phase.failure.reason }}</div>
          <div
            v-if="phase.failure.detail"
            class="mt-1 break-all"
            style="color: rgba(110, 45, 42, 0.7);"
          >
            {{ phase.failure.detail }}
          </div>
        </div>

        <p
          class="nb-display-italic mt-5 text-[12.5px] leading-6"
          style="color: var(--nb-ink-mute);"
        >
          如果反复失败，请联系管理员检查 Pyodide 资源是否正确部署，或查看浏览器控制台的网络日志。
        </p>

        <div class="mt-6 flex justify-end gap-2">
          <button
            class="nb-focus inline-flex items-center gap-1.5 rounded-[3px] border px-3 py-1.5 text-[12px] font-medium transition hover:bg-[color:var(--nb-overlay)]"
            style="border-color: var(--nb-rule); color: var(--nb-ink-mute); background-color: transparent;"
            @click="emit('cancel')"
          >
            关闭笔记本
          </button>
          <button
            class="nb-focus inline-flex items-center gap-1.5 rounded-[3px] px-3.5 py-1.5 text-[12px] font-semibold text-white transition"
            style="background-color: var(--nb-ink); border: 1px solid var(--nb-ink);"
            @click="emit('retry')"
          >
            <RefreshCcw :size="12" :stroke-width="1.8" />
            重试
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
