/**
 * WorkerHost 单测。
 *
 * 用 FakeWorker 替身代替真实 Web Worker，验证：
 *   - init 流程：发 init 请求 → 收 init_progress / init_done → 状态变 ready
 *   - exec 流程：发 exec_inline → 收 exec_done / exec_error → resolve
 *   - writeFs 流程：发 fs_write_inline → 收 fs_write_done → resolve；fs_write_error → reject
 *   - hardKill：清空 pending，状态变 dead
 *
 * 不依赖真实 Pyodide / vite ?worker 加载。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { WorkerHost } from '../workerHost'
import type {
  HostToWorkerRequest,
  WorkerToHostMessage,
} from '../../shared/workerProtocol'

class FakeWorker {
  private listeners: { [k: string]: Array<(e: unknown) => void> } = {}
  public posted: HostToWorkerRequest[] = []
  public lastTransfer: Transferable[] | undefined
  public terminated = false

  addEventListener(type: string, listener: (e: unknown) => void) {
    this.listeners[type] ??= []
    this.listeners[type].push(listener)
  }

  removeEventListener(type: string, listener: (e: unknown) => void) {
    this.listeners[type] = (this.listeners[type] || []).filter((l) => l !== listener)
  }

  postMessage(msg: HostToWorkerRequest, transfer?: Transferable[]) {
    this.posted.push(msg)
    this.lastTransfer = transfer
  }

  terminate() {
    this.terminated = true
  }

  /** 由测试驱动：模拟 Worker 端发回的消息 */
  emit(msg: WorkerToHostMessage) {
    const evt = { data: msg }
    ;(this.listeners.message || []).forEach((l) => l(evt))
  }

  emitError(message: string) {
    const evt = { message }
    ;(this.listeners.error || []).forEach((l) => l(evt))
  }
}

