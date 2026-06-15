<script setup lang="ts">
/**
 * WorkspaceTree.vue
 *
 * §6 Workspace 文件树升级版：
 *   - 4 顶级目录固定（inputs / scripts / artifacts / reports），不可创建其他
 *   - 文件按 mtime 倒序
 *   - 30s 内变更的文件标 ★
 *   - hover 显示 [预览 / 下载 / 拷路径]
 *   - 单击 = 选中并预览
 *
 * 视觉风格 ▸ 编辑稿目录：纯 SVG 图标（无 emoji），每个分组一个章节眉签。
 */

import { computed } from 'vue'
import {
  Download,
  Eye,
  Clipboard,
  Star,
  ArrowDownToLine,
  Folder,
} from 'lucide-vue-next'
import type { TreeNode } from '../shared/opfsAccess'
import { WORKSPACE_TOP_DIRS } from '../shared/opfsAccess'
import FileIcon from './FileIcon.vue'

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

const groupMeta = (name: string): { label: string } => {
  switch (name) {
    case 'inputs':
      return { label: 'Inputs' }
    case 'scripts':
      return { label: 'Scripts' }
    case 'artifacts':
      return { label: 'Artifacts' }
    case 'reports':
      return { label: 'Reports' }
    default:
      return { label: name }
  }
}
</script>

