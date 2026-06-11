/**
 * resolvePreviewKind 单测。
 *
 * 把文件名映射到 preview viewer 类型：
 *   - .md          → 'markdown'
 *   - .py / .js / .ts / .json / .yml / .yaml / .toml / .txt → 'code'
 *   - .png / .jpg / .jpeg / .svg / .gif / .webp → 'image'
 *   - .csv / .tsv → 'table'
 *   - .parquet / .arrow / .feather → 'parquet-meta'  // M1 仅显示文件信息
 *   - 未知 → 'meta'
 */

import { describe, it, expect } from 'vitest'
import { resolvePreviewKind } from '../previewRouter'

describe('resolvePreviewKind', () => {
  it('Markdown', () => {
    expect(resolvePreviewKind('reports/main.md')).toBe('markdown')
  })

  it('代码 / 文本', () => {
    for (const path of [
      'scripts/a.py',
      'scripts/b.ts',
      'scripts/c.js',
      'config.json',
      'config.yml',
      'config.yaml',
      'config.toml',
      'note.txt',
    ]) {
      expect(resolvePreviewKind(path)).toBe('code')
    }
  })

  it('图片', () => {
    for (const path of [
      'artifacts/x.png',
      'artifacts/x.jpg',
      'artifacts/x.jpeg',
      'artifacts/x.svg',
      'artifacts/x.gif',
      'artifacts/x.webp',
    ]) {
      expect(resolvePreviewKind(path)).toBe('image')
    }
  })

  it('表格', () => {
    expect(resolvePreviewKind('inputs/upstream.csv')).toBe('table')
    expect(resolvePreviewKind('artifacts/x.tsv')).toBe('table')
  })

  it('Parquet 等数据 → parquet-meta', () => {
    expect(resolvePreviewKind('inputs/x.parquet')).toBe('parquet-meta')
    expect(resolvePreviewKind('inputs/x.arrow')).toBe('parquet-meta')
    expect(resolvePreviewKind('inputs/x.feather')).toBe('parquet-meta')
  })

  it('未知扩展名 → meta', () => {
    expect(resolvePreviewKind('artifacts/unknown.bin')).toBe('meta')
    expect(resolvePreviewKind('artifacts/no-ext')).toBe('meta')
  })

  it('大小写不敏感', () => {
    expect(resolvePreviewKind('reports/MAIN.MD')).toBe('markdown')
    expect(resolvePreviewKind('artifacts/X.PNG')).toBe('image')
  })
})
