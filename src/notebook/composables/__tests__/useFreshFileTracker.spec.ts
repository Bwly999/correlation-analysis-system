/**
 * useFreshFileTracker 测试
 */
import { describe, it, expect } from 'vitest'
import { ref, nextTick } from 'vue'
import { useFreshFileTracker } from '../useFreshFileTracker'
import type { TreeNode } from '../../shared/opfsAccess'

const buildTree = (files: Array<{ path: string; mtime: number }>): TreeNode => {
  const root: TreeNode = { name: '', kind: 'directory', children: [] }
  const dirs = new Map<string, TreeNode>()
  for (const f of files) {
    const parts = f.path.split('/')
    let parent = root
    for (let i = 0; i < parts.length - 1; i++) {
      const dirName = parts[i]!
      const key = parts.slice(0, i + 1).join('/')
      let dir = dirs.get(key)
      if (!dir) {
        dir = { name: dirName, kind: 'directory', children: [] }
        dirs.set(key, dir)
        parent.children!.push(dir)
      }
      parent = dir
    }
    parent.children!.push({
      name: parts[parts.length - 1]!,
      kind: 'file',
      modifiedAt: f.mtime,
    })
  }
  return root
}

describe('useFreshFileTracker', () => {
  it('文件首次出现 → 标记 fresh', async () => {
    const tree = ref<TreeNode | null>(null)
    const now = 1_000_000
    const { isFresh } = useFreshFileTracker({ tree, now: () => now })

    tree.value = buildTree([{ path: 'reports/main.md', mtime: 1_000_000 }])
    await nextTick()
    expect(isFresh('reports/main.md')).toBe(true)
  })

  it('mtime 不变时不重新标记', async () => {
    const tree = ref<TreeNode | null>(buildTree([{ path: 'reports/a.md', mtime: 100 }]))
    let now = 1_000_000
    const { isFresh } = useFreshFileTracker({
      tree,
      now: () => now,
      windowMs: 1000,
    })
    await nextTick()

    // 31s 后变 false
    now += 31_000
    expect(isFresh('reports/a.md')).toBe(false)
  })

  it('mtime 更新 → 重新成为 fresh', async () => {
    const tree = ref<TreeNode | null>(buildTree([{ path: 'reports/a.md', mtime: 100 }]))
    let now = 1_000_000
    const { isFresh } = useFreshFileTracker({ tree, now: () => now, windowMs: 5_000 })
    await nextTick()
    now += 10_000
    expect(isFresh('reports/a.md')).toBe(false)

    // 文件被改写
    tree.value = buildTree([{ path: 'reports/a.md', mtime: 200 }])
    await nextTick()
    expect(isFresh('reports/a.md')).toBe(true)
  })

  it('被删除的文件不会一直留在缓存里', async () => {
    const tree = ref<TreeNode | null>(buildTree([{ path: 'reports/a.md', mtime: 1 }]))
    const now = 1_000_000
    const { isFresh } = useFreshFileTracker({ tree, now: () => now })
    await nextTick()
    expect(isFresh('reports/a.md')).toBe(true)

    tree.value = buildTree([])
    await nextTick()
    expect(isFresh('reports/a.md')).toBe(false)
  })
})
