<script setup lang="ts">
/**
 * FileMetaCard.vue
 *
 * §7.1 文件信息卡 viewer：覆盖 `meta`（不支持预览）与 `parquet-meta` 两种 kind。
 *   展示 path / size / mtime，并给出对应的不支持预览提示文案。
 */

import { Info } from 'lucide-vue-next'

interface MetaInfo {
  size?: number
  modifiedAt?: number
}

const props = defineProps<{
  path: string
  meta?: MetaInfo
  /** parquet-meta 显示 Parquet 专用提示，其它走通用提示 */
  kind?: 'meta' | 'parquet-meta'
}>()

const formatTimestamp = (ts?: number) => {
  if (!ts) return '—'
  const d = new Date(ts)
  return d.toLocaleString('zh-CN', { hour12: false })
}

const formatSize = (bytes?: number) => {
  if (!bytes) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}
</script>

<template>
  <div class="flex-1 p-6">
    <div
      class="rounded-[var(--nb-radius-sm)] border p-5"
      style="border-color: var(--nb-rule); background-color: var(--nb-card); box-shadow: var(--nb-shadow-sm);"
    >
      <div class="flex items-center gap-2">
        <Info :size="13" :stroke-width="1.6" style="color: var(--nb-copper-deep);" />
        <span
          class="nb-eyebrow"
          style="font-size: 10px; letter-spacing: 0.22em; color: var(--nb-ink);"
        >
          File / 文件信息
        </span>
      </div>
      <div class="mt-4 nb-rule" />
      <dl class="mt-4 grid grid-cols-[80px_1fr] gap-y-2.5 text-[12px]">
        <dt
          class="nb-mono text-[10px]"
          style="color: var(--nb-ink-faint); letter-spacing: 0.14em; font-weight: 700;"
        >
          PATH
        </dt>
        <dd class="nb-mono" style="color: var(--nb-ink); word-break: break-all;">
          {{ props.path }}
        </dd>
        <dt
          class="nb-mono text-[10px]"
          style="color: var(--nb-ink-faint); letter-spacing: 0.14em; font-weight: 700;"
        >
          SIZE
        </dt>
        <dd class="nb-mono tabular-nums" style="color: var(--nb-ink);">
          {{ formatSize(props.meta?.size) }}
        </dd>
        <dt
          class="nb-mono text-[10px]"
          style="color: var(--nb-ink-faint); letter-spacing: 0.14em; font-weight: 700;"
        >
          MTIME
        </dt>
        <dd class="nb-mono" style="color: var(--nb-ink);">
          {{ formatTimestamp(props.meta?.modifiedAt) }}
        </dd>
      </dl>
      <p
        v-if="props.kind === 'parquet-meta'"
        class="nb-display-italic mt-5 text-[12.5px] leading-6"
        style="color: var(--nb-ink-mute);"
      >
        Parquet/Arrow 格式的内容预览未在 M1 实装。可下载后用本地工具或让 Agent 通过 python_exec 读取。
      </p>
      <p
        v-else
        class="nb-display-italic mt-5 text-[12.5px] leading-6"
        style="color: var(--nb-ink-mute);"
      >
        此格式不支持预览。可点击下载到本地查看。
      </p>
    </div>
  </div>
</template>
