/**
 * 文件预览路由：根据扩展名决定用哪个 viewer 渲染。
 *
 * 协议见 docs/design-doc/notebook-agent/UX与交互.md §7.1。
 */

export type PreviewKind = 'markdown' | 'code' | 'image' | 'table' | 'parquet-meta' | 'meta'

const EXT_MAP: Record<string, PreviewKind> = {
  '.md': 'markdown',

  '.py': 'code',
  '.js': 'code',
  '.ts': 'code',
  '.json': 'code',
  '.yml': 'code',
  '.yaml': 'code',
  '.toml': 'code',
  '.txt': 'code',

  '.png': 'image',
  '.jpg': 'image',
  '.jpeg': 'image',
  '.svg': 'image',
  '.gif': 'image',
  '.webp': 'image',

  '.csv': 'table',
  '.tsv': 'table',

  '.parquet': 'parquet-meta',
  '.arrow': 'parquet-meta',
  '.feather': 'parquet-meta',
}

const extOf = (p: string): string => {
  const i = p.lastIndexOf('.')
  return i === -1 ? '' : p.slice(i).toLowerCase()
}

export const resolvePreviewKind = (path: string): PreviewKind => {
  const ext = extOf(path)
  return EXT_MAP[ext] ?? 'meta'
}
