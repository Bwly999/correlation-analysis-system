/**
 * markdownArtifacts 单测：artifact 图片相对路径 → OPFS blob URL 替换。
 *
 * 覆盖：
 *   - 命中白名单的相对路径（../artifacts/x.png、artifacts/x.png）被替换为 blob: URL
 *   - http(s) / data:image / 非白名单相对路径保持原样
 *   - basePath 为 ''（对话流）时 ../artifacts/x.png → artifacts/x.png
 *   - dispose 后再 rewrite，旧 URL 被撤销（createObjectURL/revoke 计数）
 *   - 无 opfsRoot 时原样返回
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  createArtifactImageReplacer,
  resolveArtifactPath,
  inferImageMime,
} from '../markdownArtifacts'
import { writeFile } from '../../shared/opfsAccess'
import { ensureWorkspaceTree } from '../../shared/opfsAccess'
import { createMemOpfsRoot } from '../../shared/__tests__/memOpfs'

describe('resolveArtifactPath', () => {
  it("basePath '' 时 ../artifacts/x.png → artifacts/x.png（对话流场景）", () => {
    expect(resolveArtifactPath('', '../artifacts/x.png')).toBe('artifacts/x.png')
  })

  it("basePath '' 时 artifacts/x.png → artifacts/x.png", () => {
    expect(resolveArtifactPath('', 'artifacts/x.png')).toBe('artifacts/x.png')
  })

  it('basePath 为文件路径时按所在目录解析 ../', () => {
    // reports/sub/x.md → 所在目录 reports/sub；../artifacts/a.png → reports/artifacts/a.png
    // 但 reports/artifacts/a.png 不在白名单内会怎样？—— 在白名单（reports 开头）内，会通过
    expect(resolveArtifactPath('reports/sub/x.md', '../artifacts/a.png')).toBe(
      'reports/artifacts/a.png',
    )
  })

  it('http(s) / data:image 经白名单校验后返回 null', () => {
    expect(resolveArtifactPath('', 'https://a.com/x.png')).toBeNull()
    expect(resolveArtifactPath('', 'data:image/png;base64,xxx')).toBeNull()
  })

  it('顶级非白名单目录返回 null', () => {
    expect(resolveArtifactPath('', 'evil/x.png')).toBeNull()
  })

  it('越界 ../ 返回 null', () => {
    expect(resolveArtifactPath('', '../../etc/passwd')).toBeNull()
  })

  it('marked 编码过的中文文件名会被 decode 还原', () => {
    // marked 会把中文 URL 编码成 %E7%9B%B8... 而 OPFS 文件名是原始中文
    const encoded = '../artifacts/%E7%9B%B8%E5%85%B3%E6%80%A7%E7%83%AD%E5%8A%9B%E5%9B%BE.png'
    expect(resolveArtifactPath('', encoded)).toBe('artifacts/相关性热力图.png')
  })

  it('已经是原始中文（未编码）的路径也能解析', () => {
    expect(resolveArtifactPath('', '../artifacts/相关性热力图.png')).toBe(
      'artifacts/相关性热力图.png',
    )
  })
})

describe('inferImageMime', () => {
  it('按扩展名推断', () => {
    expect(inferImageMime('a.png')).toBe('image/png')
    expect(inferImageMime('a.JPG')).toBe('image/jpeg')
    expect(inferImageMime('a.svg')).toBe('image/svg+xml')
    expect(inferImageMime('a.unknown')).toBe('application/octet-stream')
  })
})

describe('createArtifactImageReplacer', () => {
  beforeEach(() => {
    // jsdom 的 URL.createObjectURL 默认抛错，这里 stub 成稳定返回值
    let counter = 0
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn(() => `blob:test-${++counter}`),
      revokeObjectURL: vi.fn(),
    })
  })

  const seed = async () => {
    const root = createMemOpfsRoot()
    await ensureWorkspaceTree(root)
    // 预置 artifacts/data_overview.png（PNG magic number 占位即可）
    await writeFile(root, 'artifacts/data_overview.png', new Uint8Array([0x89, 0x50, 0x4e, 0x47]))
    return root
  }

  it('命中白名单相对路径 → 替换为 blob: URL', async () => {
    const root = await seed()
    const replacer = createArtifactImageReplacer({ opfsRoot: root, basePath: '' })
    const html =
      '<p><img src="../artifacts/data_overview.png" alt="数据概览"></p>'
    const out = await replacer.rewrite(html)
    expect(out).toMatch(/src="blob:test-\d+"/)
    expect(out).not.toContain('../artifacts/data_overview.png')
  })

  it('artifacts/x.png（无 ../）也命中（行为更统一）', async () => {
    const root = await seed()
    const replacer = createArtifactImageReplacer({ opfsRoot: root, basePath: '' })
    const out = await replacer.rewrite('<img src="artifacts/data_overview.png">')
    expect(out).toMatch(/src="blob:test-\d+"/)
  })

  it('http(s) / data:image 原样保留', async () => {
    const root = await seed()
    const replacer = createArtifactImageReplacer({ opfsRoot: root, basePath: '' })
    const html =
      '<img src="https://a.com/x.png">' +
      '<img src="data:image/png;base64,iVBORw0KGgo=">'
    const out = await replacer.rewrite(html)
    expect(out).toContain('https://a.com/x.png')
    expect(out).toContain('data:image/png;base64,')
    expect(out).not.toMatch(/blob:test/)
  })

  it('artifact 文件不存在 → 保持原 src（不崩）', async () => {
    const root = await seed()
    const replacer = createArtifactImageReplacer({ opfsRoot: root, basePath: '' })
    const out = await replacer.rewrite('<img src="../artifacts/missing.png">')
    expect(out).toContain('../artifacts/missing.png')
    expect(out).not.toMatch(/blob:test/)
  })

  it('无 opfsRoot → 原样返回', async () => {
    const replacer = createArtifactImageReplacer({ basePath: '' })
    const html = '<img src="../artifacts/x.png">'
    expect(await replacer.rewrite(html)).toBe(html)
  })

  it('dispose 撤销当前 URL；再 rewrite 不残留旧 URL', async () => {
    const root = await seed()
    const replacer = createArtifactImageReplacer({ opfsRoot: root, basePath: '' })
    const html = '<img src="../artifacts/data_overview.png">'

    await replacer.rewrite(html)
    expect((URL.createObjectURL as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1)
    replacer.dispose()
    expect((URL.revokeObjectURL as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1)

    // 第二次 rewrite：dispose 内部已 revoke，rewrite 入口不再重复 revoke
    const callsBefore = (URL.revokeObjectURL as ReturnType<typeof vi.fn>).mock.calls.length
    await replacer.rewrite(html)
    // createObjectURL 再 +1
    expect((URL.createObjectURL as ReturnType<typeof vi.fn>).mock.calls.length).toBe(2)
    // 没有额外 revoke（首次 rewrite 前没有旧 URL）
    expect((URL.revokeObjectURL as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callsBefore)
  })

  it('连续 rewrite：第二次会先撤销第一次的 URL', async () => {
    const root = await seed()
    const replacer = createArtifactImageReplacer({ opfsRoot: root, basePath: '' })
    const html = '<img src="../artifacts/data_overview.png">'

    await replacer.rewrite(html)
    await replacer.rewrite(html)

    // 第二次 rewrite 入口撤销第一次的 1 个 URL
    expect((URL.revokeObjectURL as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1)
  })
})
