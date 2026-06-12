<script setup lang="ts">
/**
 * WorkspaceTree.vue
 *
 * §6 Workspace 文件树升级版：
 *   - 4 顶级目录固定（inputs / scripts / artifacts / reports），不可创建其他
 *   - 文件按 mtime 倒序
 *   - 30s 内变更的文件标 ⭐
 *   - hover 显示 [👁 预览] [⬇ 下载] [📋 拷路径]
 *   - 单击 = 选中并预览
 *
 * 不实现：删除 / 重命名 / 双击新 tab（M2）
 */

import { computed, type Ref } from 'vue'
import {
  Folder,
  FolderOpen,
  File as FileIcon,
  FileText,
  Image as ImageIcon,
  FileCode2,
  Sheet,
  Download,
  Eye,
  Clipboard,
  Star,
} from 'lucide-vue-next'
import type { TreeNode } from '../shared/opfsAccess'
import { WORKSPACE_TOP_DIRS } from '../shared/opfsAccess'

const props = defineProps<{
  tree: TreeNode | null
  selectedPath: string | null
  /** path → bool；从 useFreshFileTracker 注入 */
  isFresh: (path: string) => boolean
}>()

const emit = defineEmits<{
  select: [path: string]
  download: [path: string]
  copyPath: [path: string]
}>()

interface DirGroup {
  name: string
  fullPath: string
  files: Array<{ path: string; name: string; size: number; modifiedAt: number }>
}

const groups = computed<DirGroup[]>(() => {
  const map = new Map<string, DirGroup>()
  for (const dir of WORKSPACE_TOP_DIRS) {
    map.set(dir, { name: dir, fullPath: dir, files: [] })
  }
  if (props.tree?.children) {
    for (const top of props.tree.children) {
      if (top.kind !== 'directory') continue
      const group = map.get(top.name)
      if (!group) continue
      // 仅展示一层文件；允许子目录递归（M1 简化：拍平显示）
      const collect = (node: TreeNode, prefix: string) => {
        if (!node.children) return
        for (const child of node.children) {
          const path = prefix ? `${prefix}/${child.name}` : `${top.name}/${child.name}`
          if (child.kind === 'directory') {
            collect(child, path)
          } else {
            group.files.push({
              path,
              name: child.name,
              size: child.size ?? 0,
              modifiedAt: child.modifiedAt ?? 0,
            })
          }
        }
      }
      collect(top, top.name)
      group.files.sort((a, b) => b.modifiedAt - a.modifiedAt)
    }
  }
  return Array.from(map.values())
})

const totalFiles = computed(() => groups.value.reduce((acc, g) => acc + g.files.length, 0))

const sizeLabel = (bytes: number) => {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

const timeLabel = (ts: number) => {
  if (!ts) return ''
  const d = new Date(ts)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

const fileKindIcon = (name: string) => {
  const ext = name.slice(name.lastIndexOf('.')).toLowerCase()
  if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'].includes(ext)) return ImageIcon
  if (['.md', '.txt'].includes(ext)) return FileText
  if (['.csv', '.tsv', '.parquet', '.arrow', '.feather'].includes(ext)) return Sheet
  if (['.py', '.js', '.ts', '.json', '.yml', '.yaml', '.toml'].includes(ext)) return FileCode2
  return FileIcon
}

const groupIcon = (name: string) => {
  switch (name) {
    case 'inputs':
      return '📥'
    case 'scripts':
      return '🐍'
    case 'artifacts':
      return '📊'
    case 'reports':
      return '📝'
    default:
      return '📁'
  }
}
</script>

<template>
  <div class="flex h-full flex-col bg-white">
    <header class="flex items-center justify-between border-b border-slate-200 px-3.5 py-2.5">
      <div class="flex items-center gap-2">
        <FolderOpen :size="14" class="text-slate-500" />
        <span class="text-[12px] font-semibold tracking-tight text-slate-900">Workspace</span>
      </div>
      <span class="font-mono text-[10px] uppercase tracking-[0.18em] text-slate-400">
        {{ totalFiles }} files
      </span>
    </header>

    <div class="flex-1 overflow-y-auto">
      <section
        v-for="group in groups"
        :key="group.name"
        class="border-b border-slate-100 last:border-b-0"
      >
        <header class="flex items-center justify-between bg-slate-50/60 px-3 py-1.5">
          <div class="flex items-center gap-2">
            <span class="text-[12px]">{{ groupIcon(group.name) }}</span>
            <span class="font-mono text-[11px] font-semibold tracking-wide text-slate-700">
              {{ group.name }}/
            </span>
          </div>
          <span class="font-mono text-[10px] tabular-nums text-slate-400">
            [{{ group.files.length }}]
          </span>
        </header>
        <ul v-if="group.files.length" class="py-1">
          <li
            v-for="f in group.files"
            :key="f.path"
            class="group relative flex cursor-pointer items-center gap-2 px-3 py-1 transition"
            :class="
              selectedPath === f.path
                ? 'bg-blue-50/70 ring-inset ring-1 ring-blue-200'
                : 'hover:bg-slate-50'
            "
            :data-path="f.path"
            @click="emit('select', f.path)"
          >
            <component :is="fileKindIcon(f.name)" :size="13" class="shrink-0 text-slate-400 group-hover:text-slate-600" />
            <span
              class="min-w-0 truncate text-[12px] tracking-tight"
              :class="selectedPath === f.path ? 'font-semibold text-blue-800' : 'text-slate-700'"
            >
              {{ f.name }}
            </span>

            <Star
              v-if="isFresh(f.path)"
              :size="11"
              class="shrink-0 text-amber-500"
              fill="currentColor"
              title="最近 30s 内变更"
            />

            <span class="ml-auto flex shrink-0 items-center gap-1.5 font-mono text-[10px] tabular-nums text-slate-400">
              <span v-if="f.modifiedAt">{{ timeLabel(f.modifiedAt) }}</span>
              <span v-if="f.size">{{ sizeLabel(f.size) }}</span>
            </span>

            <!-- hover 工具栏 -->
            <div
              class="invisible absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5 rounded-md border border-slate-200 bg-white px-1 py-0.5 shadow-sm opacity-0 transition group-hover:visible group-hover:opacity-100"
            >
              <button
                class="flex h-5 w-5 items-center justify-center rounded text-slate-500 hover:bg-blue-50 hover:text-blue-600"
                title="预览"
                @click.stop="emit('select', f.path)"
              >
                <Eye :size="11" />
              </button>
              <button
                class="flex h-5 w-5 items-center justify-center rounded text-slate-500 hover:bg-blue-50 hover:text-blue-600"
                title="下载"
                @click.stop="emit('download', f.path)"
              >
                <Download :size="11" />
              </button>
              <button
                class="flex h-5 w-5 items-center justify-center rounded text-slate-500 hover:bg-blue-50 hover:text-blue-600"
                title="拷贝路径"
                @click.stop="emit('copyPath', f.path)"
              >
                <Clipboard :size="11" />
              </button>
            </div>
          </li>
        </ul>
        <p v-else class="px-3 py-1.5 text-[11px] text-slate-400">
          暂无文件
        </p>
      </section>
    </div>
  </div>
</template>
