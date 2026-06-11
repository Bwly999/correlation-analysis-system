<script setup lang="ts">
/**
 * NotebookView.vue
 *
 * iframe 内的笔记本主视图（M1 简版）。
 *
 * 三栏布局：
 *   - 左：消息流（M1 placeholder 文案；后续接入 messages prop）
 *   - 右上：文件树
 *   - 右下：文件预览
 *   - 底部：状态条
 *
 * 不挂 PrimeVue / Pinia，保持 iframe 内最小依赖。
 */

import { computed, ref } from 'vue'
import { useWorkspaceTree } from '../composables/useWorkspaceTree'
import { resolvePreviewKind } from '../preview/previewRouter'
import { renderMarkdownSafe } from '../preview/markdownRenderer'
import { readFile, type OpfsDirectoryHandle, type TreeNode } from '../shared/opfsAccess'

const props = defineProps<{
  opfsRoot: OpfsDirectoryHandle
  /** 消息流（M1 仅显示）；上层注入 */
  messages?: Array<{ id: string; role: 'user' | 'assistant'; content: string }>
}>()

const ws = useWorkspaceTree({ root: props.opfsRoot })
void ws.refresh()

const selectedPath = ref<string | null>(null)
const previewContent = ref<string>('')
const previewKind = computed(() =>
  selectedPath.value ? resolvePreviewKind(selectedPath.value) : 'meta',
)

const onSelect = async (path: string) => {
  selectedPath.value = path
  const kind = resolvePreviewKind(path)
  if (kind === 'image') {
    // 不读字节，UI 直接生成 blob URL；M1 占位用相对路径
    previewContent.value = path
  } else if (kind === 'meta' || kind === 'parquet-meta') {
    previewContent.value = `预览暂不支持：${path}`
  } else {
    try {
      previewContent.value = await readFile(props.opfsRoot, path)
    } catch (err) {
      previewContent.value = `读取失败：${err instanceof Error ? err.message : String(err)}`
    }
  }
}

/** 把 tree 拍平成"目录 → 文件"列表，便于简单渲染 */
const flat = computed(() => {
  const out: Array<{ path: string; name: string; size?: number; depth: number }> = []
  const walk = (node: TreeNode, prefix: string, depth: number) => {
    if (!node.children) return
    for (const child of node.children) {
      const childPath = prefix ? `${prefix}/${child.name}` : child.name
      if (child.kind === 'directory') {
        out.push({ path: childPath, name: `📁 ${child.name}`, depth })
        walk(child, childPath, depth + 1)
      } else {
        out.push({
          path: childPath,
          name: child.name,
          size: child.size,
          depth,
        })
      }
    }
  }
  if (ws.tree.value) walk(ws.tree.value, '', 0)
  return out
})

const previewMarkdown = computed(() =>
  previewKind.value === 'markdown' ? renderMarkdownSafe(previewContent.value) : '',
)
</script>

<template>
  <div class="grid h-full w-full grid-cols-[3fr_2fr] grid-rows-[1fr_auto] gap-3 p-3">
    <section class="row-span-2 flex min-h-0 flex-col rounded-lg border border-slate-200 bg-white">
      <header class="border-b border-slate-200 px-3 py-2 text-sm font-semibold text-slate-900">
        消息流
      </header>
      <div class="flex-1 overflow-auto p-3">
        <div v-if="!messages?.length" class="text-sm text-slate-400">
          ✨ 准备就绪。Agent 已就位，告诉我你的分析目标。
        </div>
        <ul v-else class="space-y-3">
          <li
            v-for="m in messages"
            :key="m.id"
            class="rounded-md border border-slate-100 p-2 text-sm"
            :class="m.role === 'user' ? 'bg-blue-50' : 'bg-slate-50'"
          >
            <div class="text-xs font-semibold text-slate-500">{{ m.role === 'user' ? '你' : 'Agent' }}</div>
            <div class="whitespace-pre-wrap text-slate-800">{{ m.content }}</div>
          </li>
        </ul>
      </div>
    </section>

    <section class="flex min-h-0 flex-col rounded-lg border border-slate-200 bg-white">
      <header class="border-b border-slate-200 px-3 py-2 text-sm font-semibold text-slate-900">
        Workspace
      </header>
      <ul class="flex-1 overflow-auto p-2 text-sm">
        <li
          v-for="row in flat"
          :key="row.path"
          class="cursor-pointer rounded px-2 py-1 hover:bg-slate-100"
          :class="{ 'bg-blue-50': selectedPath === row.path }"
          :style="{ paddingLeft: row.depth * 12 + 8 + 'px' }"
          :data-path="row.path"
          @click="onSelect(row.path)"
        >
          <span>{{ row.name }}</span>
          <span v-if="row.size != null" class="ml-2 text-xs text-slate-400">
            {{ Math.round(row.size / 102.4) / 10 }} KB
          </span>
        </li>
      </ul>
    </section>

    <section class="flex min-h-0 flex-col rounded-lg border border-slate-200 bg-white">
      <header class="border-b border-slate-200 px-3 py-2 text-sm font-semibold text-slate-900">
        预览 <span v-if="selectedPath" class="ml-2 text-xs text-slate-500">{{ selectedPath }}</span>
      </header>
      <div class="flex-1 overflow-auto p-3 text-sm">
        <div v-if="!selectedPath" class="text-slate-400">点击文件查看预览</div>
        <div
          v-else-if="previewKind === 'markdown'"
          class="prose prose-sm max-w-none"
          v-html="previewMarkdown"
        />
        <pre
          v-else-if="previewKind === 'code' || previewKind === 'table'"
          class="whitespace-pre-wrap text-xs text-slate-800"
        >{{ previewContent }}</pre>
        <div v-else-if="previewKind === 'image'">
          <!-- M1 简版：直接显示路径，真正实现要走 OPFS → blob URL -->
          <div class="text-xs text-slate-500">图片预览：{{ previewContent }}</div>
        </div>
        <div v-else class="text-slate-500">{{ previewContent }}</div>
      </div>
    </section>
  </div>
</template>
