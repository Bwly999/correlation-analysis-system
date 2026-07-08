/**
 * opfsAccess 单测。
 *
 * 以内存版 OPFS 替身（memOpfs.ts）注入到 opfsAccess，验证：
 *   - resolveSafePath 对越界路径报错（绝对路径、Windows 盘符、.. 越界、非顶级目录）
 *   - ensureWorkspaceTree 创建 4 个固定顶级目录
 *   - writeFile 写入后能 readFile 还原；二次 write 是覆盖
 *   - listTree 能递归列出文件 + 目录，含大小与 mtime
 *   - 路径里允许使用 / 和 \ 作分隔（前端 / 主站可能跨平台）
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { createMemOpfsRoot, type MemDirectoryHandle } from './memOpfs'
import {
  resolveSafePath,
  ensureWorkspaceTree,
  writeFile,
  readFile,
  listTree,
  WORKSPACE_TOP_DIRS,
  createQuotaTracker,
  SESSION_QUOTA_BYTES,
  SINGLE_WRITE_LIMIT_BYTES,
} from '../opfsAccess'

describe('opfsAccess.resolveSafePath', () => {
  it('合法路径 → 分段返回', () => {
    expect(resolveSafePath('inputs/upstream.csv')).toEqual(['inputs', 'upstream.csv'])
    expect(resolveSafePath('scripts/01_explore.py')).toEqual(['scripts', '01_explore.py'])
    expect(resolveSafePath('artifacts/sub/fig.png')).toEqual(['artifacts', 'sub', 'fig.png'])
  })

  it('Windows 反斜杠分隔也允许', () => {
    expect(resolveSafePath('inputs\\upstream.csv')).toEqual(['inputs', 'upstream.csv'])
  })

  it('. 视为当前目录被忽略', () => {
    expect(resolveSafePath('inputs/./a.csv')).toEqual(['inputs', 'a.csv'])
  })

  it('绝对路径 → 抛错', () => {
    expect(() => resolveSafePath('/inputs/x')).toThrow(/绝对路径/)
    expect(() => resolveSafePath('C:/inputs/x')).toThrow(/绝对路径/)
    expect(() => resolveSafePath('c:\\inputs\\x')).toThrow(/绝对路径/)
  })

  it('.. 越界 → 抛错', () => {
    expect(() => resolveSafePath('inputs/../etc/passwd')).toThrow(/越界|\.\./)
    expect(() => resolveSafePath('../inputs/x')).toThrow(/越界|\.\./)
  })

  it('非顶级目录 → 抛错', () => {
    expect(() => resolveSafePath('etc/x.csv')).toThrow(/inputs|顶级|开头/)
    expect(() => resolveSafePath('main.md')).toThrow()
  })

  it('空路径 → 抛错', () => {
    expect(() => resolveSafePath('')).toThrow()
    expect(() => resolveSafePath('   ')).toThrow()
  })
})

describe('opfsAccess.ensureWorkspaceTree', () => {
  let root: MemDirectoryHandle
  beforeEach(() => {
    root = createMemOpfsRoot()
  })

  it('创建 4 个固定顶级目录', async () => {
    await ensureWorkspaceTree(root)
    const names: string[] = []
    for await (const entry of root.values()) {
      names.push(entry.name)
    }
    expect(names.sort()).toEqual([...WORKSPACE_TOP_DIRS].sort())
  })

  it('幂等：重复调用不报错', async () => {
    await ensureWorkspaceTree(root)
    await ensureWorkspaceTree(root)
    const names: string[] = []
    for await (const entry of root.values()) names.push(entry.name)
    expect(names.length).toBe(WORKSPACE_TOP_DIRS.length)
  })

  it('暴露 WORKSPACE_TOP_DIRS 常量为四件套', () => {
    expect([...WORKSPACE_TOP_DIRS].sort()).toEqual(
      ['artifacts', 'inputs', 'reports', 'scripts'].sort(),
    )
  })
})

describe('opfsAccess.writeFile / readFile', () => {
  let root: MemDirectoryHandle
  beforeEach(async () => {
    root = createMemOpfsRoot()
    await ensureWorkspaceTree(root)
  })

  it('write 字符串 → read 还原', async () => {
    await writeFile(root, 'reports/main.md', '# 报告\nhello')
    const text = await readFile(root, 'reports/main.md')
    expect(text).toBe('# 报告\nhello')
  })

  it('write ArrayBuffer → read 还原', async () => {
    const data = new TextEncoder().encode('a,b,c\n1,2,3\n').buffer
    await writeFile(root, 'inputs/upstream.csv', data)
    const text = await readFile(root, 'inputs/upstream.csv')
    expect(text).toBe('a,b,c\n1,2,3\n')
  })

  it('嵌套子目录自动创建', async () => {
    await writeFile(root, 'artifacts/figs/2026/q2.png', new Uint8Array([1, 2, 3]).buffer)
    const text = await readFile(root, 'artifacts/figs/2026/q2.png')
    // 二进制数据用 text 读不会等于原值，但能读到说明文件路径解析+读取链路正确
    expect(text.length).toBeGreaterThan(0)
  })

  it('二次 write 覆盖旧内容', async () => {
    await writeFile(root, 'scripts/a.py', 'v1')
    await writeFile(root, 'scripts/a.py', 'v2 longer content')
    const text = await readFile(root, 'scripts/a.py')
    expect(text).toBe('v2 longer content')
  })

  it('write 越界路径 → 抛 path_out_of_workspace', async () => {
    await expect(writeFile(root, '../etc/passwd', 'x')).rejects.toThrow(/越界|workspace|顶级/)
  })

  it('read 不存在的文件 → 抛 file_not_found', async () => {
    await expect(readFile(root, 'reports/nope.md')).rejects.toThrow(/不存在|not.?found/i)
  })

  it('传 tracker：单次超限 → 抛 quota_exceeded 且不写入', async () => {
    const tracker = createQuotaTracker(1024, 8) // 单次上限 8 字节
    await expect(writeFile(root, 'scripts/a.py', 'hello world', tracker)).rejects.toThrow(
      /quota_exceeded/,
    )
    // 配额超限时不应实际落盘
    await expect(readFile(root, 'scripts/a.py')).rejects.toThrow(/不存在|not.?found/i)
  })

  it('传 tracker：累计超限 → 抛 quota_exceeded', async () => {
    const tracker = createQuotaTracker(10, 100) // 总量 10 字节、单次放宽
    await writeFile(root, 'scripts/a.py', 'aaaaa', tracker) // 5 字节
    await expect(writeFile(root, 'scripts/b.py', 'bbbbbb', tracker)).rejects.toThrow(
      /quota_exceeded/,
    )
    // 第一份仍在
    expect(await readFile(root, 'scripts/a.py')).toBe('aaaaa')
  })

  it('不传 tracker：不受配额约束（回归）', async () => {
    // 即便有 tracker 实例存在，不传则写入不受影响
    await writeFile(root, 'scripts/big.py', 'x'.repeat(1000))
    expect((await readFile(root, 'scripts/big.py')).length).toBe(1000)
  })
})

describe('opfsAccess.listTree', () => {
  let root: MemDirectoryHandle
  beforeEach(async () => {
    root = createMemOpfsRoot()
    await ensureWorkspaceTree(root)
  })

  it('空 workspace：仅 4 个顶级目录、各自空', async () => {
    const tree = await listTree(root)
    expect(tree.kind).toBe('directory')
    expect(tree.children?.length).toBe(WORKSPACE_TOP_DIRS.length)
    expect(tree.children?.every((c) => c.kind === 'directory' && c.children?.length === 0)).toBe(
      true,
    )
  })

  it('写入文件后出现在树里', async () => {
    await writeFile(root, 'inputs/upstream.csv', 'col1,col2')
    await writeFile(root, 'reports/main.md', '# r')

    const tree = await listTree(root)
    const inputs = tree.children?.find((c) => c.name === 'inputs')
    const reports = tree.children?.find((c) => c.name === 'reports')

    expect(inputs?.children?.[0]).toMatchObject({
      name: 'upstream.csv',
      kind: 'file',
    })
    expect(reports?.children?.[0]).toMatchObject({
      name: 'main.md',
      kind: 'file',
    })
    expect(inputs?.children?.[0]?.size).toBeGreaterThan(0)
  })
})

describe('opfsAccess.createQuotaTracker', () => {
  it('暴露 SESSION_QUOTA_BYTES = 500MB / SINGLE_WRITE_LIMIT_BYTES = 50MB', () => {
    expect(SESSION_QUOTA_BYTES).toBe(500 * 1024 * 1024)
    expect(SINGLE_WRITE_LIMIT_BYTES).toBe(50 * 1024 * 1024)
  })

  it('单次写入超 50MB → 抛 quota_exceeded', () => {
    const q = createQuotaTracker()
    expect(() => q.reserveOrThrow(60 * 1024 * 1024)).toThrow(/quota_exceeded/)
  })

  it('累计写入超 500MB → 抛 quota_exceeded', () => {
    const q = createQuotaTracker()
    for (let i = 0; i < 11; i += 1) {
      try {
        q.reserveOrThrow(50 * 1024 * 1024)
      } catch (err) {
        // 第 11 次累计超出
        if (i >= 10) {
          expect((err as Error).message).toMatch(/quota_exceeded/)
          return
        }
      }
    }
    throw new Error('应当超过 500MB 限额')
  })

  it('reset 清零', () => {
    const q = createQuotaTracker()
    q.reserveOrThrow(1024)
    expect(q.used()).toBe(1024)
    q.reset()
    expect(q.used()).toBe(0)
  })

  it('自定义上限', () => {
    const q = createQuotaTracker(100, 50)
    expect(() => q.reserveOrThrow(60)).toThrow(/quota_exceeded/)
    q.reserveOrThrow(40)
    expect(() => q.reserveOrThrow(80)).toThrow(/quota_exceeded/)
  })
})
