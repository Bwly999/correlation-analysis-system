<script setup lang="ts">
/**
 * FileIcon.vue
 *
 * 文件类型图标——直接使用 VS Code Material Icon Theme 的官方矢量图标。
 *
 * 实现要点：
 *   - 图标源文件来自 npm 包 `material-icon-theme`（MIT，作者 PKief / material-extensions），
 *     通过 Vite 的 `?raw` 后缀静态 import SVG 源码字符串，内联进 bundle（无运行时请求）。
 *   - 扩展名 → 图标 的映射严格遵循该主题的 manifest（material-icons.json 的 fileExtensions），
 *     不自行臆断：csv/tsv→table、txt→document、parquet/feather→database、默认→file。
 *   - 用 v-html 渲染完整 SVG 源码，得到真正的矢量图标，尺寸由父级控制。
 *
 * 许可：Material Icon Theme 采用 MIT 协议（见 node_modules/material-icon-theme/LICENSE）。
 */
import { computed } from 'vue'
// 官方 SVG 源码（?raw = Vite 内置，返回文件原始字符串）
import pythonSvg from 'material-icon-theme/icons/python.svg?raw'
import javascriptSvg from 'material-icon-theme/icons/javascript.svg?raw'
import typescriptSvg from 'material-icon-theme/icons/typescript.svg?raw'
import jsonSvg from 'material-icon-theme/icons/json.svg?raw'
import tableSvg from 'material-icon-theme/icons/table.svg?raw'
import markdownSvg from 'material-icon-theme/icons/markdown.svg?raw'
import documentSvg from 'material-icon-theme/icons/document.svg?raw'
import htmlSvg from 'material-icon-theme/icons/html.svg?raw'
import imageSvg from 'material-icon-theme/icons/image.svg?raw'
import svgIcon from 'material-icon-theme/icons/svg.svg?raw'
import yamlSvg from 'material-icon-theme/icons/yaml.svg?raw'
import tomlSvg from 'material-icon-theme/icons/toml.svg?raw'
import databaseSvg from 'material-icon-theme/icons/database.svg?raw'
import fileSvg from 'material-icon-theme/icons/file.svg?raw'

const props = withDefaults(defineProps<{ name: string; size?: number }>(), {
  size: 16,
})

/**
 * 扩展名 → 图标 SVG 字符串。
 * 映射来源：material-icon-theme/dist/material-icons.json 的 fileExtensions 字段。
 */
const EXT_ICON: Record<string, string> = {
  py: pythonSvg,
  js: javascriptSvg,
  mjs: javascriptSvg,
  cjs: javascriptSvg,
  ts: typescriptSvg,
  json: jsonSvg,
  csv: tableSvg,
  tsv: tableSvg,
  md: markdownSvg,
  markdown: markdownSvg,
  txt: documentSvg,
  html: htmlSvg,
  htm: htmlSvg,
  png: imageSvg,
  jpg: imageSvg,
  jpeg: imageSvg,
  gif: imageSvg,
  webp: imageSvg,
  svg: svgIcon,
  yml: yamlSvg,
  yaml: yamlSvg,
  toml: tomlSvg,
  parquet: databaseSvg,
  feather: databaseSvg,
}

const svgSource = computed(() => {
  const i = props.name.lastIndexOf('.')
  const ext = i >= 0 ? props.name.slice(i + 1).toLowerCase() : ''
  return EXT_ICON[ext] ?? fileSvg
})
</script>

<template>
  <!--
    v-html 渲染完整 SVG 源码。图标 viewBox 为 24x24，通过 width/height 缩放。
    span 包裹便于布局对齐；图标本身无 a11y 语义，用 aria-hidden 屏蔽。
  -->
  <span
    class="nb-file-icon inline-flex shrink-0 items-center justify-center"
    :style="{ width: size + 'px', height: size + 'px' }"
    aria-hidden="true"
    v-html="svgSource"
  />
</template>

<style scoped>
/* 让内联 SVG 撑满容器，跟随 size 缩放 */
.nb-file-icon :deep(svg) {
  width: 100%;
  height: 100%;
  display: block;
}
</style>
