<script setup lang="ts">
/**
 * NotebookSessionsPicker.vue
 *
 * notebook.html 无参数直接访问时的会话列表页。
 *
 * 视觉延续 Editorial Notebook 暖纸风格（与 NotebookConversationSidebar /
 * NotebookTopBar 一致的 CSS 变量）：顶栏品牌点 + 新建按钮，主体为历史会话卡片列表。
 *
 * 三态：loading（骨架）/ 空态（引导新建）/ error（重试）/ 列表（点击进入会话）。
 * 进入会话由父组件（App.vue）通过 enterSession 在 SPA 内切换 mode 完成，
 * 不整页刷新，避免重新加载 Vue app。
 */
import { computed } from 'vue'
import { Plus, RotateCw, Sparkles, MessageSquare, AlertCircle } from 'lucide-vue-next'
import type { NotebookSessionListItem } from '../runtime/notebookAgentClient'

const props = defineProps<{
  /** 历史会话列表（已按 updatedAt 倒序） */
  sessions: NotebookSessionListItem[]
  /** 是否加载中 */
  loading: boolean
  /** 加载失败的错误信息 */
  error?: string
}>()

const emit = defineEmits<{
  select: [sessionId: string]
  create: []
  refresh: []
}>()

/**
 * 相对时间：与 NotebookConversationSidebar 保持同一套口径。
 * 列表渲染时按 updatedAt 计算「刚刚 / X分 / X小时 / X天前」。
 */
const formatRelativeTime = (ts: number): string => {
  const diff = Date.now() - ts
  if (diff < 60_000) return '刚刚'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}分前`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}小时前`
  return `${Math.floor(diff / 86_400_000)}天前`
}

const sortedSessions = computed(() =>
  [...props.sessions].sort((a, b) => b.updatedAt - a.updatedAt),
)

/** 列表项次标题：消息数 + 首条用户消息预览（截断） */
const sessionSubtitle = (item: NotebookSessionListItem): string => {
  const count = item.messageCount > 0 ? `${item.messageCount} 条对话` : '空白笔记本'
  const preview = item.lastUserMessagePreview?.trim()
  if (!preview) return count
  const truncated = preview.length > 60 ? preview.slice(0, 60) + '…' : preview
  return `${count} · ${truncated}`
}
</script>

