<script setup lang="ts">
/**
 * ContextUsagePopover.vue
 *
 * 悬浮在 MessageInput 圆环上方的「上下文窗口」详情面板。
 *
 * 设计方向：Editorial Notebook 的数据卡片 ——
 *   - 数字主角化：百分比用 Fraunces 衬线大字，明细用 JetBrains Mono
 *   - 压缩时间线：历史条目用铜色竖线串联，把"压缩"变成有叙事感的事件
 *   - 克制精准：不堆动效，靠排版与留白取胜
 *
 * 触发模式：跟随 notebook 现有的纯 CSS group-hover（参考 WorkspaceTree），
 *   不引入 popover 库。父组件用 `group relative` 包裹圆环 + 本组件，
 *   本组件用 group-hover:opacity-100 / visible 控制显隐。
 */
import { computed } from 'vue'
import { Sparkles, History } from 'lucide-vue-next'
import type { CompactionRecord } from '../types/messageStream'

const props = defineProps<{
  /** 模型上下文窗口使用情况（每轮结束由后端推送） */
  contextUsage?: {
    tokens: number | null
    contextWindow: number
    percent: number | null
  }
  /** 正在压缩中（按钮变 loading 态） */
  compactionInProgress: boolean
  /** 压缩历史记录（最近若干条） */
  compactionHistory: CompactionRecord[]
}>()

const emit = defineEmits<{
  compact: []
}>()

// ── 派生：用量展示态 ──
const hasValue = computed(
  () => !!props.contextUsage && props.contextUsage.percent != null,
)
const percent = computed(() => props.contextUsage?.percent ?? 0)
const tokens = computed(() => props.contextUsage?.tokens ?? null)
const contextWindow = computed(() => props.contextUsage?.contextWindow ?? 0)

// 使用率分级（复用 MessageInput 圆环色板逻辑）：<60% sage / 60-80% amber / >80% clay
const tone = computed<'sage' | 'amber' | 'clay'>(() => {
  if (!hasValue.value) return 'sage'
  const p = percent.value
  if (p >= 80) return 'clay'
  if (p >= 60) return 'amber'
  return 'sage'
})
const toneColor = computed(
  () =>
    ({
      sage: 'var(--nb-sage)',
      amber: 'var(--nb-amber)',
      clay: 'var(--nb-clay)',
    })[tone.value],
)

// ── 数字格式化 ──
const formatTokens = (n: number) => {
  if (n >= 1000) return `${Math.round(n / 1000)}k`
  return String(n)
}
const formatPercent = (n: number) => {
  if (n <= 0) return '0'
  if (n < 1) return '<1'
  return Math.round(n).toString()
}

// ── 压缩历史派生 ──
// 反向展示（最新在最上），让用户先看到最近一次压缩
const reversedHistory = computed(() => [...props.compactionHistory].reverse())

const reasonLabel: Record<CompactionRecord['reason'], string> = {
  manual: '手动压缩',
  threshold: '自动压缩',
  overflow: '溢出压缩',
}

