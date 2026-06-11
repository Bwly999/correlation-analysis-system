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
