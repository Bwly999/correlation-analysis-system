/**
 * useWorkspaceTree 单测。
 *
 * 行为：
 *   - 创建后立即 refresh 一次，tree.value 含目录树
 *   - 每 intervalMs 自动 refresh 一次
 *   - 收到 onWorkspaceChanged 信号时立即 refresh
 *   - dispose 后停止轮询
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  createMemOpfsRoot,
  type MemDirectoryHandle,
} from '../../shared/__tests__/memOpfs'
import { ensureWorkspaceTree, writeFile } from '../../shared/opfsAccess'
import { useWorkspaceTree } from '../useWorkspaceTree'

describe('useWorkspaceTree', () => {
  let root: MemDirectoryHandle

  beforeEach(async () => {
    vi.useFakeTimers()
    root = createMemOpfsRoot()
    await ensureWorkspaceTree(root)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('创建后第一次 refresh 同步建好树', async () => {
    const ws = useWorkspaceTree({ root, intervalMs: 2000 })
    // 初始 refresh 是异步，await 一次
    await ws.refresh()
    expect(ws.tree.value).toBeDefined()
    expect(ws.tree.value!.kind).toBe('directory')
    // 4 个固定目录
    expect(ws.tree.value!.children?.length).toBe(4)
    ws.dispose()
  })

  it('文件新增后下一次轮询能看到', async () => {
    const ws = useWorkspaceTree({ root, intervalMs: 2000 })
    await ws.refresh()

    await writeFile(root, 'reports/main.md', '# r')
    // 推进定时器 + 等异步
    await vi.advanceTimersByTimeAsync(2100)

    const reports = ws.tree.value?.children?.find((c) => c.name === 'reports')
    expect(reports?.children?.[0]?.name).toBe('main.md')
    ws.dispose()
  })

  it('notify() 立即 refresh，不等下一轮', async () => {
    const ws = useWorkspaceTree({ root, intervalMs: 2000 })
    await ws.refresh()

    await writeFile(root, 'reports/a.md', 'x')
    await ws.notify(['reports/a.md'])

    const reports = ws.tree.value?.children?.find((c) => c.name === 'reports')
    expect(reports?.children?.[0]?.name).toBe('a.md')
    ws.dispose()
  })

  it('dispose 后停止轮询', async () => {
    const ws = useWorkspaceTree({ root, intervalMs: 2000 })
    await ws.refresh()
    ws.dispose()

    await writeFile(root, 'reports/x.md', '#')
    await vi.advanceTimersByTimeAsync(5000)

    const reports = ws.tree.value?.children?.find((c) => c.name === 'reports')
    expect(reports?.children?.length).toBe(0)
  })
})
