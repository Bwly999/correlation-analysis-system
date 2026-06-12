<script setup lang="ts">
/**
 * FilePreview.vue
 *
 * §7 文件预览面板：根据 previewKind 路由到不同 viewer。
 *   - markdown：marked sanitize + 左侧 H1/H2 锚点 TOC
 *   - code：代码块（M1 不引 monaco，纯 pre + 行号）
 *   - image：blob URL（M1 占位：路径文本）
 *   - table：CSV 简单解析为表格（M1 仅显示前 50 行）
 *   - parquet-meta / meta：FileMetaCard
 *   - 切换文件时显示 200ms 骨架屏
 */

import { computed, ref, watch } from 'vue'
import { FileText, FileCode2, ImageIcon, Sheet, Info, Hash } from 'lucide-vue-next'
import { renderMarkdownSafe } from '../preview/markdownRenderer'
import { resolvePreviewKind } from '../preview/previewRouter'
import type { PreviewKind } from '../preview/previewRouter'

interface MetaInfo {
  size?: number
  modifiedAt?: number
}

const props = defineProps<{
  /** 当前选中文件路径；null 时显示空态 */
  selectedPath: string | null
  /** 预先准备好的内容（main thread 异步读取）；image 时为 blob URL，table/code/markdown 为文本 */
  content: string
  /** loading 状态：切换文件时父级把它打开 200ms */
  loading: boolean
  /** 元信息，用于 meta 卡片 */
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

watch(
  [previewKind, () => props.content],
  ([kind, raw]) => {
    if (kind === 'markdown') {
      // 1) sanitize
      let html = renderMarkdownSafe(raw)
      // 2) 给 h1/h2/h3 加 id（用于锚点）
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
      renderedHtml.value = html
    } else {
      tocEntries.value = []
      renderedHtml.value = ''
    }
  },
  { immediate: true },
)

const codeLines = computed(() => {
  if (previewKind.value !== 'code' && previewKind.value !== 'table') return []
  return props.content.split('\n')
})

const csvCells = computed<string[][]>(() => {
  if (previewKind.value !== 'table') return []
  // M1 极简 CSV 解析：不处理引号转义；仅前 50 行
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
  <div class="flex h-full flex-col bg-white">
    <header
      class="flex items-center justify-between gap-3 border-b border-slate-200 px-3.5 py-2.5"
    >
      <div class="flex min-w-0 items-center gap-2">
        <component
          :is="
            previewKind === 'markdown'
              ? FileText
              : previewKind === 'image'
              ? ImageIcon
              : previewKind === 'table'
              ? Sheet
              : previewKind === 'code'
              ? FileCode2
              : Info
          "
          :size="13"
          class="shrink-0 text-slate-500"
        />
        <span class="text-[12px] font-semibold tracking-tight text-slate-900">预览</span>
        <span v-if="selectedPath" class="truncate font-mono text-[11px] text-slate-500">
          {{ selectedPath }}
        </span>
      </div>
      <span
        v-if="selectedPath"
        class="font-mono text-[10px] uppercase tracking-[0.18em] text-slate-400"
      >
        {{ previewKind }}
      </span>
    </header>

    <!-- 骨架屏 -->
    <div v-if="loading" class="space-y-3 p-4">
      <div class="h-3 w-1/3 animate-pulse rounded bg-slate-100" />
      <div class="h-3 w-2/3 animate-pulse rounded bg-slate-100" />
      <div class="h-3 w-1/2 animate-pulse rounded bg-slate-100" />
      <div class="mt-2 h-32 animate-pulse rounded bg-slate-100" />
    </div>

    <!-- 空态 -->
    <div v-else-if="!selectedPath" class="flex flex-1 flex-col items-center justify-center text-center">
      <span class="mb-2 inline-flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-400">
        <Info :size="14" />
      </span>
      <p class="text-[12.5px] text-slate-500">
        点击文件树中的条目以预览
      </p>
    </div>

    <!-- Markdown：左 TOC + 右内容 -->
    <div v-else-if="previewKind === 'markdown'" class="flex min-h-0 flex-1">
      <aside
        v-if="tocEntries.length"
        class="hidden w-40 shrink-0 overflow-y-auto border-r border-slate-100 bg-slate-50/50 px-2 py-3 lg:block"
      >
        <div class="mb-1.5 flex items-center gap-1 px-1 text-[10px] font-mono uppercase tracking-[0.18em] text-slate-400">
          <Hash :size="10" />
          目录
        </div>
        <ul class="space-y-0.5">
          <li v-for="t in tocEntries" :key="t.id">
            <button
              class="block w-full truncate rounded px-1.5 py-0.5 text-left text-[11.5px] text-slate-600 transition hover:bg-blue-50 hover:text-blue-700"
              :style="{ paddingLeft: 6 + (t.level - 1) * 10 + 'px' }"
              @click="onTocClick(t.id)"
            >
              {{ t.text }}
            </button>
          </li>
        </ul>
      </aside>
      <div
        class="prose prose-sm max-w-none flex-1 overflow-y-auto px-5 py-4 text-[13px] leading-7 text-slate-800
               prose-headings:tracking-tight prose-headings:text-slate-900 prose-headings:scroll-mt-4
               prose-strong:text-slate-900 prose-code:text-blue-700 prose-code:bg-blue-50
               prose-code:rounded prose-code:px-1
               prose-pre:bg-slate-950 prose-pre:text-slate-100
               prose-a:text-blue-600 prose-a:no-underline hover:prose-a:underline
               prose-img:rounded-lg prose-img:border prose-img:border-slate-200"
        v-html="renderedHtml"
      />
    </div>

    <!-- 代码：行号 + 高亮容器 -->
    <pre
      v-else-if="previewKind === 'code'"
      class="m-0 flex-1 overflow-auto bg-slate-950 p-0 font-mono text-[11.5px] leading-5 text-slate-100"
    ><code class="block">
        <span
          v-for="(line, i) in codeLines"
          :key="i"
          class="grid grid-cols-[3rem_1fr] gap-2"
        ><span class="select-none border-r border-slate-800/60 pr-2 text-right text-slate-500 tabular-nums">{{ i + 1 }}</span><span class="whitespace-pre-wrap pr-4">{{ line || ' ' }}</span></span>
      </code></pre>

    <!-- CSV 表格 -->
    <div v-else-if="previewKind === 'table'" class="flex-1 overflow-auto">
      <table class="min-w-full border-separate border-spacing-0 font-mono text-[11.5px]">
        <thead class="sticky top-0 bg-slate-50">
          <tr>
            <th class="border-b border-slate-200 bg-slate-50 px-2 py-1.5 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">#</th>
            <th
              v-for="(_h, i) in csvCells[0] || []"
              :key="i"
              class="border-b border-slate-200 bg-slate-50 px-2 py-1.5 text-left text-[11px] font-bold tracking-tight text-slate-700"
            >
              {{ csvCells[0]?.[i] }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, ri) in csvCells.slice(1)" :key="ri" class="hover:bg-slate-50/60">
            <td class="border-b border-slate-100 px-2 py-1 text-[10px] text-slate-400 tabular-nums">{{ ri + 1 }}</td>
            <td
              v-for="(cell, ci) in row"
              :key="ci"
              class="border-b border-slate-100 px-2 py-1 text-slate-700"
            >
              {{ cell }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- 图片 -->
    <div v-else-if="previewKind === 'image'" class="flex flex-1 items-center justify-center bg-[radial-gradient(circle_at_center,_rgba(15,23,42,0.04),_transparent_60%)] p-4">
      <img
        v-if="content"
        :src="content"
        :alt="selectedPath ?? ''"
        class="max-h-full max-w-full rounded-lg border border-slate-200 shadow-sm"
      />
      <div v-else class="text-[12px] text-slate-500">图片正在加载…</div>
    </div>

    <!-- meta / parquet-meta -->
    <div v-else class="flex-1 p-5">
      <div class="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
        <div class="flex items-center gap-2">
          <Info :size="14" class="text-slate-500" />
          <span class="text-[13px] font-semibold text-slate-800">文件信息</span>
        </div>
        <dl class="mt-3 grid grid-cols-[80px_1fr] gap-y-1.5 text-[12px]">
          <dt class="text-slate-500">路径</dt>
          <dd class="font-mono text-slate-800">{{ selectedPath }}</dd>
          <dt class="text-slate-500">大小</dt>
          <dd class="font-mono tabular-nums text-slate-800">{{ formatSize(meta?.size) }}</dd>
          <dt class="text-slate-500">修改时间</dt>
          <dd class="font-mono text-slate-800">{{ formatTimestamp(meta?.modifiedAt) }}</dd>
        </dl>
        <p v-if="previewKind === 'parquet-meta'" class="mt-4 text-[11.5px] leading-5 text-slate-500">
          Parquet/Arrow 格式的内容预览未在 M1 实装。可下载后用本地工具或让 Agent 通过 python_exec 读取。
        </p>
        <p v-else class="mt-4 text-[11.5px] leading-5 text-slate-500">
          此格式不支持预览。可点击下载到本地查看。
        </p>
      </div>
    </div>
  </div>
</template>
