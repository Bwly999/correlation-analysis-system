<script setup lang="ts">
/**
 * MarkdownPreview.vue
 *
 * §7.1 Markdown viewer：印刷感版式 + 左侧目录锚点。
 *   - renderMarkdownWithMath 做 sanitize，并支持 $...$ 行内 / $$...$$ 块级 LaTeX 公式（KaTeX）
 *   - artifact 图片相对路径 → OPFS blob URL（createArtifactImageReplacer）
 *   - 提取 H1/H2/H3 作为目录条目，点击锚点滚动定位
 */

import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { FileDown, Hash } from 'lucide-vue-next'
import { renderMarkdownWithMath } from '../../preview/markdownRenderer'
import { createArtifactImageReplacer } from '../../preview/markdownArtifacts'
import type { OpfsDirectoryHandle } from '../../shared/opfsAccess'
import 'katex/dist/katex.min.css'

interface TocEntry {
  level: number
  text: string
  id: string
}

const props = defineProps<{
  opfsRoot?: OpfsDirectoryHandle
  /** 当前预览文件路径，用于 artifact 相对路径解析（../） */
  basePath: string
  content: string
}>()

const renderedHtml = ref('')
const tocEntries = ref<TocEntry[]>([])

const artifactReplacer = createArtifactImageReplacer({
  get opfsRoot() {
    return props.opfsRoot
  },
  get basePath() {
    return props.basePath
  },
})

watch(
  () => props.content,
  async (raw) => {
    let html = renderMarkdownWithMath(raw)
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
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  artifactReplacer.dispose()
})

const onTocClick = (id: string) => {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

const isPrinting = ref(false)

/**
 * 导出 PDF：复用已渲染并 sanitize 过的 renderedHtml（artifact 图片已解析为 OPFS blob URL），
 * 克隆到 body 直属节点后调用 window.print()，用户在系统对话框选「另存为 PDF」。
 * 零依赖，文字为矢量、中文与图片原样保留。
 */
const exportPdf = async () => {
  if (isPrinting.value) return
  isPrinting.value = true

  // 1) 克隆渲染结果到 body 直属节点（脱离 #app，便于打印时隐藏其余）
  const root = document.createElement('div')
  root.id = 'nb-md-print-root'
  root.className = 'nb-prose'
  root.innerHTML = renderedHtml.value
  document.body.appendChild(root)

  // 2) 用文件名（去扩展名）作为打印/PDF 默认文件名（Chrome 取 document.title）
  const prevTitle = document.title
  document.title = (props.basePath.split('/').pop() ?? 'notebook').replace(/\.[^.]+$/, '')
  document.body.classList.add('nb-printing')

  // 3) 清理：afterprint 触发后移除节点/类名，恢复 title
  const cleanup = () => {
    window.removeEventListener('afterprint', cleanup)
    document.body.classList.remove('nb-printing')
    root.remove()
    document.title = prevTitle
    isPrinting.value = false
  }
  window.addEventListener('afterprint', cleanup)
  // 兜底：个别浏览器/取消打印时 afterprint 可能不触发
  setTimeout(() => {
    if (document.body.contains(root)) cleanup()
  }, 2000)

  await nextTick() // 等一帧，图片/排版就绪
  window.print()
}
</script>

<template>
  <div class="relative flex min-h-0 flex-1">
    <button
      class="nb-focus absolute right-3 top-3 z-10 flex h-7 w-7 items-center justify-center rounded-full border shadow-sm transition hover:opacity-80 disabled:opacity-50"
      style="border-color: var(--nb-rule-strong); background-color: var(--nb-paper); color: var(--nb-ink);"
      :disabled="isPrinting"
      title="导出 PDF"
      @click="exportPdf"
    >
      <FileDown :size="13" :stroke-width="1.8" />
    </button>
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
</template>

<style>
@media print {
  /* 打印时隐藏除打印根节点外的所有顶层节点（整个 #app） */
  body.nb-printing > *:not(#nb-md-print-root) {
    display: none !important;
  }
  #nb-md-print-root {
    padding: 24px 32px;
    color: #000;
    background: #fff;
  }
  /* 标题/代码块/表格行尽量不跨页断裂 */
  #nb-md-print-root h1,
  #nb-md-print-root h2,
  #nb-md-print-root h3,
  #nb-md-print-root pre,
  #nb-md-print-root table tr {
    break-inside: avoid;
  }
}
</style>