describe('WorkerHost', () => {
  let fake: FakeWorker
  let host: WorkerHost

  beforeEach(() => {
    fake = new FakeWorker()
    host = new WorkerHost(() => fake as unknown as Worker)
  })

  describe('init', () => {
    it('发送 init 请求 + 状态机推进 + resolve InitDoneInfo', async () => {
      const initPromise = host.init('/pyodide/v0.27/')

      // 状态变 booting
      expect(host.state.status).toBe('booting')

      // 验证发出的请求
      expect(fake.posted).toHaveLength(1)
      const req = fake.posted[0]!
      expect(req.kind).toBe('init')
      expect((req as Extract<HostToWorkerRequest, { kind: 'init' }>).pyodideIndexUrl).toBe(
        '/pyodide/v0.27/',
      )

      // 模拟进度
      fake.emit({ kind: 'init_progress', stage: 'loading_runtime', detail: 'wasm' })
      expect(host.state.bootStage).toBe('loading_runtime')

      // 模拟完成
      fake.emit({
        kind: 'init_done',
        requestId: req.requestId,
        pyodideVersion: '0.27.7',
        crossOriginIsolated: true,
        sabSupported: true,
      })

      const info = await initPromise
      expect(info.pyodideVersion).toBe('0.27.7')
      expect(host.state.status).toBe('ready')
      expect(host.state.pyodideVersion).toBe('0.27.7')
    })

    it('init_error 时 reject 并把状态置 dead', async () => {
      const initPromise = host.init('/pyodide/v0.27/')
      const req = fake.posted[0]!
      fake.emit({
        kind: 'init_error',
        requestId: req.requestId,
        message: 'wasm 损坏',
      })
      await expect(initPromise).rejects.toThrow(/wasm/)
      expect(host.state.status).toBe('dead')
    })

    it('Worker 已存在时再次 init → 抛错', async () => {
      void host.init('/pyodide/v0.27/').catch(() => undefined)
      await expect(host.init('/pyodide/v0.27/')).rejects.toThrow(/已存在/)
    })

    it('Worker 不回包时 120s 超时 reject（init 卡死兜底）', async () => {
      vi.useFakeTimers()
      try {
        const initPromise = host.init('/pyodide/v0.27/')
        // Worker 收到 init 请求但永不回包
        expect(fake.posted).toHaveLength(1)
        expect(fake.posted[0]!.kind).toBe('init')

        // 预挂 catch 避免 unhandled rejection（timer 会在 advance 时同步 fire）
        void initPromise.catch(() => undefined)
        // 推进 120s + epsilon
        await vi.advanceTimersByTimeAsync(120_010)

        // init 应超时 reject
        await expect(initPromise).rejects.toThrow(/初始化超时/)
        // 超时后状态应置 dead
        expect(host.state.status).toBe('dead')
        expect(host.state.lastError).toContain('初始化超时')
      } finally {
        vi.useRealTimers()
      }
    })

    it('Worker 崩溃（onerror）时 pending init 被 reject', async () => {
      const initPromise = host.init('/pyodide/v0.27/')
      // Worker 报错（模拟 onerror 事件）
      fake.emitError('Worker 线程崩溃')
      await expect(initPromise).rejects.toThrow(/线程崩溃/)
      expect(host.state.status).toBe('dead')
    })
  })

  describe('exec', () => {
    it('exec_done 路径', async () => {
      // 先把 host 置 ready
      const initPromise = host.init('/pyodide/v0.27/')
      const initReq = fake.posted[0]!
      fake.emit({
        kind: 'init_done',
        requestId: initReq.requestId,
        pyodideVersion: '0.27.7',
        crossOriginIsolated: true,
        sabSupported: true,
      })
      await initPromise

      const execPromise = host.exec('print(1)')
      expect(host.state.status).toBe('busy')

      const execReq = fake.posted[1]!
      expect(execReq.kind).toBe('exec_inline')
      fake.emit({
        kind: 'exec_done',
        requestId: execReq.requestId,
        stdout: '1\n',
        stderr: '',
        durationMs: 12,
        truncated: false,
      })

      const result = await execPromise
      expect(result.ok).toBe(true)
      expect(result.stdout).toBe('1\n')
      expect(host.state.status).toBe('ready')
    })

    it('exec_error 路径', async () => {
      const initPromise = host.init('/pyodide/v0.27/')
      const initReq = fake.posted[0]!
      fake.emit({
        kind: 'init_done',
        requestId: initReq.requestId,
        pyodideVersion: '0.27.7',
        crossOriginIsolated: false,
        sabSupported: false,
      })
      await initPromise

      const execPromise = host.exec('1/0')
      const execReq = fake.posted[1]!
      fake.emit({
        kind: 'exec_error',
        requestId: execReq.requestId,
        errorType: 'runtime_error',
        message: 'ZeroDivisionError',
        traceback: 'Traceback...',
        stdout: '',
        stderr: 'ZeroDivisionError\n',
        durationMs: 5,
      })

      const result = await execPromise
      expect(result.ok).toBe(false)
      expect(result.errorType).toBe('runtime_error')
      expect(result.errorMessage).toBe('ZeroDivisionError')
    })

    it('Worker 死亡后 exec → 直接返回 kernel_dead', async () => {
      host.hardKill() // 状态变 dead
      const result = await host.exec('print(1)')
      expect(result.ok).toBe(false)
      expect(result.errorType).toBe('kernel_dead')
    })
  })

  describe('writeFs', () => {
    const ready = async () => {
      const initPromise = host.init('/pyodide/v0.27/')
      const req = fake.posted[0]!
      fake.emit({
        kind: 'init_done',
        requestId: req.requestId,
        pyodideVersion: '0.27.7',
        crossOriginIsolated: true,
        sabSupported: true,
      })
      await initPromise
    }

    it('fs_write_done → resolve { path, bytes }', async () => {
      await ready()

      const buf = new TextEncoder().encode('a,b,c\n1,2,3').buffer
      const writePromise = host.writeFs('inputs/upstream.csv', buf)

      // 验证发出的请求 + transferable
      const sentReq = fake.posted[1]! as Extract<
        HostToWorkerRequest,
        { kind: 'fs_write_inline' }
      >
      expect(sentReq.kind).toBe('fs_write_inline')
      expect(sentReq.path).toBe('inputs/upstream.csv')
      expect(sentReq.bytes).toBe(buf)
      expect(fake.lastTransfer).toEqual([buf])

      // 模拟回包
      fake.emit({
        kind: 'fs_write_done',
        requestId: sentReq.requestId,
        path: 'inputs/upstream.csv',
        bytes: 11,
      })
      await expect(writePromise).resolves.toEqual({
        path: 'inputs/upstream.csv',
        bytes: 11,
      })
    })

    it('fs_write_error → reject', async () => {
      await ready()

      const writePromise = host.writeFs('inputs/x.csv', new ArrayBuffer(4))
      const sentReq = fake.posted[1]!
      fake.emit({
        kind: 'fs_write_error',
        requestId: sentReq.requestId,
        message: '路径越界',
      })
      await expect(writePromise).rejects.toThrow(/路径越界/)
    })

    it('Worker 未初始化 → 直接抛错', async () => {
      await expect(host.writeFs('inputs/x.csv', new ArrayBuffer(4))).rejects.toThrow(
        /未就绪/,
      )
    })

    it('hardKill 时 pending writeFs 被 reject', async () => {
      await ready()
      const writePromise = host.writeFs('inputs/x.csv', new ArrayBuffer(4))
      host.hardKill()
      await expect(writePromise).rejects.toThrow(/终止/)
    })

    it('Worker 不回包时 15s 超时 reject（mount_fs 卡死兜底）', async () => {
      vi.useFakeTimers()
      try {
        await ready()
        // Worker 收到 fs_write_inline 但永不回包（模拟真实卡死场景）
        const writePromise = host.writeFs('inputs/x.csv', new ArrayBuffer(4))
        // 推进过 15s 阈值，触发超时 reject（挂在 promise 上，避免 unhandled rejection）
        const timeout = vi.advanceTimersByTimeAsync(15_010)
        await expect(writePromise).rejects.toThrow(/writeFs 超时/)
        await timeout

        // 超时后 pendingFsWrite 已清掉，state 仍 ready（超时不致命于 host 本身）
        expect(host.state.status).toBe('ready')
        // 后续正常 writeFs 不受影响（不再被旧的 pending 拖死）
        const again = host.writeFs('inputs/y.csv', new ArrayBuffer(4))
        const sentReq = fake.posted[2]! // init(0) + x(1) + y(2)
        fake.emit({ kind: 'fs_write_done', requestId: sentReq.requestId, path: 'inputs/y.csv', bytes: 4 })
        await expect(again).resolves.toEqual({ path: 'inputs/y.csv', bytes: 4 })
      } finally {
        vi.useRealTimers()
      }
    })
  })

  describe('snapshotFs', () => {
    const ready = async () => {
      const initPromise = host.init('/pyodide/v0.27/')
      const req = fake.posted[0]!
      fake.emit({
        kind: 'init_done',
        requestId: req.requestId,
        pyodideVersion: '0.27.7',
        crossOriginIsolated: true,
        sabSupported: true,
      })
      await initPromise
    }

    it('fs_snapshot_done → 返回文件快照', async () => {
      await ready()

      const promise = host.snapshotFs(['reports'])
      const sentReq = fake.posted[1]! as Extract<
        HostToWorkerRequest,
        { kind: 'fs_snapshot' }
      >
      expect(sentReq.kind).toBe('fs_snapshot')
      expect(sentReq.paths).toEqual(['reports'])

      const fileBytes = new TextEncoder().encode('# 报告').buffer
      fake.emit({
        kind: 'fs_snapshot_done',
        requestId: sentReq.requestId,
        files: [{ path: 'reports/main.md', bytes: fileBytes }],
      })

      await expect(promise).resolves.toEqual([
        { path: 'reports/main.md', bytes: fileBytes },
      ])
    })

    it('fs_snapshot_error → reject', async () => {
      await ready()
      const promise = host.snapshotFs()
      const sentReq = fake.posted[1]!
      fake.emit({
        kind: 'fs_snapshot_error',
        requestId: sentReq.requestId,
        message: 'snapshot failed',
      })
      await expect(promise).rejects.toThrow(/snapshot failed/)
    })
  })

  describe('mem_report', () => {
    const ready = async () => {
      const initPromise = host.init('/pyodide/v0.27/')
      const req = fake.posted[0]!
      fake.emit({
        kind: 'init_done',
        requestId: req.requestId,
        pyodideVersion: '0.27.7',
        crossOriginIsolated: true,
        sabSupported: true,
      })
      await initPromise
    }

    it('收到 mem_report 时把 usedBytes 换算成 MB 写入 state.memoryMb', async () => {
      await ready()
      // 250 MB = 262144000 bytes
      fake.emit({ kind: 'mem_report', usedBytes: 262_144_000 })
      expect(host.state.memoryMb).toBeCloseTo(250, 1)
    })

    it('再次收到 mem_report 时覆盖上一次的值', async () => {
      await ready()
      fake.emit({ kind: 'mem_report', usedBytes: 104_857_600 }) // 100 MB
      expect(host.state.memoryMb).toBeCloseTo(100, 1)
      fake.emit({ kind: 'mem_report', usedBytes: 209_715_200 }) // 200 MB
      expect(host.state.memoryMb).toBeCloseTo(200, 1)
    })
  })

  describe('hardKill', () => {
    it('terminate Worker、状态变 dead、pending exec resolve 为 kernel_dead', async () => {
      const initPromise = host.init('/pyodide/v0.27/')
      const initReq = fake.posted[0]!
      fake.emit({
        kind: 'init_done',
        requestId: initReq.requestId,
        pyodideVersion: '0.27.7',
        crossOriginIsolated: true,
        sabSupported: true,
      })
      await initPromise

      const execPromise = host.exec('while True: pass')
      host.hardKill()

      expect(fake.terminated).toBe(true)
      expect(host.state.status).toBe('dead')
      const result = await execPromise
      expect(result.errorType).toBe('kernel_dead')
    })
  })
})
