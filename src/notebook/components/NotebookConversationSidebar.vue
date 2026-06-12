<script setup lang="ts">
/**
 * NotebookConversationSidebar.vue
 *
 * Notebook 左侧对话选择栏。
 *
 * 视觉风格 ▸ Editorial Notebook 暖纸延续：
 *   - 与右侧 Workspace 共用 --nb-sidebar 暖灰背景，但偏更深一档
 *   - 收起态 56px：仅显示图标与品牌点
 *   - 展开态 232px：新建会话 / 自定义 / 最近列表 / 工作区底栏
 *
 * 收起状态由父组件控制并持久化（localStorage）。
 *
 * 参考：Claude Desktop 左栏布局，但去掉 Cowork/Code 切换页签 —
 * 我们的 notebook 只有「对话」一种工作面。
 */
import { computed } from 'vue'
import {
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Briefcase,
  ChevronDown,
  SlidersHorizontal,
  MessageSquare,
} from 'lucide-vue-next'
import type { NotebookConversation } from '../types/messageStream'

const props = defineProps<{
  /** 历史对话列表（已按 updatedAt 倒序） */
  conversations: NotebookConversation[]
  /** 当前选中的对话 ID */
  activeId: string | null
  /** 是否折叠 */
  collapsed: boolean
  /** 工作区/Workspace 名称（底栏） */
  workspaceLabel?: string
}>()

const emit = defineEmits<{
  toggleCollapsed: []
  newSession: []
  customize: []
  selectConversation: [id: string]
  openWorkspaceMenu: []
}>()

const sortedConversations = computed(() =>
  [...props.conversations].sort((a, b) => b.updatedAt - a.updatedAt),
)

const widthStyle = computed(() =>
  props.collapsed ? { width: '56px' } : { width: '232px' },
)
</script>

