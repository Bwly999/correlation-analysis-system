// @vitest-environment node

/**
 * AuditLog 单测：ring buffer 上限 / tool_error 连续 5 次触发上报 /
 * pushAndReport 单独可上报事件 / clear。
 */

import { describe, it, expect, vi } from 'vitest'
import { AuditLog, computeCodeHash, type AuditEntry } from '../auditLogger'

const execStart = (execId: string): AuditEntry => ({
  ts: '2026-01-01T00:00:00.000Z',
  kind: 'exec_start',
  execId,
  codeHash: 'abc',
  codeLen: 10,
})

const toolError = (): AuditEntry => ({
  ts: '2026-01-01T00:00:00.000Z',
  kind: 'tool_error',
  tool: 'python_exec_inline',
  code: 'exec_error',
})

describe('AuditLog', () => {
  it('push 累积条目，snapshot 返回浅拷贝', () => {
    const log = new AuditLog()
    log.push(execStart('e1'))
    log.push(execStart('e2'))
    const snap = log.snapshot()
    expect(snap).toHaveLength(2)
    expect(log.length).toBe(2)
    // 浅拷贝：修改 snap 不影响内部 buffer
    snap.pop()
    expect(log.length).toBe(2)
  })

  it('超出 500 条时丢弃最旧（ring buffer）', () => {
    const log = new AuditLog()
    for (let i = 0; i < 503; i++) {
      log.push(execStart(`e${i}`))
    }
    expect(log.length).toBe(500)
    const snap = log.snapshot()
    // 最旧的 3 条（e0/e1/e2）被丢弃，e3 起
    expect(snap[0]!.execId).toBe('e3')
    expect(snap[499]!.execId).toBe('e502')
  })

  it('连续 5 次 tool_error 触发 onReportable', () => {
    const onReportable = vi.fn()
    const log = new AuditLog({ onReportable })
    for (let i = 0; i < 4; i++) log.push(toolError())
    expect(onReportable).not.toHaveBeenCalled()
    log.push(toolError()) // 第 5 次
    expect(onReportable).toHaveBeenCalledTimes(1)
    // 上报内容是当前全部 buffer（5 条）
    expect(onReportable.mock.calls[0]![0]).toHaveLength(5)
  })

  it('非 tool_error 事件重置连续计数', () => {
    const onReportable = vi.fn()
    const log = new AuditLog({ onReportable })
    for (let i = 0; i < 4; i++) log.push(toolError())
    log.push(execStart('e1')) // 非错误事件 → 重置
    for (let i = 0; i < 4; i++) log.push(toolError())
    expect(onReportable).not.toHaveBeenCalled() // 重新计到 4，未达 5
  })

  it('pushAndReport 对 worker_restart / quota_hit 立即上报', () => {
    const onReportable = vi.fn()
    const log = new AuditLog({ onReportable })
    log.pushAndReport({
      ts: 't',
      kind: 'worker_restart',
      reason: 'hard_timeout',
    })
    expect(onReportable).toHaveBeenCalledTimes(1)
    expect(onReportable.mock.calls[0]![0]).toHaveLength(1)
    expect(onReportable.mock.calls[0]![0][0]!.kind).toBe('worker_restart')
  })

  it('clear 清空 buffer 与计数', () => {
    const log = new AuditLog()
    log.push(execStart('e1'))
    log.clear()
    expect(log.length).toBe(0)
    expect(log.snapshot()).toEqual([])
  })

  it('无 onReportable 回调时不报错', () => {
    const log = new AuditLog()
    for (let i = 0; i < 5; i++) log.push(toolError())
    log.pushAndReport({ ts: 't', kind: 'quota_hit', current: 1, limit: 1 })
    // 不抛错即通过
    expect(log.length).toBe(6)
  })
})

describe('computeCodeHash', () => {
  it('对相同输入返回相同 hash（确定性）', async () => {
    const h1 = await computeCodeHash('print(1)')
    const h2 = await computeCodeHash('print(1)')
    expect(h1).toBe(h2)
    expect(h1).toMatch(/^[0-9a-f]{64}$/) // sha-256 hex
  })

  it('对不同输入返回不同 hash', async () => {
    const h1 = await computeCodeHash('print(1)')
    const h2 = await computeCodeHash('print(2)')
    expect(h1).not.toBe(h2)
  })
})
