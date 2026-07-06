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

import { computed, ref } from 'vue'
import { CircleSlash, Maximize, Sparkle } from 'lucide-vue-next'
import { resolvePreviewKind, resolveCodeLanguage } from '../preview/previewRouter'
import type { PreviewKind } from '../preview/previewRouter'
import type { OpfsDirectoryHandle } from '../shared/opfsAccess'
import FileIcon from './FileIcon.vue'
import MarkdownPreview from './viewers/MarkdownPreview.vue'
import CodePreview from './viewers/CodePreview.vue'
import TablePreview from './viewers/TablePreview.vue'
import ImagePreview from './viewers/ImagePreview.vue'
import FileMetaCard from './viewers/FileMetaCard.vue'
import FullScreenPreview from './viewers/FullScreenPreview.vue'

interface MetaInfo {
  size?: number
  modifiedAt?: number
}

const props = defineProps<{
  opfsRoot?: OpfsDirectoryHandle
  selectedPath: string | null
  content: string
  /** 二进制原始字节（Excel 等）：交由对应 viewer 自行解析，避免文本乱码 */
  bytes?: Uint8Array | null
  loading: boolean
  meta?: MetaInfo
}>()

const previewKind = computed<PreviewKind>(() =>
  props.selectedPath ? resolvePreviewKind(props.selectedPath) : 'meta',
)

const codeLanguage = computed(() =>
  props.selectedPath ? resolveCodeLanguage(props.selectedPath) : '',
)

// 大屏预览：meta（含 parquet-meta）不显示展开按钮
const canFullScreen = computed(
  () => !!props.selectedPath && previewKind.value !== 'meta' && previewKind.value !== 'parquet-meta',
)

const fullScreenOpen = ref(false)
</script>

<template>
  <div
    class="flex h-full min-w-0 flex-col"
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
      <div class="flex shrink-0 items-center gap-2">
        <span
          v-if="selectedPath"
          class="nb-chip"
          data-tone="default"
          style="padding: 1px 7px; font-size: 9px; letter-spacing: 0.16em; font-weight: 700;"
        >
          {{ previewKind }}
        </span>
        <button
          v-if="canFullScreen"
          class="nb-focus flex h-6 w-6 items-center justify-center rounded-full border transition hover:opacity-80"
          style="border-color: var(--nb-rule-strong); color: var(--nb-ink);"
          title="大屏预览"
          @click="fullScreenOpen = true"
        >
          <Maximize :size="12" :stroke-width="1.8" />
        </button>
      </div>
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
      :language="codeLanguage"
    />
    <TablePreview
      v-else-if="previewKind === 'table'"
      :content="content"
      :bytes="bytes"
      :path="selectedPath ?? ''"
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

    <!-- 大屏预览弹窗（除 meta 外） -->
    <FullScreenPreview
      v-if="canFullScreen"
      v-model:open="fullScreenOpen"
      :preview-kind="previewKind"
      :selected-path="selectedPath ?? ''"
      :content="content"
      :bytes="bytes"
      :opfs-root="opfsRoot"
      :meta="meta"
      :code-language="codeLanguage"
    />
  </div>
</template>
