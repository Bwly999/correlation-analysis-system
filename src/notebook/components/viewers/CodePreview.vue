<script setup lang="ts">
/**
 * CodePreview.vue
 *
 * §7.1 代码 viewer：暗色稿纸 + 行号。
 *   纯文本按行渲染，左侧行号列与右侧内容列采用 grid 对齐。
 */

import { computed } from 'vue'

const props = defineProps<{
  content: string
}>()

const codeLines = computed(() => props.content.split('\n'))
</script>

<template>
  <pre
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
</template>
