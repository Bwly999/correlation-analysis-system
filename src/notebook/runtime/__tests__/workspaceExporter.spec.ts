/**
 * workspaceExporter 单测。
 *
 * exportWorkspaceZip(opfsRoot, sessionId)：
 *   - 从 OPFS 读全部文件
 *   - 打包成 ZIP（用纯 JS store 实现，无外部依赖）
 *   - 返回 Blob + 文件名建议
 *
 * exportMainReportMarkdown(opfsRoot)：
 *   - 读 reports/main.md
 *   - 不存在时返回 null
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  createMemOpfsRoot,
  type MemDirectoryHandle,
} from '../../shared/__tests__/memOpfs'
import { ensureWorkspaceTree, writeFile } from '../../shared/opfsAccess'
import {
  exportWorkspaceZip,
  exportMainReportMarkdown,
  unzipWorkspace,
} from '../workspaceExporter'

describe('workspaceExporter.exportMainReportMarkdown', () => {
  let root: MemDirectoryHandle
  beforeEach(async () => {
    root = createMemOpfsRoot()
    await ensureWorkspaceTree(root)
  })

  it('存在 → 返回内容', async () => {
    await writeFile(root, 'reports/main.md', '# 报告\n你好')
    const md = await exportMainReportMarkdown(root)
    expect(md).toBe('# 报告\n你好')
  })

  it('不存在 → 返回 null', async () => {
    const md = await exportMainReportMarkdown(root)
    expect(md).toBeNull()
  })
})

describe('workspaceExporter.exportWorkspaceZip', () => {
  let root: MemDirectoryHandle
  beforeEach(async () => {
    root = createMemOpfsRoot()
    await ensureWorkspaceTree(root)
  })

  it('空 workspace 也能产出 zip', async () => {
    const out = await exportWorkspaceZip(root, 'sess-1')
    expect(out.bytes.byteLength).toBeGreaterThan(0)
    expect(out.fileName).toMatch(/notebook.*sess-1.*\.zip$/)
  })

  it('zip 内含写入的全部文件路径', async () => {
    await writeFile(root, 'inputs/upstream.csv', 'a,b\n1,2')
    await writeFile(root, 'reports/main.md', '# 报告')
    const out = await exportWorkspaceZip(root, 'sess-1')

    // 解析 zip：通过 Central Directory 文件头部"PK\x05\x06"找 entry 列表
    const buf = out.bytes
    const text = new TextDecoder('latin1').decode(buf)
    expect(text).toContain('inputs/upstream.csv')
    expect(text).toContain('reports/main.md')
  })

  it('文件名 ASCII 安全（无空格 / 无特殊字符）', async () => {
    const out = await exportWorkspaceZip(root, 'session_with-id-123')
    expect(out.fileName).toMatch(/^[\w.-]+\.zip$/)
  })
})

describe('workspaceExporter.unzipWorkspace', () => {
  let root: MemDirectoryHandle
  beforeEach(async () => {
    root = createMemOpfsRoot()
    await ensureWorkspaceTree(root)
  })

  it('buildZip → unzip 往返对称：还原全部文件路径与字节内容', async () => {
    // 覆盖四类目录 + 中文内容 + 二进制字节（png 头）
    await writeFile(root, 'inputs/upstream.csv', 'a,b\n1,2')
    await writeFile(root, 'scripts/analyze.py', '# 分析脚本\nprint(1)')
    await writeFile(root, 'reports/main.md', '# 报告\n中文内容')
    const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    await writeFile(root, 'artifacts/chart.png', pngBytes)

    const { bytes } = await exportWorkspaceZip(root, 'sess-1')
    const files = unzipWorkspace(bytes)

    const byPath = new Map(files.map((f) => [f.path, f.bytes]))

    expect(files).toHaveLength(4)
    expect(new TextDecoder().decode(byPath.get('inputs/upstream.csv')!)).toBe('a,b\n1,2')
    expect(new TextDecoder().decode(byPath.get('scripts/analyze.py')!)).toBe('# 分析脚本\nprint(1)')
    expect(new TextDecoder().decode(byPath.get('reports/main.md')!)).toBe('# 报告\n中文内容')
    expect(Array.from(byPath.get('artifacts/chart.png')!)).toEqual(Array.from(pngBytes))
  })

  it('空 workspace 打出的 zip 解出 0 个文件', async () => {
    const { bytes } = await exportWorkspaceZip(root, 'sess-1')
    expect(unzipWorkspace(bytes)).toHaveLength(0)
  })

  it('遇到非 store 压缩条目跳过而非崩溃', async () => {
    // 手工拼一个含 deflate 条目的 zip 头部：compression=8，无数据。
    // unzipWorkspace 应跳过该条目并返回空数组（不抛）。
    const buf = new Uint8Array(30)
    const view = new DataView(buf.buffer)
    view.setUint32(0, 0x04034b50, true) // Local File Header 签名
    view.setUint16(8, 8, true) // compression = deflate
    view.setUint32(18, 0, true) // compressedSize
    view.setUint32(22, 0, true) // uncompressedSize
    view.setUint16(26, 0, true) // nameLen
    view.setUint16(28, 0, true) // extraLen
    expect(unzipWorkspace(buf)).toHaveLength(0)
  })
})
