<script setup lang="ts">
/**
 * CodePreview.vue
 *
 * §7.1 代码 viewer：稿纸底色 + 行号 + 语法高亮（Shiki TextMate，VS Code 同款）。
 *   - 横向滚动：长行在代码列内部横向滚动（min-w-0 解除 flex 撑开），行号列 sticky 钉左。
 *   - 单例 highlighter：模块级缓存，多文件切换只初始化一次；首屏 loading 态。
 *   - 未识别语言按 'text' 兜底，不报错。
 */
import { computed, ref, shallowRef, watchEffect } from 'vue'
import { createHighlighter, type Highlighter } from 'shiki'

const props = defineProps<{
  content: string
  /** Shiki 语言名（如 'python'）；为空 / 未注册则按纯文本渲染。 */
  language?: string
}>()

const THEME = 'vitesse-light'
const PRELOAD_LANGS = ['python', 'javascript', 'typescript', 'json', 'yaml', 'toml']

// 单例：多个 CodePreview 实例 / 多次文件切换共用同一个 highlighter
let highlighterPromise: Promise<Highlighter> | null = null
const getHighlighter = () => {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      langs: PRELOAD_LANGS,
      themes: [THEME],
    })
  }
  return highlighterPromise
}

const highlightedHtml = shallowRef<string>('')
const loading = ref(true)

const PRELOAD_LANG_SET = new Set(PRELOAD_LANGS)
const resolveLang = (lang: string): string => {
  const trimmed = lang.trim()
  if (trimmed && PRELOAD_LANG_SET.has(trimmed)) return trimmed
  return 'text'
}

const escapeHtml = (value: string) =>
  value
    .split('&').join('&amp;')
    .split('<').join('&lt;')
    .split('>').join('&gt;')
    .split('"').join('&quot;')
    .split("'").join('&#39;')

const renderTextFallback = (content: string) =>
  `<span class="line">${escapeHtml(content).split('\n').join('</span>\n<span class="line">')}</span>`

watchEffect(async () => {
  const content = props.content
  const lang = resolveLang(props.language ?? '')
  loading.value = true
  try {
    const highlighter = await getHighlighter()
    if (lang === 'text') {
      // Shiki 不在预加载集内的语言，避免动态加载开销，直接按文本逐行渲染
      highlightedHtml.value = renderTextFallback(content)
    } else {
      highlightedHtml.value = highlighter.codeToHtml(content, { lang, theme: THEME })
    }
  } catch {
    highlightedHtml.value = renderTextFallback(content)
  } finally {
    loading.value = false
  }
})

const lineCount = computed(() => props.content.split('\n').length)
</script>

<template>
  <div
    class="nb-scroll flex-1 min-w-0 overflow-auto nb-mono text-[11.5px] leading-[1.6]"
    style="background-color: var(--nb-paper-tint); color: var(--nb-ink);"
  >
    <div class="flex min-w-full">
      <!-- 行号列：sticky 钉在左侧，不透明背景避免横向滚动时透出代码 -->
      <div
        class="sticky left-0 z-10 shrink-0 select-none border-r pr-2 text-right tabular-nums"
        style="background-color: var(--nb-paper-tint); border-color: var(--nb-rule); color: var(--nb-ink-faint);"
      >
        <span
          v-for="i in lineCount"
          :key="i"
          class="block px-3"
        >{{ i }}</span>
      </div>
      <!-- 代码列：min-w-0 解除 flex 默认 min-width:auto，长行在此列内部横向滚动 -->
      <div class="min-w-0 flex-1 overflow-x-auto">
        <!-- loading 骨架：首屏 highlighter 初始化期间 -->
        <pre
          v-if="loading"
          class="m-0 px-4 py-1 whitespace-pre"
          style="color: var(--nb-ink-faint);"
        >{{ content }}</pre>
        <pre
          v-else
          class="m-0 p-0"
        ><code class="shiki block whitespace-pre px-4" v-html="highlightedHtml" /></pre>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* shiki 主题自带背景/padding，透明化以贴合稿纸底色 */
:deep(.shiki) {
  background: transparent;
  padding: 0;
  color: inherit;
}
/*
 * .line 保持 inline（默认）。容器继承到 white-space: pre，shiki 在每行 .line
 * 之间输出的 \n 已负责换行；若再叠加 display:block 会导致每行多出一个空行。
 */
</style>