const formatRelativeTime = (ts: number): string => {
  const diff = Date.now() - ts
  if (diff < 60_000) return '刚刚'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`
  return `${Math.floor(diff / 86_400_000)} 天前`
}

// ── 圆环：用于面板内的大号视觉锚点（与 MessageInput 小圆环呼应，但更大更精） ──
// 28px viewBox，stroke-width 2.4，与 16px 小圆环保持视觉同源
const RING_RADIUS = 13
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS
const ringDash = computed(() => {
  const p = hasValue.value ? percent.value : 0
  return `${(p / 100) * RING_CIRCUMFERENCE} ${RING_CIRCUMFERENCE}`
})

const onCompact = () => {
  if (props.compactionInProgress) return
  emit('compact')
}
</script>

<template>
  <div
    class="nb-context-popover nb-focus"
    role="dialog"
    aria-label="上下文窗口使用情况"
  >
    <!-- ── 顶部：标题行 ── -->
    <div class="flex items-center justify-between px-4 pt-3 pb-2">
      <span class="nb-eyebrow">上下文窗口</span>
      <span
        v-if="compactionInProgress"
        class="nb-mono text-[10px]"
        style="color: var(--nb-copper-deep); letter-spacing: 0.06em;"
      >
        压缩中…
      </span>
    </div>

    <!-- ── 主区：圆环 + 大号数字 + 明细 ── -->
    <div class="flex items-center gap-4 px-4 pb-3">
      <!-- 大号圆环（28px，与小圆环同源但更精） -->
      <div class="relative flex-shrink-0">
        <svg width="44" height="44" viewBox="0 0 30 30">
          <circle
            cx="15"
            cy="15"
            :r="RING_RADIUS"
            fill="none"
            stroke="var(--nb-rule)"
            stroke-width="2.4"
          />
          <circle
            v-if="hasValue"
            cx="15"
            cy="15"
            :r="RING_RADIUS"
            fill="none"
            :stroke="toneColor"
            stroke-width="2.4"
            stroke-linecap="round"
            :stroke-dasharray="ringDash"
            transform="rotate(-90 15 15)"
            style="transition: stroke-dasharray 600ms cubic-bezier(0.22, 0.61, 0.36, 1);"
          />
        </svg>
        <!-- 圆心数字 -->
        <span
          class="nb-mono absolute inset-0 flex items-center justify-center text-[11px] font-semibold tabular-nums"
          :style="{ color: hasValue ? toneColor : 'var(--nb-ink-faint)' }"
        >
          {{ hasValue ? formatPercent(percent) : '—' }}
        </span>
      </div>

      <!-- 右侧：百分比大字 + 明细 -->
      <div class="flex-1 min-w-0">
        <div class="flex items-baseline gap-1.5">
          <span
            class="nb-display tabular-nums"
            style="font-size: 28px; line-height: 1; font-weight: 500; letter-spacing: -0.02em;"
            :style="{ color: hasValue ? 'var(--nb-ink)' : 'var(--nb-ink-faint)' }"
          >
            {{ hasValue ? formatPercent(percent) : '—' }}
          </span>
          <span
            v-if="hasValue"
            class="text-[12px]"
            style="color: var(--nb-ink-faint);"
          >%</span>
        </div>
        <div
          v-if="hasValue"
          class="nb-mono mt-1 text-[11px] tabular-nums"
          style="color: var(--nb-ink-mute);"
        >
          {{ tokens != null ? formatTokens(tokens) : '?' }} / {{ formatTokens(contextWindow) }} tokens
        </div>
        <div
          v-else
          class="mt-1.5 text-[11px]"
          style="color: var(--nb-ink-faint);"
        >
          等待首轮对话完成
        </div>
      </div>
    </div>

    <!-- ── 分隔线 ── -->
    <div class="nb-rule mx-4" />

    <!-- ── 压缩历史：铜色竖线时间轴 ── -->
    <div class="px-4 py-3">
      <div class="mb-2 flex items-center gap-1.5">
        <History :size="11" :stroke-width="1.8" style="color: var(--nb-ink-mute);" />
        <span class="nb-eyebrow">压缩历史</span>
      </div>

      <!-- 空态 -->
      <div
        v-if="reversedHistory.length === 0"
        class="text-[11.5px] leading-[1.6]"
        style="color: var(--nb-ink-faint);"
      >
        尚未压缩。系统会在接近窗口上限时自动压缩早期对话。
      </div>

      <!-- 时间轴列表 -->
      <ul
        v-else
        class="relative space-y-2 pl-3.5"
      >
        <!-- 铜色竖线（绝对定位在左侧） -->
        <span
          class="absolute left-[3px] top-1.5 bottom-1.5 w-px"
          style="background-color: rgba(199, 107, 74, 0.25);"
        />
        <li
          v-for="(record, index) in reversedHistory"
          :key="record.id"
          class="relative"
        >
          <!-- 节点圆点 -->
          <span
            class="absolute -left-[9px] top-[5px] h-1.5 w-1.5 rounded-full"
            :style="{
              backgroundColor: record.reason === 'manual' ? 'var(--nb-copper)' : 'var(--nb-sage)',
              boxShadow: index === 0 ? '0 0 0 2px var(--nb-card)' : 'none',
            }"
          />
          <div class="flex items-baseline justify-between gap-2">
            <span
              class="text-[11.5px] font-medium"
              :style="{
                color: record.reason === 'manual' ? 'var(--nb-copper-deep)' : 'var(--nb-ink-soft)',
              }"
            >
              {{ reasonLabel[record.reason] }}
            </span>
            <span
              class="nb-mono text-[10px] tabular-nums"
              style="color: var(--nb-ink-faint);"
            >
              {{ formatRelativeTime(record.finishedAt) }}
            </span>
          </div>
          <div
            v-if="record.tokensBefore != null"
            class="nb-mono mt-0.5 text-[10.5px] tabular-nums"
            style="color: var(--nb-ink-mute);"
          >
            压缩前 {{ formatTokens(record.tokensBefore) }} tokens
          </div>
        </li>
      </ul>
    </div>

    <!-- ── 底部：手动压缩按钮 ── -->
    <div class="px-4 pb-3 pt-1">
      <button
        type="button"
        class="nb-focus group/compact flex w-full items-center justify-center gap-2 rounded-[var(--nb-radius-sm)] px-3 py-2 text-[12px] font-medium transition disabled:cursor-not-allowed"
        :style="
          compactionInProgress
            ? {
                backgroundColor: 'var(--nb-paper-tint)',
                color: 'var(--nb-ink-faint)',
                border: '1px solid var(--nb-rule)',
              }
            : {
                backgroundColor: 'var(--nb-copper-soft)',
                color: 'var(--nb-copper-deep)',
                border: '1px solid rgba(199, 107, 74, 0.28)',
              }
        "
        :disabled="compactionInProgress"
        :title="compactionInProgress ? '压缩进行中…' : '用 LLM 总结早期对话，释放上下文空间'"
        @click="onCompact"
      >
        <!-- 压缩中：脉动的小圆点；空闲：Sparkles -->
        <span
          v-if="compactionInProgress"
          class="inline-block h-2 w-2 rounded-full"
          style="background-color: var(--nb-ink-faint); animation: nb-pulse 1.1s ease-in-out infinite;"
        />
        <Sparkles
          v-else
          :size="13"
          :stroke-width="1.8"
          style="color: var(--nb-copper);"
        />
        {{ compactionInProgress ? '压缩中…' : '立即压缩' }}
      </button>
      <p
        class="mt-1.5 text-center text-[10px] leading-[1.5]"
        style="color: var(--nb-ink-faint);"
      >
        手动触发会立即总结早期对话
      </p>
    </div>
  </div>
</template>

<style scoped>
.nb-context-popover {
  /* 定位由父组件控制（MessageInput 用 absolute 包裹）；
     此处只负责视觉：卡片样式 + 入场动效 */
  width: 268px;
  background-color: var(--nb-card);
  border: 1px solid var(--nb-rule-strong);
  border-radius: var(--nb-radius-md);
  box-shadow: var(--nb-shadow-lg);
  /* 防止噪点 / 透底干扰 */
  isolation: isolate;
  /* 入场动效（与 notebook 现有 nb-fade-up 同源） */
  animation: nb-fade-up 180ms cubic-bezier(0.22, 0.61, 0.36, 1);
}

/* 小三角指示器：指向下方圆环 */
.nb-context-popover::after {
  content: '';
  position: absolute;
  bottom: -6px;
  right: 12px;
  width: 10px;
  height: 10px;
  background-color: var(--nb-card);
  border-right: 1px solid var(--nb-rule-strong);
  border-bottom: 1px solid var(--nb-rule-strong);
  transform: rotate(45deg);
  /* 遮住边框下半，形成完整三角 */
  z-index: -1;
}
</style>
