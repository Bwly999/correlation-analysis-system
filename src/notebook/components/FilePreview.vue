<script setup lang="ts">
/**
 * FilePreview.vue
 *
 * §7 文件预览面板：根据 previewKind 路由到不同 viewer。
 *   - markdown：印刷感版式 + 左侧目录锚点
 *   - code：暗色稿纸 + 行号
 *   - image：纸面居中展示
 *   - table：CSV 简单表格
 *   - parquet-meta / meta：FileMetaCard
 *   - 切换文件时显示骨架屏
 */

import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { Info, Hash, CircleSlash, Sparkle } from 'lucide-vue-next'
import { renderMarkdownSafe } from '../preview/markdownRenderer'
import { resolvePreviewKind } from '../preview/previewRouter'
import type { PreviewKind } from '../preview/previewRouter'
import type { OpfsDirectoryHandle } from '../shared/opfsAccess'
import { createArtifactImageReplacer } from '../preview/markdownArtifacts'
import FileIcon from './FileIcon.vue'

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

interface TocEntry {
  level: number
  text: string
  id: string
}

const renderedHtml = ref('')
const tocEntries = ref<TocEntry[]>([])

const artifactReplacer = createArtifactImageReplacer({
  get opfsRoot() {
    return props.opfsRoot
  },
  get basePath() {
    return props.selectedPath ?? ''
  },
})

watch(
  [previewKind, () => props.content],
  async ([kind, raw]) => {
    if (kind === 'markdown') {
      let html = renderMarkdownSafe(raw)
      tocEntries.value = []
      html = html.replace(/<h([123])>([\s\S]*?)<\/h\1>/g, (_match, lvl, text) => {
        const plain = String(text).replace(/<[^>]*>/g, '').trim()
        const id =
          'sec-' +
          plain
            .toLowerCase()
            .replace(/[^a-z0-9一-龥]+/g, '-')
            .replace(/^-+|-+$/g, '')
        tocEntries.value.push({ level: Number(lvl), text: plain, id })
        return `<h${lvl} id="${id}">${text}</h${lvl}>`
      })
      renderedHtml.value = await artifactReplacer.rewrite(html)
    } else {
      artifactReplacer.dispose()
      tocEntries.value = []
      renderedHtml.value = ''
    }
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  artifactReplacer.dispose()
})

const codeLines = computed(() => {
  if (previewKind.value !== 'code' && previewKind.value !== 'table') return []
  return props.content.split('\n')
})

const csvCells = computed<string[][]>(() => {
  if (previewKind.value !== 'table') return []
  return props.content
    .split('\n')
    .slice(0, 50)
    .map((line) => line.split(','))
})

const formatTimestamp = (ts?: number) => {
  if (!ts) return '—'
  const d = new Date(ts)
  return d.toLocaleString('zh-CN', { hour12: false })
}

