<script setup lang="ts">
/**
 * FilePreview.vue
 *
 * §7 文件预览面板（壳）：根据 previewKind 路由到 viewers/ 下的对应 viewer。
 *   - markdown  → MarkdownPreview（sanitize + 左 TOC + artifact 图片）
 *   - code      → CodePreview（行号 + 等宽稿纸）
 *   - table     → TablePreview（CSV 前 50 行）
 *   - image     → ImagePreview（居中展示）
 *   - parquet-meta / meta → FileMetaCard（文件信息卡）
 *
 * 壳自身只负责：header（图标/路径/kind chip）、骨架屏、空态、按 kind 分发。
 */

import { computed } from 'vue'
import { CircleSlash, Sparkle } from 'lucide-vue-next'
import { resolvePreviewKind } from '../preview/previewRouter'
import type { PreviewKind } from '../preview/previewRouter'
import type { OpfsDirectoryHandle } from '../shared/opfsAccess'
import FileIcon from './FileIcon.vue'
import MarkdownPreview from './viewers/MarkdownPreview.vue'
import CodePreview from './viewers/CodePreview.vue'
import TablePreview from './viewers/TablePreview.vue'
import ImagePreview from './viewers/ImagePreview.vue'
import FileMetaCard from './viewers/FileMetaCard.vue'

interface MetaInfo {
  size?: number
  modifiedAt?: number
}

const props = defineProps<{
  opfsRoot?: OpfsDirectoryHandle
  selectedPath: string | null
  content: string
  loading: boolean
  meta?: MetaInfo
}>()

const previewKind = computed<PreviewKind>(() =>
  props.selectedPath ? resolvePreviewKind(props.selectedPath) : 'meta',
)
</script>

<template>
  <div
    class="flex h-full flex-col"
    style="background-color: var(--nb-paper);"
  >
    <header
      class="flex items-center justify-between gap-3 border-b px-4 py-3"
      style="border-color: var(--nb-rule); background-color: var(--nb-sidebar);"
    >
      <div class="flex min-w-0 items-center gap-2.5">
        <FileIcon
          v-if="selectedPath"
          :name="selectedPath"
          :size="14"
          class="shrink-0"
        />
        <Sparkle
          v-else
          :size="13"
          :stroke-width="1.6"
          class="shrink-0"
          style="color: var(--nb-copper-deep);"
        />
        <span
          class="nb-eyebrow"
          style="font-size: 10px; letter-spacing: 0.22em; color: var(--nb-ink);"
        >
          Preview
        </span>
        <span
          v-if="selectedPath"
          class="truncate nb-mono text-[10.5px]"
          style="color: var(--nb-ink-mute); letter-spacing: 0.02em;"
        >
          {{ selectedPath }}
        </span>
      </div>
      <span
        v-if="selectedPath"
        class="nb-chip"
        data-tone="default"
        style="padding: 1px 7px; font-size: 9px; letter-spacing: 0.16em; font-weight: 700;"
      >
        {{ previewKind }}
      </span>
    </header>

    <!-- 骨架屏 -->
    <div v-if="loading" class="space-y-3 p-6">
      <div
        class="h-3 w-1/3 rounded"
        style="background-color: var(--nb-rule-strong); animation: nb-pulse 1.4s ease-in-out infinite;"
      />
      <div
        class="h-3 w-2/3 rounded"
        style="background-color: var(--nb-rule); animation: nb-pulse 1.4s ease-in-out infinite;"
      />
      <div
        class="h-3 w-1/2 rounded"
        style="background-color: var(--nb-rule); animation: nb-pulse 1.4s ease-in-out infinite;"
      />
      <div
        class="mt-2 h-32 rounded"
        style="background-color: var(--nb-rule); animation: nb-pulse 1.4s ease-in-out infinite;"
      />
    </div>

    <!-- 空态 -->
    <div
      v-else-if="!selectedPath"
      class="flex flex-1 flex-col items-center justify-center px-6 text-center"
    >
      <CircleSlash
        :size="20"
        :stroke-width="1.4"
        style="color: var(--nb-ink-faint);"
      />
      <p
        class="nb-display-italic mt-3 text-[14px]"
        style="color: var(--nb-ink-mute);"
      >
        点击文件树中的条目以预览
      </p>
      <p
        class="mt-2 nb-mono text-[10px]"
        style="color: var(--nb-ink-faint); letter-spacing: 0.16em; font-weight: 700;"
      >
        nothing selected
      </p>
    </div>

    <!-- 各类型 viewer 分发 -->
    <MarkdownPreview
      v-else-if="previewKind === 'markdown'"
      :opfs-root="opfsRoot"
      :base-path="selectedPath ?? ''"
      :content="content"
    />
    <CodePreview
      v-else-if="previewKind === 'code'"
      :content="content"
    />
    <TablePreview
      v-else-if="previewKind === 'table'"
      :content="content"
    />
    <ImagePreview
      v-else-if="previewKind === 'image'"
      :src="content"
      :alt="selectedPath ?? ''"
    />
    <FileMetaCard
      v-else
      :path="selectedPath ?? ''"
      :meta="meta"
      :kind="previewKind === 'parquet-meta' ? 'parquet-meta' : 'meta'"
    />
  </div>
</template>