<template>
  <aside
    class="nb-conv-sidebar relative z-10 flex h-full shrink-0 flex-col border-r"
    :style="widthStyle"
    :data-collapsed="collapsed"
    aria-label="对话列表"
  >
    <!-- 顶部：折叠按钮 + 品牌点 -->
    <div
      class="flex h-14 shrink-0 items-center"
      :class="collapsed ? 'justify-center px-0' : 'justify-between px-3'"
    >
      <button
        v-if="!collapsed"
        class="nb-focus inline-flex h-8 items-center gap-2 rounded-[3px] px-2 text-[12px] font-medium transition hover:bg-[color:var(--nb-overlay)]"
        style="color: var(--nb-ink-mute);"
        :title="collapsed ? '展开侧栏' : '收起侧栏 (⌘/Ctrl + .)'"
        :aria-label="collapsed ? '展开侧栏' : '收起侧栏'"
        @click="emit('toggleCollapsed')"
      >
        <span
          class="flex h-5 w-5 items-center justify-center rounded-[3px]"
          style="background-color: var(--nb-ink); color: var(--nb-paper);"
        >
          <svg width="11" height="11" viewBox="0 0 14 14" fill="none">
            <path d="M2 1.5h7l3 3v8H2V1.5z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round" />
            <path d="M9 1.5v3h3" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round" />
            <path d="M4.6 7.5h4.8M4.6 9.6h3.2" stroke="var(--nb-copper)" stroke-width="1.2" stroke-linecap="round" />
          </svg>
        </span>
        <span class="nb-eyebrow" style="font-size: 9.5px; letter-spacing: 0.24em;">
          NOTEBOOK
        </span>
        <PanelLeftClose :size="13" :stroke-width="1.6" class="ml-auto" />
      </button>
      <button
        v-else
        class="nb-focus inline-flex h-9 w-9 items-center justify-center rounded-[3px] transition hover:bg-[color:var(--nb-overlay)]"
        style="color: var(--nb-ink-mute);"
        title="展开侧栏"
        aria-label="展开侧栏"
        @click="emit('toggleCollapsed')"
      >
        <PanelLeftOpen :size="14" :stroke-width="1.7" />
      </button>
    </div>

    <!-- 操作区：新建会话 / 自定义 -->
    <div
      class="flex shrink-0 flex-col gap-0.5"
      :class="collapsed ? 'px-2' : 'px-3'"
    >
      <button
        class="nb-focus group flex h-9 items-center rounded-[4px] text-[13px] transition"
        :class="collapsed ? 'justify-center w-9 mx-auto' : 'gap-2.5 px-2.5'"
        style="
          color: var(--nb-ink);
          background-color: var(--nb-card);
          border: 1px solid var(--nb-rule);
        "
        title="新建对话"
        aria-label="新建对话"
        @click="emit('newSession')"
      >
        <Plus :size="14" :stroke-width="1.8" :style="{ color: 'var(--nb-copper-deep)' }" />
        <span v-if="!collapsed" class="nb-display font-medium" style="letter-spacing: -0.005em;">
          新建对话
        </span>
      </button>
      <button
        class="nb-focus group flex h-9 items-center rounded-[4px] text-[12.5px] transition hover:bg-[color:var(--nb-overlay)]"
        :class="collapsed ? 'justify-center w-9 mx-auto' : 'gap-2.5 px-2.5'"
        style="color: var(--nb-ink-mute);"
        title="自定义偏好"
        aria-label="自定义"
        @click="emit('customize')"
      >
        <SlidersHorizontal :size="13" :stroke-width="1.6" />
        <span v-if="!collapsed">自定义</span>
      </button>
    </div>

    <!-- 章节眉签：最近 -->
    <div
      v-if="!collapsed"
      class="mt-5 flex items-center justify-between px-4 pb-1.5"
    >
      <span class="nb-eyebrow" style="font-size: 9.5px;">最近</span>
      <button
        v-if="sortedConversations.length > 0"
        class="nb-focus inline-flex h-5 w-5 items-center justify-center rounded-[3px] opacity-60 transition hover:opacity-100"
        style="color: var(--nb-ink-mute);"
        title="管理对话"
      >
        <SlidersHorizontal :size="11" :stroke-width="1.6" />
      </button>
    </div>
    <div
      v-else
      class="mt-5 flex items-center justify-center px-2 pb-1.5"
      aria-hidden="true"
    >
      <span class="h-px w-6" style="background-color: var(--nb-rule-strong);" />
    </div>

    <!-- 对话列表（可滚动） -->
    <nav
      v-if="sortedConversations.length > 0"
      class="nb-scroll min-h-0 flex-1 overflow-y-auto"
      :class="collapsed ? 'px-2' : 'px-2'"
      aria-label="历史对话"
    >
      <ul class="flex flex-col gap-0.5 pb-3">
        <li
          v-for="(conv, idx) in sortedConversations"
          :key="conv.id"
          class="nb-fade-up"
          :style="{ animationDelay: Math.min(idx, 8) * 24 + 'ms' }"
        >
          <button
            class="nb-conv-item nb-focus group flex h-8 w-full items-center rounded-[4px] text-[12.5px] transition"
            :class="[
              collapsed ? 'justify-center px-0' : 'gap-2 px-2.5',
              conv.id === activeId ? 'is-active' : '',
            ]"
            :title="conv.title"
            :aria-current="conv.id === activeId ? 'true' : undefined"
            @click="emit('selectConversation', conv.id)"
          >
            <span
              class="nb-conv-dot inline-flex h-1.5 w-1.5 shrink-0 rounded-full"
              :style="{
                backgroundColor:
                  conv.id === activeId ? 'var(--nb-copper)' : 'var(--nb-ink-faint)',
              }"
            />
            <span
              v-if="!collapsed"
              class="truncate text-left"
              :style="{
                color:
                  conv.id === activeId ? 'var(--nb-ink)' : 'var(--nb-ink-soft)',
              }"
            >
              {{ conv.title }}
            </span>
          </button>
        </li>
      </ul>
    </nav>

    <!-- 空态 -->
    <div
      v-else-if="!collapsed"
      class="min-h-0 flex-1 px-4 pt-2"
    >
      <div
        class="rounded-[4px] border border-dashed px-3 py-3 text-[11.5px]"
        style="
          border-color: var(--nb-rule);
          color: var(--nb-ink-faint);
          background-color: rgba(255,255,255,0.4);
          line-height: 1.55;
        "
      >
        <MessageSquare :size="13" :stroke-width="1.5" class="mb-1.5" />
        还没有历史对话——新建一个，从一句目标开始。
      </div>
    </div>
    <div v-else class="min-h-0 flex-1" />

    <!-- 底栏：工作区 -->
    <div
      class="shrink-0 border-t"
      style="border-color: var(--nb-rule);"
    >
      <button
        class="nb-focus group flex h-12 w-full items-center transition hover:bg-[color:var(--nb-overlay)]"
        :class="collapsed ? 'justify-center px-0' : 'gap-2.5 px-3'"
        :title="workspaceLabel ?? '当前工作区'"
        :aria-label="workspaceLabel ?? '当前工作区'"
        @click="emit('openWorkspaceMenu')"
      >
        <span
          class="flex h-7 w-7 shrink-0 items-center justify-center rounded-[4px]"
          style="
            background-color: var(--nb-copper-soft);
            color: var(--nb-copper-deep);
            border: 1px solid rgba(204, 120, 92, 0.28);
          "
        >
          <Briefcase :size="13" :stroke-width="1.7" />
        </span>
        <span
          v-if="!collapsed"
          class="nb-display flex min-w-0 flex-1 flex-col items-start leading-tight"
        >
          <span
            class="nb-eyebrow"
            style="font-size: 8.5px; letter-spacing: 0.22em;"
          >
            工作区
          </span>
          <span
            class="truncate text-[12.5px] font-medium"
            style="color: var(--nb-ink); letter-spacing: -0.005em;"
          >
            {{ workspaceLabel ?? '默认' }}
          </span>
        </span>
        <ChevronDown
          v-if="!collapsed"
          :size="13"
          :stroke-width="1.6"
          :style="{ color: 'var(--nb-ink-faint)' }"
        />
      </button>
    </div>
  </aside>
</template>

<style scoped>
.nb-conv-sidebar {
  background-color: #EDEDEB;
  border-color: var(--nb-rule);
  /* 展开/收起的丝滑过渡：宽度 + 内含元素的轻微淡入 */
  transition:
    width 220ms cubic-bezier(0.22, 0.61, 0.36, 1);
  font-family: var(--nb-font-sans);
}

/* 列表项：暖色高亮 + 左侧细铜条作为活动指示 */
.nb-conv-item {
  position: relative;
  border: 1px solid transparent;
}
.nb-conv-item::before {
  content: '';
  position: absolute;
  left: -2px;
  top: 50%;
  transform: translateY(-50%) scaleY(0);
  width: 2px;
  height: 16px;
  background-color: var(--nb-copper);
  border-radius: 2px;
  transition: transform 200ms cubic-bezier(0.22, 0.61, 0.36, 1);
}
.nb-conv-item:hover {
  background-color: rgba(40, 40, 38, 0.05);
}
.nb-conv-item.is-active {
  background-color: var(--nb-card);
  border-color: var(--nb-rule);
}
.nb-conv-item.is-active::before {
  transform: translateY(-50%) scaleY(1);
}

/* 收起态：移除内边距、收紧 hover 区 */
.nb-conv-sidebar[data-collapsed='true'] .nb-conv-item {
  width: 36px;
  margin-inline: auto;
}
</style>