const formatSize = (bytes?: number) => {
  if (!bytes) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

const onTocClick = (id: string) => {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
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

    <!-- Markdown：左 TOC + 右内容 -->
    <div v-else-if="previewKind === 'markdown'" class="flex min-h-0 flex-1">
      <aside
        v-if="tocEntries.length"
        class="nb-scroll hidden w-44 shrink-0 overflow-y-auto border-r py-4 pl-4 pr-2 lg:block"
        style="border-color: var(--nb-rule); background-color: var(--nb-sidebar);"
      >
        <div
          class="mb-2 flex items-center gap-1.5 nb-eyebrow"
          style="font-size: 9px; letter-spacing: 0.24em;"
        >
          <Hash :size="9" :stroke-width="1.8" />
          目录
        </div>
        <ul class="space-y-0.5">
          <li v-for="t in tocEntries" :key="t.id">
            <button
              class="nb-focus block w-full truncate rounded-[3px] px-1.5 py-1 text-left text-[11.5px] transition"
              style="color: var(--nb-ink-mute);"
              :style="{ paddingLeft: 6 + (t.level - 1) * 12 + 'px' }"
              @click="onTocClick(t.id)"
              @mouseenter="(e) => {
                (e.currentTarget as HTMLElement).style.color = 'var(--nb-copper-deep)';
                (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--nb-copper-soft)'
              }"
              @mouseleave="(e) => {
                (e.currentTarget as HTMLElement).style.color = 'var(--nb-ink-mute)';
                (e.currentTarget as HTMLElement).style.backgroundColor = ''
              }"
            >
              {{ t.text }}
            </button>
          </li>
        </ul>
      </aside>
      <div
        class="nb-scroll nb-prose flex-1 overflow-y-auto px-8 py-7"
        style="max-width: none;"
        v-html="renderedHtml"
      />
    </div>

    <!-- 代码：行号 + 浅色稿 -->
    <pre
      v-else-if="previewKind === 'code'"
      class="nb-scroll m-0 flex-1 overflow-auto p-0 nb-mono text-[11.5px] leading-[1.6]"
      style="background-color: var(--nb-paper-tint); color: var(--nb-ink);"
    ><code class="block">
        <span
          v-for="(line, i) in codeLines"
          :key="i"
          class="grid grid-cols-[3rem_1fr] gap-2"
        ><span
          class="select-none border-r pr-2 text-right tabular-nums"
          style="border-color: var(--nb-rule); color: var(--nb-ink-faint);"
        >{{ i + 1 }}</span><span class="whitespace-pre-wrap pr-4">{{ line || ' ' }}</span></span>
      </code></pre>

    <!-- CSV 表格 -->
    <div v-else-if="previewKind === 'table'" class="nb-scroll flex-1 overflow-auto">
      <table class="min-w-full border-separate border-spacing-0 nb-mono text-[11.5px]">
        <thead class="sticky top-0">
          <tr style="background-color: var(--nb-paper-tint);">
            <th
              class="border-b px-2.5 py-2 text-left nb-mono text-[9.5px]"
              style="
                border-color: var(--nb-rule-strong);
                color: var(--nb-ink-mute);
                letter-spacing: 0.18em;
                font-weight: 700;
              "
            >
              #
            </th>
            <th
              v-for="(_h, i) in csvCells[0] || []"
              :key="i"
              class="border-b px-2.5 py-2 text-left text-[10.5px]"
              style="
                border-color: var(--nb-rule-strong);
                color: var(--nb-ink);
                letter-spacing: 0.06em;
                font-weight: 700;
              "
            >
              {{ csvCells[0]?.[i] }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(row, ri) in csvCells.slice(1)"
            :key="ri"
            class="transition"
            @mouseenter="(e) => (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--nb-paper-tint)'"
            @mouseleave="(e) => (e.currentTarget as HTMLElement).style.backgroundColor = ''"
          >
            <td
              class="border-b px-2.5 py-1 text-[10px] tabular-nums"
              style="border-color: var(--nb-rule); color: var(--nb-ink-faint);"
            >
              {{ ri + 1 }}
            </td>
            <td
              v-for="(cell, ci) in row"
              :key="ci"
              class="border-b px-2.5 py-1"
              style="border-color: var(--nb-rule); color: var(--nb-ink-soft);"
            >
              {{ cell }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- 图片 -->
    <div
      v-else-if="previewKind === 'image'"
      class="flex flex-1 items-center justify-center p-6"
      style="
        background-image:
          radial-gradient(circle at center, transparent 0%, var(--nb-overlay) 100%);
      "
    >
      <img
        v-if="content"
        :src="content"
        :alt="selectedPath ?? ''"
        class="max-h-full max-w-full rounded-[var(--nb-radius-sm)] border"
        style="border-color: var(--nb-rule-strong); box-shadow: var(--nb-shadow-lg);"
      />
      <div
        v-else
        class="nb-display-italic text-[13px]"
        style="color: var(--nb-ink-mute);"
      >
        图片正在加载…
      </div>
    </div>

    <!-- meta / parquet-meta -->
    <div v-else class="flex-1 p-6">
      <div
        class="rounded-[var(--nb-radius-sm)] border p-5"
        style="border-color: var(--nb-rule); background-color: var(--nb-card); box-shadow: var(--nb-shadow-sm);"
      >
        <div class="flex items-center gap-2">
          <Info :size="13" :stroke-width="1.6" style="color: var(--nb-copper-deep);" />
          <span
            class="nb-eyebrow"
            style="font-size: 10px; letter-spacing: 0.22em; color: var(--nb-ink);"
          >
            File / 文件信息
          </span>
        </div>
        <div class="mt-4 nb-rule" />
        <dl class="mt-4 grid grid-cols-[80px_1fr] gap-y-2.5 text-[12px]">
          <dt
            class="nb-mono text-[10px]"
            style="color: var(--nb-ink-faint); letter-spacing: 0.14em; font-weight: 700;"
          >
            PATH
          </dt>
          <dd class="nb-mono" style="color: var(--nb-ink); word-break: break-all;">
            {{ selectedPath }}
          </dd>
          <dt
            class="nb-mono text-[10px]"
            style="color: var(--nb-ink-faint); letter-spacing: 0.14em; font-weight: 700;"
          >
            SIZE
          </dt>
          <dd class="nb-mono tabular-nums" style="color: var(--nb-ink);">
            {{ formatSize(meta?.size) }}
          </dd>
          <dt
            class="nb-mono text-[10px]"
            style="color: var(--nb-ink-faint); letter-spacing: 0.14em; font-weight: 700;"
          >
            MTIME
          </dt>
          <dd class="nb-mono" style="color: var(--nb-ink);">
            {{ formatTimestamp(meta?.modifiedAt) }}
          </dd>
        </dl>
        <p
          v-if="previewKind === 'parquet-meta'"
          class="nb-display-italic mt-5 text-[12.5px] leading-6"
          style="color: var(--nb-ink-mute);"
        >
          Parquet/Arrow 格式的内容预览未在 M1 实装。可下载后用本地工具或让 Agent 通过 python_exec 读取。
        </p>
        <p
          v-else
          class="nb-display-italic mt-5 text-[12.5px] leading-6"
          style="color: var(--nb-ink-mute);"
        >
          此格式不支持预览。可点击下载到本地查看。
        </p>
      </div>
    </div>
  </div>
</template>
