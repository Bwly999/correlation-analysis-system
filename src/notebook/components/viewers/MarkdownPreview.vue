<script setup lang="ts">
/**
 * MarkdownPreview.vue
 *
 * §7.1 Markdown viewer：印刷感版式 + 左侧目录锚点。
 *   - renderMarkdownSafe 做 sanitize
 *   - artifact 图片相对路径 → OPFS blob URL（createArtifactImageReplacer）
 *   - 提取 H1/H2/H3 作为目录条目，点击锚点滚动定位
 */

import { onBeforeUnmount, ref, watch } from 'vue'
import { Hash } from 'lucide-vue-next'
import { renderMarkdownSafe } from '../../preview/markdownRenderer'
import { createArtifactImageReplacer } from '../../preview/markdownArtifacts'
import type { OpfsDirectoryHandle } from '../../shared/opfsAccess'

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
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  artifactReplacer.dispose()
})

const onTocClick = (id: string) => {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
</script>

<template>
  <div class="flex min-h-0 flex-1">
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
