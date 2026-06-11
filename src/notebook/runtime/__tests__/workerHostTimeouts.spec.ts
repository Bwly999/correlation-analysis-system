/**
 * WorkerHost 60s/90s 双段超时 + 崩溃自愈单测。
 *
 * 验收点：
 *   - exec 启动后 60s 触发软中断（SIGINT / interruptBuffer）
 *   - 90s 仍未返回 → terminate Worker
 *   - terminate 后自动重建 + 重新 init Pyodide
 *   - exec 期间 Worker 崩溃（onerror）→ status=dead，pending exec 全部 reject 为 kernel_dead
 *   - 用户主动 interrupt 不影响 timer
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { WorkerHost } from '../workerHost'
import type {
  HostToWorkerRequest,
  WorkerToHostMessage,
} from '../../shared/workerProtocol'

class FakeWorker {
  private listeners: { [k: string]: Array<(e: unknown) => void> } = {}
  public posted: HostToWorkerRequest[] = []
  public terminated = false

  addEventListener(type: string, listener: (e: unknown) => void) {
    this.listeners[type] ??= []
    this.listeners[type].push(listener)
  }
  removeEventListener(type: string, listener: (e: unknown) => void) {
    this.listeners[type] = (this.listeners[type] || []).filter((l) => l !== listener)
  }
  postMessage(msg: HostToWorkerRequest) {
    this.posted.push(msg)
  }
  terminate() {
    this.terminated = true
  }
  emit(msg: WorkerToHostMessage) {
    ;(this.listeners.message || []).forEach((l) => l({ data: msg }))
  }
  emitError(message: string) {
    ;(this.listeners.error || []).forEach((l) => l({ message }))
  }
}

describe('WorkerHost 60s/90s 超时 + 自愈', () => {
  let workers: FakeWorker[]
  let host: WorkerHost

  beforeEach(() => {
    vi.useFakeTimers()
    workers = []
    host = new WorkerHost(() => {
      const w = new FakeWorker()
      workers.push(w)
      return w as unknown as Worker
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  const ready = async () => {
    const initPromise = host.init('/pyodide/v0.27/')
    workers[0]!.emit({
      kind: 'init_done',
      requestId: workers[0]!.posted[0]!.requestId,
      pyodideVersion: '0.27.7',
      crossOriginIsolated: true,
      sabSupported: true,
    })
    await initPromise
  }

  it('60s 软超时 → 触发软中断标志（interruptBuffer 写 SIGINT）', async () => {
    await ready()
    const execPromise = host.exec('while True: pass', 60_000)
    // 把执行 60_001ms 推进
    await vi.advanceTimersByTimeAsync(60_001)

    // host 应该有内部"已发送软中断"的标记（通过 state 或返回值）
    // 我们暂时通过 host.state.softInterruptedAt（由实现暴露）来观察
    expect(host.state.softInterruptedAt).toBeGreaterThan(0)

    // 期间 worker 仍未响应；模拟 worker 在 SIGINT 后正常返回 interrupted
    workers[0]!.emit({
      kind: 'exec_error',
      requestId: workers[0]!.posted[1]!.requestId,
      errorType: 'interrupted',
      message: 'KeyboardInterrupt',
      stdout: '',
      stderr: '',
      durationMs: 60_001,
    })
    const result = await execPromise
    expect(result.errorType).toBe('interrupted')
  })

  it('90s 硬超时 → terminate worker + 自动重建', async () => {
    await ready()
    const execPromise = host.exec('while True: pass', 60_000)

    // 90s 后软中断仍未生效（Python 在 C 扩展长循环里）
    await vi.advanceTimersByTimeAsync(90_001)

    expect(workers[0]!.terminated).toBe(true)
    // host 自动重建：现在应该有第二个 worker
    expect(workers.length).toBe(2)

    // Pending exec 收到 timeout 结果
    const result = await execPromise
    expect(result.errorType).toBe('timeout')
    expect(result.ok).toBe(false)

    // 新 worker 收到 init 请求
    expect(workers[1]!.posted[0]?.kind).toBe('init')
  })

  it('Worker 崩溃（onerror）→ status=dead，pending exec reject', async () => {
    await ready()
    const execPromise = host.exec('print(1)')
    workers[0]!.emitError('SIGSEGV')
    const result = await execPromise
    expect(result.errorType).toBe('kernel_dead')
    expect(host.state.status).toBe('dead')
  })
})
