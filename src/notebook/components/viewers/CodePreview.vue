<script setup lang="ts">
/**
 * CodePreview.vue
 *
 * §7.1 代码 viewer：稿纸底色 + 行号 + 语法高亮（highlight.js, github 浅色主题）。
 *   - 横向滚动：长行不折行，行号列以 sticky 钉在左侧。
 *   - 整段高亮后渲染，保留多行 token（三引号 / 块注释 / 模板字面量）的正确性。
 */

import { computed } from 'vue'
import hljs from 'highlight.js'
import 'highlight.js/styles/github.css'

const props = defineProps<{
  content: string
  /** highlight.js language 名（如 'python'）；为空 / 未注册则不高亮。 */
  language?: string
}>()

const escapeHtml = (value: string) =>
  value
    .split('&').join('&amp;')
    .split('<').join('&lt;')
    .split('>').join('&gt;')
    .split('"').join('&quot;')
    .split("'").join('&#39;')

const highlighted = computed(() => {
  const lang = props.language?.trim() ?? ''
  if (lang && hljs.getLanguage(lang)) {
    return hljs.highlight(props.content, { language: lang }).value
  }
  return escapeHtml(props.content)
})

const lineCount = computed(() => props.content.split('\n').length)
</script>

<template>
  <div
    class="nb-scroll flex-1 overflow-auto nb-mono text-[11.5px] leading-[1.6]"
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
      <!-- 代码列：整段高亮，长行横向溢出 -->
      <pre class="m-0 p-0"><code class="hljs block whitespace-pre px-4" v-html="highlighted" /></pre>
    </div>
  </div>
</template>

<style scoped>
/* github.css 的 .hljs 默认带白底与 padding，这里透明化以贴合稿纸底色 */
:deep(.hljs) {
  background: transparent;
  padding: 0;
  color: inherit;
}
</style>
