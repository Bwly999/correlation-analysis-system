/**
 * workspaceExporter 单测。
 *
 * 基于 JSZip 实现：
 *   - exportWorkspaceZip(opfsRoot, sessionId)：从 OPFS 读全部文件 → 打包 ZIP（DEFLATE，UTF-8 文件名）
 *   - unzipWorkspace(bytes)：解压 ZIP（兼容任意压缩方式）
 *   - exportMainReportMarkdown(opfsRoot)：读 reports/main.md
 */

import { describe, it, expect, beforeEach } from 'vitest'
import JSZip from 'jszip'
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

  it('zip 内含写入的全部文件路径（含中文文件名不乱码）', async () => {
    await writeFile(root, 'inputs/upstream.csv', 'a,b\n1,2')
    await writeFile(root, 'inputs/相关性分析.csv', '因子,数值\nA,0.5')
    await writeFile(root, 'reports/main.md', '# 报告')
    const out = await exportWorkspaceZip(root, 'sess-1')

    // 用 JSZip 读回条目名，校验中文路径无损
    const zip = await JSZip.loadAsync(out.bytes)
    const names = Object.keys(zip.files)
    expect(names).toContain('inputs/upstream.csv')
    expect(names).toContain('inputs/相关性分析.csv')
    expect(names).toContain('reports/main.md')
  })

  it('中文文件名：General Purpose Bit Flag bit 11 置位（UTF-8 标记）', async () => {
    // 第三方解压工具（Windows 资源管理器 / 7-Zip / macOS 归档实用工具）依赖此标记，
    // 否则按 CP437 解码 → 中文乱码、扩展名异常、无法打开。
    await writeFile(root, 'inputs/相关性分析.csv', 'a,b\n1,2')
    const out = await exportWorkspaceZip(root, 'sess-1')
    const view = new DataView(out.bytes.buffer, out.bytes.byteOffset, out.bytes.byteLength)

    // 遍历 Local File Header，断言含中文条目的 GP Flag bit 11 置位（0x0800）
    let offset = 0
    let sawUtf8Flag = false
    let sawChineseName = false
    while (offset + 30 <= out.bytes.byteLength) {
      if (view.getUint32(offset, true) !== 0x04034b50) break
      const gpFlags = view.getUint16(offset + 6, true)
      const nameLen = view.getUint16(offset + 26, true)
      const extraLen = view.getUint16(offset + 28, true)
      const nameStart = offset + 30
      const name = new TextDecoder().decode(out.bytes.subarray(nameStart, nameStart + nameLen))
      if (name.includes('相关性分析.csv')) {
        sawChineseName = true
        if (gpFlags & 0x0800) sawUtf8Flag = true
      }
      offset = nameStart + nameLen + extraLen + view.getUint32(offset + 18, true)
    }

    expect(sawChineseName).toBe(true)
    expect(sawUtf8Flag).toBe(true)
  })

  it('文件名 ASCII 安全（无空格 / 无特殊字符）', async () => {
    const out = await exportWorkspaceZip(root, 'session_with-id-123')
    expect(out.fileName).toMatch(/^[\w.-]+\.zip$/)
  })

  it('toBlob() 产出可被 JSZip 再次解析的合法 zip', async () => {
    await writeFile(root, 'inputs/upstream.csv', 'a,b\n1,2')
    const out = await exportWorkspaceZip(root, 'sess-1')
    const blob = out.toBlob()
    const buf = new Uint8Array(await blob.arrayBuffer())
    const zip = await JSZip.loadAsync(buf)
    const file = zip.file('inputs/upstream.csv')
    expect(file).not.toBeNull()
    expect(await file!.async('string')).toBe('a,b\n1,2')
  })
})

describe('workspaceExporter.unzipWorkspace', () => {
  let root: MemDirectoryHandle
  beforeEach(async () => {
    root = createMemOpfsRoot()
    await ensureWorkspaceTree(root)
  })

  it('buildZip → unzip 往返对称：还原全部文件路径与字节内容', async () => {
    // 覆盖四类目录 + 中文内容 + 中文文件名 + 二进制字节（png 头）
    await writeFile(root, 'inputs/upstream.csv', 'a,b\n1,2')
    await writeFile(root, 'scripts/analyze.py', '# 分析脚本\nprint(1)')
    await writeFile(root, 'reports/main.md', '# 报告\n中文内容')
    // 含中文的文件名 —— 验证 UTF-8 flag 往返后路径不乱码
    await writeFile(root, 'inputs/相关性分析.csv', '因子,数值\nA,0.5')
    const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    await writeFile(root, 'artifacts/chart.png', pngBytes)

    const { bytes } = await exportWorkspaceZip(root, 'sess-1')
    const files = await unzipWorkspace(bytes)

    const byPath = new Map(files.map((f) => [f.path, f.bytes]))

    expect(files).toHaveLength(5)
    expect(new TextDecoder().decode(byPath.get('inputs/upstream.csv')!)).toBe('a,b\n1,2')
    expect(new TextDecoder().decode(byPath.get('scripts/analyze.py')!)).toBe('# 分析脚本\nprint(1)')
    expect(new TextDecoder().decode(byPath.get('reports/main.md')!)).toBe('# 报告\n中文内容')
    expect(new TextDecoder().decode(byPath.get('inputs/相关性分析.csv')!)).toBe('因子,数值\nA,0.5')
    expect(Array.from(byPath.get('artifacts/chart.png')!)).toEqual(Array.from(pngBytes))
  })

  it('空 workspace 打出的 zip 解出 0 个文件', async () => {
    const { bytes } = await exportWorkspaceZip(root, 'sess-1')
    expect(await unzipWorkspace(bytes)).toHaveLength(0)
  })

  it('能解压第三方 DEFLATE 压缩的 zip（含中文文件名）', async () => {
    // 模拟一个外部工具产出的 zip：手动用 JSZip 以默认 DEFLATE 压缩构造
    const zip = new JSZip()
    zip.file('数据/因子表.csv', 'x,y\n1,2')
    zip.file('report.md', '# 分析')
    const bytes = await zip.generateAsync({
      type: 'uint8array',
      compression: 'DEFLATE',
      compressionOptions: { level: 9 },
    })

    const files = await unzipWorkspace(bytes)
    const byPath = new Map(files.map((f) => [f.path, f.bytes]))
    expect(files).toHaveLength(2)
    expect(new TextDecoder().decode(byPath.get('数据/因子表.csv')!)).toBe('x,y\n1,2')
    expect(new TextDecoder().decode(byPath.get('report.md')!)).toBe('# 分析')
  })
})
