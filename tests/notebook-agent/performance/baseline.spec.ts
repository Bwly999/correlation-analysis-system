// @vitest-environment node

/**
 * Notebook Agent 性能基线（防回归）— 统一入口。
 *
 * 完整基线见 docs/design-doc/notebook-agent/验收与基线.md §2（Gate 17）。
 *
 * 覆盖范围：
 *   - §2.3 文件系统：fs_read / fs_write / fs_list / fs_grep / listTree
 *     （另见 src/notebook/runtime/__tests__/performance.spec.ts，本文件不复用）
 *   - Markdown 渲染（安全 sanitizer 的性能开销，预览面板关键路径）
 *
 * 不覆盖（需真实 Pyodide / 浏览器，属 E2E）：
 *   - §2.1 加载性能（Pyodide 冷启动 / SW 缓存热启动 / 包加载）
 *   - §2.2 执行性能（python_exec / pandas import / df.describe）
 *   - Worker 重建时间
 *
 * budget 故意比验收基线宽松（jsdom + node 与浏览器性能曲线不同），
 * 主要作"防回归"：突然慢一个数量级就会被抓到。
 */

import { describe, it, expect } from 'vitest'
import { renderMarkdownSafe } from '../../../src/notebook/preview/markdownRenderer'

const BUDGET_MULTIPLIER = 10

const measureMs = async (fn: () => Promise<unknown> | unknown): Promise<number> => {
  const t0 = performance.now()
  await fn()
  return performance.now() - t0
}

describe('Notebook 性能基线 — Markdown 渲染（预览面板关键路径）', () => {
  it('渲染 10KB 纯文本 Markdown → < 50ms × 10', async () => {
    // 200 行，每行 ~50 字符
    const md = Array.from({ length: 200 }, (_, i) => `## 标题 ${i}\n\n这是第 ${i} 段正文，含一些 **加粗** 和 [链接](https://example.com)。`).join('\n\n')
    const ms = await measureMs(() => renderMarkdownSafe(md))
    expect(ms).toBeLessThan(50 * BUDGET_MULTIPLIER)
  })

  it('渲染含 100 个图片的 Markdown → < 200ms × 10', async () => {
    const md = Array.from({ length: 100 }, (_, i) => `![图${i}](artifacts/plot-${i}.png)`).join('\n\n')
    const ms = await measureMs(() => renderMarkdownSafe(md))
    expect(ms).toBeLessThan(200 * BUDGET_MULTIPLIER)
  })

  it('渲染含恶意 payload 的 Markdown（sanitizer 开销可控）→ < 100ms × 10', async () => {
    // 混入大量需要 sanitizer 处理的 payload
    const md = Array.from({ length: 50 }, (_, i) =>
      `<script>alert(${i})</script><img src=x onerror=alert(${i})>[x](javascript:alert(${i}))`,
    ).join('\n\n')
    const ms = await measureMs(() => renderMarkdownSafe(md))
    expect(ms).toBeLessThan(100 * BUDGET_MULTIPLIER)
  })

  it('渲染产物正确：sanitizer 不破坏正常图片 / 链接', () => {
    const md = '# 报告\n\n![主图](artifacts/main.png)\n\n详见 [附录](reports/appendix.md)'
    const html = renderMarkdownSafe(md)
    expect(html).toMatch(/<h1[^>]*>报告/)
    expect(html).toMatch(/artifacts\/main\.png/)
    expect(html).toMatch(/reports\/appendix\.md/)
  })
})
