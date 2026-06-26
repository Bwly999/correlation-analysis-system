/**
 * dataSourceCsv 单测。
 *
 * nodeResultToCsv：把画布 NodeResult 转成 CSV ArrayBuffer 给主站灌入笔记本。
 *
 * 验收点（详见 docs/design-doc/notebook-agent/数据接入.md §4）：
 *   - kind=table 直接转
 *   - kind=tableCollection 取第一个 group
 *   - 其他 kind → 抛错
 *   - 空数据 → 抛错（避免 Agent 拿到意料外的子集）
 *   - 行数 / 列数 / 字节超限 → 抛 row_too_many / col_too_many / size_too_large
 *   - 返回 buffer + meta（含 rowCount / columnCount / sourceKind / sourceLabel）
 */

import { describe, it, expect } from 'vitest'
import {
  nodeResultToCsv,
  IMPORT_LIMITS,
  type ImportSourceContext,
} from '../dataSourceCsv'
import type { NodeResult } from '../../../nodes/result'

const decode = (buf: ArrayBuffer): string => new TextDecoder().decode(buf)

const ctx = (overrides: Partial<ImportSourceContext> = {}): ImportSourceContext => ({
  sourceKind: 'canvas-node',
  sourceLabel: 'cleanup-2025',
  ...overrides,
})

