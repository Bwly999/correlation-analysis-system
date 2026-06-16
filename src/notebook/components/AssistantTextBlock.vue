<script setup lang="ts">
/**
 * AssistantTextBlock.vue
 *
 * 渲染 Agent 文本段（markdown）：先 renderMarkdownSafe，再把其中相对路径的
 * artifact 图片（如 ../artifacts/xxx.png）从 OPFS 读字节换成 blob URL。
 *
 * 对话流没有「当前文件」上下文，basePath 取 ''：相对 workspace 根解析，
 * 即 ../artifacts/x.png 与 artifacts/x.png 都规整成 artifacts/x.png。
 */

import { onBeforeUnmount, ref, watch } from 'vue'
import { renderMarkdownSafe } from '../preview/markdownRenderer'
import { createArtifactImageReplacer } from '../preview/markdownArtifacts'
import type { OpfsDirectoryHandle } from '../shared/opfsAccess'

const props = defineProps<{
  text: string
  opfsRoot?: OpfsDirectoryHandle
}>()

const renderedHtml = ref('')
const replacer = createArtifactImageReplacer({
  get opfsRoot() {
    return props.opfsRoot
  },
  basePath: '',
})

watch(
  [() => props.text, () => props.opfsRoot],
  async () => {
    const html = renderMarkdownSafe(props.text)
    renderedHtml.value = await replacer.rewrite(html)
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  replacer.dispose()
})
</script>

<template>
  <div class="nb-prose" v-html="renderedHtml" />
</template>
