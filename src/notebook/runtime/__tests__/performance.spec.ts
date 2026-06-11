/**
 * Notebook Agent 性能基线（可单测部分）。
 *
 * 完整基线见 docs/design-doc/notebook-agent/验收与基线.md §2。
 *
 * 这里覆盖纯前端逻辑层：
 *   - fs_read 100KB 文本 ≤ 100ms
 *   - fs_write 100KB 文本 ≤ 200ms
 *   - fs_list 10 个文件 ≤ 50ms
 *   - fs_grep 10 个文件 (1MB 总量) ≤ 500ms
 *   - listTree 100 文件 ≤ 100ms
 *
 * Pyodide 启动时间 / Worker 重建时间留给 E2E 测量（启动真实 wasm）。
 *
 * 这些 budget 故意比验收基线宽松，因为 jsdom + 内存 OPFS mock 与浏览器 OPFS 性能曲线不同；
 * 主要作"防回归"用：突然变 10x 慢就会被抓到。
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  createMemOpfsRoot,
  type MemDirectoryHandle,
} from '../../shared/__tests__/memOpfs'
import {
  ensureWorkspaceTree,
  writeFile,
  listTree,
} from '../../shared/opfsAccess'
import { fsRead, fsWrite, fsList, fsGrep } from '../fsTools'

// 基线倍数：CI 抖动很大，给 10x buffer，仅作"突然慢一个数量级"的回归监控
const BUDGET_MULTIPLIER = 10

const measureMs = async (fn: () => Promise<unknown> | unknown): Promise<number> => {
  const t0 = performance.now()
  await fn()
  return performance.now() - t0
}

describe('Notebook 性能基线（防回归）', () => {
  let root: MemDirectoryHandle

  beforeEach(async () => {
    root = createMemOpfsRoot()
    await ensureWorkspaceTree(root)
  })

  it('fs_write 100KB → < 200ms × 10', async () => {
    const content = 'a'.repeat(100 * 1024)
    const ms = await measureMs(() => fsWrite(root, { path: 'reports/x.md', content }))
    expect(ms).toBeLessThan(200 * BUDGET_MULTIPLIER)
  })

  it('fs_read 100KB 文本 → < 100ms × 10', async () => {
    await writeFile(root, 'reports/x.md', 'a'.repeat(100 * 1024))
    const ms = await measureMs(() => fsRead(root, { path: 'reports/x.md' }))
    expect(ms).toBeLessThan(100 * BUDGET_MULTIPLIER)
  })

  it('fs_list 10 个文件 → < 50ms × 10', async () => {
    for (let i = 0; i < 10; i += 1) {
      await writeFile(root, `scripts/f${i}.py`, `# ${i}`)
    }
    const ms = await measureMs(() => fsList(root, { path: 'scripts' }))
    expect(ms).toBeLessThan(50 * BUDGET_MULTIPLIER)
  })

  it('fs_grep 10 个文件 (1MB 总量) → < 500ms × 10', async () => {
    for (let i = 0; i < 10; i += 1) {
      // 100KB 每文件，共 ~1MB
      const lines = Array.from({ length: 1000 }, (_, j) =>
        j === 500 ? `MATCH_${i}` : `line${j} ${'x'.repeat(80)}`,
      ).join('\n')
      await writeFile(root, `scripts/f${i}.py`, lines)
    }
    const ms = await measureMs(() => fsGrep(root, { pattern: 'MATCH_' }))
    expect(ms).toBeLessThan(500 * BUDGET_MULTIPLIER)
  })

  it('listTree 100 文件 → < 100ms × 10', async () => {
    for (let i = 0; i < 100; i += 1) {
      await writeFile(root, `artifacts/f${i}.csv`, `${i}`)
    }
    const ms = await measureMs(() => listTree(root))
    expect(ms).toBeLessThan(100 * BUDGET_MULTIPLIER)
  })
})
