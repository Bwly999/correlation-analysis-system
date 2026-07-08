/**
 * Notebook fs_* 工具集单测。
 *
 * 验证 [docs/design-doc/notebook-agent/工具集协议.md §4] 的全部行为：
 *   - fs_read 截断（数据 10 行 / 文本 300 行 / 单行 2000 字符）
 *   - fs_write 路径校验 + 字节计数
 *   - fs_edit 字符串替换 + string_not_found / string_not_unique
 *   - fs_list 浅 + 递归
 *   - fs_grep 模式匹配 + maxMatches + 行号
 *   - 错误码：path_out_of_workspace / file_not_found / binary_file_not_supported
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { createMemOpfsRoot, type MemDirectoryHandle } from '../../../notebook/shared/__tests__/memOpfs'
import {
  createQuotaTracker,
  ensureWorkspaceTree,
  writeFile,
} from '../../../notebook/shared/opfsAccess'
import {
  fsRead,
  fsWrite,
  fsEdit,
  fsList,
  fsGrep,
  type FsToolError,
} from '../fsTools'

describe('Notebook fs_* 工具', () => {
  let root: MemDirectoryHandle

  beforeEach(async () => {
    root = createMemOpfsRoot()
    await ensureWorkspaceTree(root)
  })

  describe('fsRead', () => {
    it('文本文件 → 完整返回 + totalLines', async () => {
      await writeFile(root, 'reports/main.md', '# 标题\n第二行\n第三行')
      const r = await fsRead(root, { path: 'reports/main.md' })
      expect(r.content).toBe('# 标题\n第二行\n第三行')
      expect(r.totalLines).toBe(3)
      expect(r.truncated).toBe(false)
    })

    it('文本文件 ≤ 300 行不截断', async () => {
      const lines = Array.from({ length: 250 }, (_, i) => `line${i}`).join('\n')
      await writeFile(root, 'scripts/x.py', lines)
      const r = await fsRead(root, { path: 'scripts/x.py' })
      expect(r.totalLines).toBe(250)
      expect(r.truncated).toBe(false)
    })

    it('文本文件 > 300 行 → 截断', async () => {
      const lines = Array.from({ length: 500 }, (_, i) => `line${i}`).join('\n')
      await writeFile(root, 'scripts/x.py', lines)
      const r = await fsRead(root, { path: 'scripts/x.py' })
      expect(r.totalLines).toBe(500)
      expect(r.truncated).toBe(true)
      expect(r.content.split('\n').length).toBeLessThanOrEqual(300)
    })

    it('单行 > 2000 字符 → 行内截断 + 标记', async () => {
      const longLine = 'x'.repeat(2500)
      await writeFile(root, 'scripts/x.py', longLine)
      const r = await fsRead(root, { path: 'scripts/x.py' })
      expect(r.content).toMatch(/\.\.\. \[truncated, \+500 chars\]/)
      expect(r.content.length).toBeLessThan(2500)
    })

    it('数据文件 .csv 默认只取 10 行', async () => {
      const lines = Array.from({ length: 50 }, (_, i) => `${i},${i * 2}`).join('\n')
      await writeFile(root, 'inputs/data.csv', `a,b\n${lines}`)
      const r = await fsRead(root, { path: 'inputs/data.csv' })
      expect(r.truncated).toBe(true)
      expect(r.content.split('\n').length).toBeLessThanOrEqual(10)
    })

    it('显式 limit/offset 生效', async () => {
      const lines = Array.from({ length: 20 }, (_, i) => `L${i}`).join('\n')
      await writeFile(root, 'scripts/x.py', lines)
      const r = await fsRead(root, { path: 'scripts/x.py', offset: 5, limit: 3 })
      expect(r.content).toBe('L5\nL6\nL7')
      expect(r.truncated).toBe(true)
    })

    it('二进制文件 .png → 抛 binary_file_not_supported', async () => {
      // PNG magic header
      await writeFile(
        root,
        'artifacts/x.png',
        new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).buffer,
      )
      await expect(fsRead(root, { path: 'artifacts/x.png' })).rejects.toMatchObject({
        code: 'binary_file_not_supported',
      } satisfies Partial<FsToolError>)
    })

    it('文件不存在 → file_not_found', async () => {
      await expect(fsRead(root, { path: 'reports/nope.md' })).rejects.toMatchObject({
        code: 'file_not_found',
      })
    })

    it('路径越界 → path_out_of_workspace', async () => {
      await expect(fsRead(root, { path: '../etc/passwd' })).rejects.toMatchObject({
        code: 'path_out_of_workspace',
      })
    })
  })

  describe('fsWrite', () => {
    it('写入 + 返回 path/bytes', async () => {
      const r = await fsWrite(root, { path: 'reports/main.md', content: '# 报告' })
      expect(r.path).toBe('reports/main.md')
      expect(r.bytes).toBeGreaterThan(0)
    })

    it('路径越界 → path_out_of_workspace', async () => {
      await expect(
        fsWrite(root, { path: '/etc/passwd', content: 'evil' }),
      ).rejects.toMatchObject({ code: 'path_out_of_workspace' })
    })

    it('content 非字符串 → invalid_arguments', async () => {
      await expect(
        fsWrite(root, { path: 'reports/x.md', content: 123 as unknown as string }),
      ).rejects.toMatchObject({ code: 'invalid_arguments' })
    })

    it('传 tracker：超限 → quota_exceeded（验证透传 + 不被 wrapPathError 吞）', async () => {
      const tracker = createQuotaTracker(8, 8) // 单次/总量都 8 字节
      await expect(
        fsWrite(root, { path: 'reports/big.md', content: 'x'.repeat(100) }, tracker),
      ).rejects.toMatchObject({ code: 'quota_exceeded' })
    })
  })

  describe('fsEdit', () => {
    it('正常替换 → 返回 replacements=1', async () => {
      await writeFile(root, 'scripts/x.py', 'foo bar baz')
      const r = await fsEdit(root, {
        path: 'scripts/x.py',
        oldStr: 'bar',
        newStr: 'BAR',
      })
      expect(r.replacements).toBe(1)
    })

    it('oldStr 不存在 → string_not_found', async () => {
      await writeFile(root, 'scripts/x.py', 'foo')
      await expect(
        fsEdit(root, { path: 'scripts/x.py', oldStr: 'NOTHERE', newStr: 'X' }),
      ).rejects.toMatchObject({ code: 'string_not_found' })
    })

    it('oldStr 多次出现且 replaceAll=false → string_not_unique', async () => {
      await writeFile(root, 'scripts/x.py', 'foo foo')
      await expect(
        fsEdit(root, { path: 'scripts/x.py', oldStr: 'foo', newStr: 'F' }),
      ).rejects.toMatchObject({ code: 'string_not_unique' })
    })

    it('replaceAll=true 时多次替换都生效', async () => {
      await writeFile(root, 'scripts/x.py', 'foo foo foo')
      const r = await fsEdit(root, {
        path: 'scripts/x.py',
        oldStr: 'foo',
        newStr: 'F',
        replaceAll: true,
      })
      expect(r.replacements).toBe(3)
    })

    it('传 tracker：替换后超限 → quota_exceeded', async () => {
      await writeFile(root, 'scripts/x.py', 'short')
      const tracker = createQuotaTracker(8, 8) // 总量 8 字节，替换后内容更长会超
      await expect(
        fsEdit(
          root,
          { path: 'scripts/x.py', oldStr: 'short', newStr: 'a-much-longer-string' },
          tracker,
        ),
      ).rejects.toMatchObject({ code: 'quota_exceeded' })
    })
  })

  describe('fsList', () => {
    it('默认列根目录的 4 个固定子目录', async () => {
      const r = await fsList(root, {})
      expect(r.entries.map((e) => e.name).sort()).toEqual(
        ['artifacts', 'inputs', 'reports', 'scripts'].sort(),
      )
      expect(r.entries.every((e) => e.kind === 'directory')).toBe(true)
    })

    it('递归列出嵌套', async () => {
      await writeFile(root, 'inputs/upstream.csv', 'a,b')
      await writeFile(root, 'scripts/01.py', 'print(1)')
      const r = await fsList(root, { path: '', recursive: true })
      const all = r.entries.map((e) => e.name).join(',')
      expect(all).toContain('upstream.csv')
      expect(all).toContain('01.py')
    })

    it('指定路径 → 只列该路径', async () => {
      await writeFile(root, 'reports/main.md', '#')
      await writeFile(root, 'reports/notes.md', '#')
      const r = await fsList(root, { path: 'reports' })
      expect(r.entries.map((e) => e.name).sort()).toEqual(['main.md', 'notes.md'])
    })
  })

  describe('fsGrep', () => {
    beforeEach(async () => {
      await writeFile(root, 'scripts/01.py', 'import pandas as pd\nlasso = None\nx = 1')
      await writeFile(root, 'scripts/02.py', 'from sklearn import lasso\nimport numpy')
      await writeFile(root, 'reports/main.md', '# 报告\n用了 lasso 模型')
    })

    it('简单关键词匹配', async () => {
      const r = await fsGrep(root, { pattern: 'lasso' })
      expect(r.matches.length).toBe(3)
      const paths = r.matches.map((m) => m.path).sort()
      expect(paths).toEqual(['reports/main.md', 'scripts/01.py', 'scripts/02.py'])
    })

    it('caseInsensitive=true', async () => {
      const r = await fsGrep(root, { pattern: 'PANDAS', caseInsensitive: true })
      expect(r.matches.some((m) => /pandas/.test(m.line))).toBe(true)
    })

    it('maxMatches 限制', async () => {
      const r = await fsGrep(root, { pattern: 'lasso', maxMatches: 1 })
      expect(r.matches.length).toBe(1)
      expect(r.truncated).toBe(true)
    })

    it('lineNumber 正确', async () => {
      const r = await fsGrep(root, { pattern: 'lasso = None' })
      expect(r.matches[0]?.lineNumber).toBe(2)
    })

    it('超长命中行被截断到 500 字符 + 提示后缀', async () => {
      // 构造 800 字符的单行，中间放 lasso 关键词
      const longLine = 'x'.repeat(350) + ' lasso ' + 'y'.repeat(443)
      await writeFile(root, 'scripts/big.py', longLine)
      const r = await fsGrep(root, { pattern: 'lasso' })
      const match = r.matches.find((m) => m.path === 'scripts/big.py')
      expect(match).toBeDefined()
      // 截断后含前 500 字符 + 截断提示
      expect(match!.line.startsWith('x'.repeat(350))).toBe(true)
      expect(match!.line).toMatch(/\[truncated, \+300 chars\]/)
    })

    it('短命中行不截断', async () => {
      const r = await fsGrep(root, { pattern: 'lasso' })
      // 已有的短行保持原样，无截断提示
      expect(r.matches.every((m) => !/\[truncated/.test(m.line))).toBe(true)
    })
  })
})