<template>
  <div
    class="flex h-full flex-col"
    style="background-color: var(--nb-sidebar);"
  >
    <header
      class="flex items-center justify-between px-4 pt-3.5 pb-2.5"
    >
      <div class="flex items-center gap-2">
        <span
          class="flex h-5 w-5 items-center justify-center rounded-[var(--nb-radius-xs)]"
          style="background-color: var(--nb-copper-soft);"
        >
          <ArrowDownToLine
            :size="12"
            :stroke-width="1.8"
            style="color: var(--nb-copper-deep);"
          />
        </span>
        <span
          class="nb-eyebrow"
          style="font-size: 10.5px; letter-spacing: 0.2em; color: var(--nb-ink);"
        >
          Workspace
        </span>
      </div>
      <span
        class="nb-chip"
        style="padding: 1px 7px; font-size: 10px; letter-spacing: 0.06em;"
      >
        {{ totalFiles }} files
      </span>
    </header>
    <div
      class="mx-4 nb-rule"
      style="opacity: 0.7;"
    />

    <div class="nb-scroll flex-1 overflow-y-auto">
      <section
        v-for="group in groups"
        :key="group.name"
        class="border-b last:border-b-0"
        style="border-color: var(--nb-rule);"
      >
        <header
          class="flex items-center justify-between px-4 py-2"
          style="background-color: var(--nb-overlay);"
        >
          <div class="flex min-w-0 items-center gap-2">
            <Folder
              :size="12"
              :stroke-width="1.7"
              style="color: var(--nb-ink-mute);"
            />
            <span
              class="nb-mono text-[10.5px]"
              style="color: var(--nb-ink); letter-spacing: 0.04em; font-weight: 600;"
            >
              {{ group.name }}/
            </span>
            <span
              class="nb-display-italic text-[11px] truncate"
              style="color: var(--nb-ink-faint);"
            >
              {{ groupMeta(group.name).label }}
            </span>
          </div>
          <span
            class="nb-mono text-[10px] tabular-nums shrink-0"
            style="color: var(--nb-ink-faint); letter-spacing: 0.04em;"
          >
            {{ group.files.length }}
          </span>
        </header>
        <ul
          v-if="group.files.length"
          class="py-1"
          style="background-color: var(--nb-paper);"
        >
          <li
            v-for="f in group.files"
            :key="f.path"
            class="group relative flex cursor-pointer items-center gap-2 px-4 py-[5px] transition-colors"
            :style="
              selectedPath === f.path
                ? {
                    backgroundColor: 'var(--nb-copper-soft)',
                    boxShadow: 'inset 2px 0 0 var(--nb-copper)',
                  }
                : {}
            "
            :data-path="f.path"
            @click="emit('select', f.path)"
            @mouseenter="(e) => {
              if (selectedPath !== f.path) (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--nb-overlay)'
            }"
            @mouseleave="(e) => {
              if (selectedPath !== f.path) (e.currentTarget as HTMLElement).style.backgroundColor = ''
            }"
          >
            <FileIcon
              :name="f.name"
              :size="14"
              class="shrink-0"
            />
            <span
              class="min-w-0 truncate text-[12px]"
              :style="
                selectedPath === f.path
                  ? { color: 'var(--nb-ink)', fontWeight: 600 }
                  : { color: 'var(--nb-ink-soft)' }
              "
            >
              {{ f.name }}
            </span>

            <Star
              v-if="isFresh(f.path)"
              :size="10"
              :stroke-width="1.6"
              class="shrink-0"
              fill="currentColor"
              style="color: var(--nb-copper);"
              title="最近 30s 内变更"
            />

            <span
              class="ml-auto flex shrink-0 items-center gap-2 nb-mono text-[10px] tabular-nums group-hover:opacity-0 transition-opacity"
              style="color: var(--nb-ink-faint);"
            >
              <span v-if="f.modifiedAt">{{ timeLabel(f.modifiedAt) }}</span>
              <span v-if="f.size">{{ sizeLabel(f.size) }}</span>
            </span>

            <!-- hover 工具栏 -->
            <div
              class="invisible absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-0.5 rounded-[var(--nb-radius-xs)] border px-1 py-0.5 opacity-0 transition group-hover:visible group-hover:opacity-100"
              style="border-color: var(--nb-rule-strong); background-color: var(--nb-card); box-shadow: var(--nb-shadow-sm);"
            >
              <button
                class="flex h-5 w-5 items-center justify-center rounded-[var(--nb-radius-xs)] transition"
                style="color: var(--nb-ink-mute);"
                title="预览"
                @click.stop="emit('select', f.path)"
                @mouseenter="(e) => {
                  (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--nb-copper-soft)';
                  (e.currentTarget as HTMLElement).style.color = 'var(--nb-copper-deep)'
                }"
                @mouseleave="(e) => {
                  (e.currentTarget as HTMLElement).style.backgroundColor = '';
                  (e.currentTarget as HTMLElement).style.color = 'var(--nb-ink-mute)'
                }"
              >
                <Eye :size="11" :stroke-width="1.6" />
              </button>
              <button
                class="flex h-5 w-5 items-center justify-center rounded-[var(--nb-radius-xs)] transition"
                style="color: var(--nb-ink-mute);"
                title="下载"
                @click.stop="emit('download', f.path)"
                @mouseenter="(e) => {
                  (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--nb-copper-soft)';
                  (e.currentTarget as HTMLElement).style.color = 'var(--nb-copper-deep)'
                }"
                @mouseleave="(e) => {
                  (e.currentTarget as HTMLElement).style.backgroundColor = '';
                  (e.currentTarget as HTMLElement).style.color = 'var(--nb-ink-mute)'
                }"
              >
                <Download :size="11" :stroke-width="1.6" />
              </button>
              <button
                class="flex h-5 w-5 items-center justify-center rounded-[var(--nb-radius-xs)] transition"
                style="color: var(--nb-ink-mute);"
                title="拷贝路径"
                @click.stop="emit('copyPath', f.path)"
                @mouseenter="(e) => {
                  (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--nb-copper-soft)';
                  (e.currentTarget as HTMLElement).style.color = 'var(--nb-copper-deep)'
                }"
                @mouseleave="(e) => {
                  (e.currentTarget as HTMLElement).style.backgroundColor = '';
                  (e.currentTarget as HTMLElement).style.color = 'var(--nb-ink-mute)'
                }"
              >
                <Clipboard :size="11" :stroke-width="1.6" />
              </button>
            </div>
          </li>
        </ul>
        <p
          v-else
          class="px-4 py-2 nb-display-italic text-[11.5px]"
          style="color: var(--nb-ink-faint);"
        >
          暂无文件
        </p>
      </section>
    </div>
  </div>
</template>