describe('nodeResultToCsv', () => {
  it('table → 标准 CSV', () => {
    const result: NodeResult = {
      kind: 'table',
      payload: [
        { userId: 'u1', age: 28, region: 'East' },
        { userId: 'u2', age: 31, region: 'West' },
      ],
    }
    const { buffer, meta } = nodeResultToCsv(result, ctx())
    const csv = decode(buffer)
    // 表头 + 2 行数据
    expect(csv).toMatch(/userId,age,region/)
    expect(csv).toMatch(/u1,28,East/)
    expect(csv).toMatch(/u2,31,West/)
    expect(meta.rowCount).toBe(2)
    expect(meta.columnCount).toBe(3)
    expect(meta.sourceKind).toBe('canvas-node')
    expect(meta.sourceLabel).toBe('cleanup-2025')
  })

  it('table 含特殊字符（逗号 / 引号）正确转义', () => {
    const result: NodeResult = {
      kind: 'table',
      payload: [{ name: 'a, b', note: 'he said "hi"' }],
    }
    const { buffer } = nodeResultToCsv(result, ctx())
    const csv = decode(buffer)
    expect(csv).toMatch(/"a, b"/)
    // papaparse 会转义内部双引号为 ""
    expect(csv).toMatch(/"he said ""hi"""/)
  })

  it('tableCollection 取第一个 group', () => {
    const result: NodeResult = {
      kind: 'tableCollection',
      payload: [
        { name: 'g1', data: [{ a: 1 }, { a: 2 }] },
        { name: 'g2', data: [{ a: 99 }] },
      ],
    }
    const { buffer, meta } = nodeResultToCsv(result, ctx())
    const csv = decode(buffer)
    expect(csv).toMatch(/^a/)
    expect(csv).toMatch(/\b1\b/)
    expect(csv).toMatch(/\b2\b/)
    expect(csv).not.toMatch(/99/)
    expect(meta.rowCount).toBe(2)
  })

  it('其他 kind → 抛错', () => {
    const result: NodeResult = { kind: 'chart', payload: { x: [1, 2] } }
    expect(() => nodeResultToCsv(result, ctx())).toThrow(/不支持|kind/)
  })

  it('空 table → 抛错', () => {
    expect(() => nodeResultToCsv({ kind: 'table', payload: [] }, ctx())).toThrow(/为空/)
  })

  it('空 tableCollection → 抛错', () => {
    expect(() =>
      nodeResultToCsv({ kind: 'tableCollection', payload: [] }, ctx()),
    ).toThrow(/为空/)
  })

  it('tableCollection 第一个 group 为空 → 抛错', () => {
    expect(() =>
      nodeResultToCsv(
        { kind: 'tableCollection', payload: [{ name: 'g', data: [] }] },
        ctx(),
      ),
    ).toThrow(/为空/)
  })

  it('列数超限 → 抛 col_too_many', () => {
    const tooManyCols: Record<string, number> = {}
    for (let i = 0; i < IMPORT_LIMITS.maxColumns + 1; i += 1) {
      tooManyCols[`c${i}`] = i
    }
    expect(() =>
      nodeResultToCsv({ kind: 'table', payload: [tooManyCols] }, ctx()),
    ).toThrow(/列|column/i)
  })

  it('行数超限 → 抛 row_too_many', () => {
    const rows = Array.from({ length: IMPORT_LIMITS.maxRows + 1 }, () => ({ a: 1 }))
    expect(() => nodeResultToCsv({ kind: 'table', payload: rows }, ctx())).toThrow(
      /行|row/i,
    )
  })

  it('IMPORT_LIMITS 暴露 maxRows/maxColumns/maxBytes 常量', () => {
    expect(IMPORT_LIMITS.maxRows).toBe(1_000_000)
    expect(IMPORT_LIMITS.maxColumns).toBe(1_000)
    expect(IMPORT_LIMITS.maxBytes).toBe(200 * 1024 * 1024)
  })

  it('null / undefined 值 → 空字段', () => {
    const result: NodeResult = {
      kind: 'table',
      payload: [
        { a: 1, b: null, c: undefined },
        { a: 2, b: 3, c: 'x' },
      ],
    }
    const { buffer } = nodeResultToCsv(result, ctx())
    const csv = decode(buffer)
    // 第一行空字段
    expect(csv).toMatch(/1,,/)
  })

  // 回归：稀疏数据（各行 key 不一致）时，Papa.unparse 默认只用 rows[0]
  // 的 key 当列头，会把 rows[0] 没有的列整列丢弃。必须显式传入全量列。
  it('稀疏行（rows[0] 缺列）→ 保留全量列，不丢列', () => {
    const result: NodeResult = {
      kind: 'table',
      // rows[0] 只有 2 列，rows[1] 有 5 列 —— 旧行为会丢掉 c/d/e
      payload: [
        { a: 1, b: 2 },
        { a: 3, b: 4, c: 5, d: 6, e: 7 },
      ],
    }
    const { buffer, meta } = nodeResultToCsv(result, ctx())
    const csv = decode(buffer)
    const header = csv.split(/\r?\n/)[0]!
    const headers = header.split(',')
    // 全量 5 列都必须出现在表头
    expect(headers).toEqual(expect.arrayContaining(['a', 'b', 'c', 'd', 'e']))
    expect(headers).toHaveLength(5)
    // columnCount 应为全量列数，而非 rows[0] 的列数
    expect(meta.columnCount).toBe(5)
    // rows[1] 的 c/d/e 值必须落到 CSV 里（旧行为会整行只剩 a,b）
    const dataRows = csv.split(/\r?\n/).slice(1).filter((l) => l.trim() !== '')
    const secondRow = dataRows[1]!
    expect(secondRow).toMatch(/5/)
    expect(secondRow).toMatch(/6/)
    expect(secondRow).toMatch(/7/)
  })

  it('meta.columns 提供全量列名 + 推断类型', () => {
    const result: NodeResult = {
      kind: 'table',
      payload: [
        { a: 1, b: 'x' },
        { a: 2, b: 'y', c: 3 },
      ],
    }
    const { meta } = nodeResultToCsv(result, ctx())
    expect(meta.columns).toBeDefined()
    const names = meta.columns!.map((col) => col.name)
    expect(names).toEqual(expect.arrayContaining(['a', 'b', 'c']))
    expect(names).toHaveLength(3)
    const byName = Object.fromEntries(meta.columns!.map((col) => [col.name, col.inferredType]))
    expect(byName.a).toBe('number')
    expect(byName.b).toBe('string')
    expect(byName.c).toBe('number')
  })
})