<template>
  <div class="nb-sessions nb-root flex h-full w-full flex-col">
    <!-- 顶栏：品牌点 + 新建对话 -->
    <header
      class="flex h-14 shrink-0 items-center gap-3 border-b px-6"
      style="
        border-color: var(--nb-rule);
        background: linear-gradient(180deg, var(--nb-paper) 0%, var(--nb-paper) 70%, var(--nb-paper-tint) 100%);
      "
    >
      <span
        class="flex h-7 w-7 items-center justify-center rounded-[var(--nb-radius-xs)]"
        style="background-color: var(--nb-ink); color: var(--nb-paper);"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M2 1.5h7l3 3v8H2V1.5z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round" />
          <path d="M9 1.5v3h3" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round" />
          <path d="M4.6 7.5h4.8M4.6 9.6h3.2" stroke="var(--nb-copper)" stroke-width="1.2" stroke-linecap="round" />
        </svg>
      </span>
      <div class="flex flex-col leading-tight">
        <span class="nb-eyebrow" style="font-size: 9.5px; letter-spacing: 0.26em;">
          NOTEBOOK
        </span>
        <span class="nb-display text-[11px] italic" style="color: var(--nb-ink-mute); font-weight: 400;">
          analyse · explain · report
        </span>
      </div>

      <div class="ml-auto flex items-center gap-2">
        <button
          class="nb-focus inline-flex h-8 items-center gap-1.5 rounded-[var(--nb-radius-sm)] border px-2.5 text-[12px] font-medium transition hover:bg-[color:var(--nb-overlay)]"
          style="border-color: var(--nb-rule); color: var(--nb-ink-mute); background-color: var(--nb-card);"
          title="刷新会话列表"
          aria-label="刷新会话列表"
          :disabled="loading"
          @click="emit('refresh')"
        >
          <RotateCw :size="13" :stroke-width="1.8" :class="loading ? 'nb-spin' : ''" />
          <span>刷新</span>
        </button>
        <button
          class="nb-focus inline-flex h-8 items-center gap-1.5 rounded-[var(--nb-radius-sm)] px-3 text-[12px] font-semibold transition"
          style="color: var(--nb-paper); background-color: var(--nb-copper); box-shadow: var(--nb-shadow-copper);"
          title="新建对话"
          aria-label="新建对话"
          @click="emit('create')"
        >
          <Plus :size="14" :stroke-width="2.2" />
          <span>新建对话</span>
        </button>
      </div>
    </header>

    <!-- 主体：会话列表 -->
    <main class="nb-scroll min-h-0 flex-1 overflow-y-auto">
      <div class="mx-auto w-full max-w-3xl px-6 py-8">
        <!-- 章节眉签 -->
        <div class="mb-4 flex items-center gap-3">
          <span class="nb-eyebrow" style="font-size: 10px;">最近对话</span>
          <span class="h-px flex-1" style="background-color: var(--nb-rule);" />
        </div>

        <!-- loading 骨架 -->
        <ul v-if="loading && sortedSessions.length === 0" class="flex flex-col gap-2">
          <li
            v-for="n in 4"
            :key="n"
            class="rounded-[var(--nb-radius-md)] border px-4 py-3.5"
            style="border-color: var(--nb-rule); background-color: var(--nb-card);"
          >
            <div class="nb-skeleton h-3.5 w-2/5 rounded-[2px]" />
            <div class="nb-skeleton mt-2.5 h-2.5 w-3/4 rounded-[2px]" />
          </li>
        </ul>

        <!-- error -->
        <div
          v-else-if="error"
          class="flex flex-col items-center gap-3 rounded-[var(--nb-radius-md)] border border-dashed px-6 py-12 text-center"
          style="border-color: var(--nb-clay); background-color: var(--nb-clay-soft);"
        >
          <AlertCircle :size="22" :stroke-width="1.6" :style="{ color: 'var(--nb-clay)' }" />
          <p class="nb-display text-[14px] font-medium" style="color: var(--nb-ink);">
            无法加载会话列表
          </p>
          <p class="max-w-sm text-[12px]" style="color: var(--nb-ink-mute);">
            {{ error }}
          </p>
          <button
            class="nb-focus mt-1 inline-flex h-8 items-center gap-1.5 rounded-[var(--nb-radius-sm)] border px-3 text-[12px] font-medium transition hover:bg-[color:var(--nb-overlay)]"
            style="border-color: var(--nb-rule); color: var(--nb-ink); background-color: var(--nb-card);"
            @click="emit('refresh')"
          >
            <RotateCw :size="13" :stroke-width="1.8" />
            <span>重试</span>
          </button>
        </div>

        <!-- 空态 -->
        <div
          v-else-if="sortedSessions.length === 0"
          class="flex flex-col items-center gap-4 rounded-[var(--nb-radius-lg)] border border-dashed px-6 py-16 text-center"
          style="border-color: var(--nb-rule); background-color: rgba(255,255,255,0.4);"
        >
          <span
            class="flex h-12 w-12 items-center justify-center rounded-full"
            style="background-color: var(--nb-copper-soft); color: var(--nb-copper-deep);"
          >
            <Sparkles :size="22" :stroke-width="1.6" />
          </span>
          <div class="flex flex-col items-center gap-1.5">
            <p class="nb-display text-[18px] font-medium" style="color: var(--nb-ink);">
              开始你的第一次分析
            </p>
            <p class="max-w-sm text-[12.5px]" style="color: var(--nb-ink-mute); line-height: 1.6;">
              还没有历史对话。新建一个，上传数据或描述你的分析目标，让 AI 帮你探索。
            </p>
          </div>
          <button
            class="nb-focus mt-1 inline-flex h-9 items-center gap-1.5 rounded-[var(--nb-radius-sm)] px-4 text-[13px] font-semibold transition"
            style="color: var(--nb-paper); background-color: var(--nb-copper); box-shadow: var(--nb-shadow-copper);"
            @click="emit('create')"
          >
            <Plus :size="14" :stroke-width="2.2" />
            <span>新建对话</span>
          </button>
        </div>

        <!-- 列表 -->
        <ul v-else class="flex flex-col gap-2">
          <li
            v-for="(item, idx) in sortedSessions"
            :key="item.sessionId"
            class="nb-fade-up"
            :style="{ animationDelay: Math.min(idx, 8) * 24 + 'ms' }"
          >
            <button
              class="nb-session-card nb-focus group flex w-full items-start gap-3 rounded-[var(--nb-radius-md)] border px-4 py-3.5 text-left transition"
              style="border-color: var(--nb-rule); background-color: var(--nb-card);"
              :title="item.title"
              @click="emit('select', item.sessionId)"
            >
              <span
                class="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--nb-radius-xs)]"
                style="background-color: var(--nb-copper-soft); color: var(--nb-copper-deep);"
              >
                <MessageSquare :size="14" :stroke-width="1.7" />
              </span>
              <span class="flex min-w-0 flex-1 flex-col gap-1">
                <span class="flex items-center justify-between gap-2">
                  <span
                    class="nb-display truncate text-[14.5px] font-medium"
                    style="color: var(--nb-ink); letter-spacing: -0.005em;"
                  >
                    {{ item.title || '未命名对话' }}
                  </span>
                  <span
                    class="nb-mono shrink-0 text-[10.5px] tabular-nums"
                    style="color: var(--nb-ink-faint); letter-spacing: 0.04em;"
                  >
                    {{ formatRelativeTime(item.updatedAt) }}
                  </span>
                </span>
                <span
                  class="truncate text-[12px]"
                  style="color: var(--nb-ink-mute); line-height: 1.5;"
                >
                  {{ sessionSubtitle(item) }}
                </span>
              </span>
            </button>
          </li>
        </ul>
      </div>
    </main>
  </div>
</template>

<style scoped>
.nb-session-card {
  position: relative;
}
.nb-session-card::before {
  content: '';
  position: absolute;
  left: -1px;
  top: 50%;
  transform: translateY(-50%) scaleY(0);
  width: 2px;
  height: 24px;
  background-color: var(--nb-copper);
  border-radius: 2px;
  transition: transform 200ms cubic-bezier(0.22, 0.61, 0.36, 1);
}
.nb-session-card:hover {
  border-color: var(--nb-rule-strong);
  box-shadow: var(--nb-shadow-sm);
}
.nb-session-card:hover::before {
  transform: translateY(-50%) scaleY(1);
}

/* 骨架闪烁 */
.nb-skeleton {
  background: linear-gradient(
    90deg,
    var(--nb-overlay) 25%,
    var(--nb-overlay-strong) 37%,
    var(--nb-overlay) 63%
  );
  background-size: 400% 100%;
  animation: nb-shimmer 1.4s ease infinite;
}
@keyframes nb-shimmer {
  0% { background-position: 100% 0; }
  100% { background-position: 0 0; }
}

.nb-spin {
  animation: nb-rotate 0.9s linear infinite;
}
@keyframes nb-rotate {
  to { transform: rotate(360deg); }
}
</style>
