/**
 * Notebook 主线程侧 Worker 管理器（PoC v0）。
 *
 * 职责：
 *   - 创建 Worker（vite ?worker import）
 *   - 透出 init / exec / interrupt / shutdown 四个命令式 API
 *   - 监听 Worker 消息，按 requestId 派发到 pending Promise
 *
 * 不在这一层做 UI 渲染。UI 由 App.vue 直接订阅 hostState。
 */

import { reactive } from 'vue'
import {
  createInterruptBuffer,
  requestInterrupt,
  type HostToWorkerRequest,
  type WorkerToHostMessage,
} from '../shared/workerProtocol'
import { createDefaultWorker, type WorkerFactory } from './workerFactory'

export interface InitDoneInfo {
  pyodideVersion: string
  crossOriginIsolated: boolean
  sabSupported: boolean
}

export interface ExecResult {
  ok: boolean
  stdout: string
  stderr: string
  errorType: string | null
  errorMessage?: string
  traceback?: string
  durationMs: number
}

export interface PackagesQueryResult {
  action: 'list' | 'load'
  loaded: Array<{ name: string; version: string }>
  notLoaded: Array<{ name: string; version: string }>
  loadResults?: Array<{ name: string; ok: boolean; message?: string }>
}

export interface HostState {
  status: 'idle' | 'booting' | 'ready' | 'busy' | 'dead'
  bootStage: string
  bootStageDetail: string
  /** Worker 直报的 0-100 进度；0 表示未上报 */
  bootStagePercent: number
  pyodideVersion: string
  crossOriginIsolated: boolean
  sabSupported: boolean
  lastError: string
  /** 仅在当前 exec 已被软中断时 > 0；exec 结束后清零 */
  softInterruptedAt: number
  /** Worker 累计自动重启次数（含硬超时 / 崩溃自愈） */
  autoRestartCount: number
  /** Worker 上报的内存使用（MB），由 mem_report 事件更新（UX §3.4 状态条）*/
  memoryMb: number
}

interface PendingExec {
  resolve: (r: ExecResult) => void
  /** 软超时定时器 id（setTimeout return） */
  softTimer: ReturnType<typeof setTimeout> | null
  /** 硬超时定时器 id */
  hardTimer: ReturnType<typeof setTimeout> | null
  /** 启动 wall clock 用于计算 durationMs */
  startedAt: number
  /** 用户给的代码（自动重启后用于事件 / 日志） */
  code: string
  /** 用户原始 timeoutMs（决定 60s 软 / 90s 硬） */
  timeoutMs: number
}

interface PendingInit {
  resolve: (info: InitDoneInfo) => void
  reject: (err: Error) => void
}

interface PendingFsWrite {
  resolve: (info: { path: string; bytes: number }) => void
  reject: (err: Error) => void
}

interface PendingFsSnapshot {
  resolve: (files: Array<{ path: string; bytes: ArrayBuffer }>) => void
  reject: (err: Error) => void
}

interface PendingPackagesQuery {
  resolve: (result: PackagesQueryResult) => void
  reject: (err: Error) => void
}

export class WorkerHost {
  readonly state: HostState
  private worker: Worker | null = null
  private interruptBuffer: SharedArrayBuffer | null = null
  private pendingInit: PendingInit | null = null
  private pendingExec: Map<string, PendingExec> = new Map()
  private pendingFsWrite: Map<string, PendingFsWrite> = new Map()
  private pendingFsSnapshot: Map<string, PendingFsSnapshot> = new Map()
  private pendingPackagesQuery: Map<string, PendingPackagesQuery> = new Map()
  private nextId = 0
  private readonly workerFactory: WorkerFactory
  /**
   * 自动重启（硬超时 / 崩溃自愈）成功 init 后的回调。
   * runtime 注入：用于通知 Agent "Python 环境已重启，Workspace 文件保留"。
   */
  onAutoRestarted?: (info: { pyodideVersion: string; autoRestartCount: number }) => void
  /** 标记 autoRestart 发出的 init 尚未收到 init_done（用于区分首启 / 自愈） */
  private restartInitInFlight = false

  constructor(workerFactory: WorkerFactory = createDefaultWorker) {
    this.workerFactory = workerFactory
    const hostCrossOriginIsolated =
      typeof crossOriginIsolated !== 'undefined' && crossOriginIsolated
    const hostSabSupported =
      typeof SharedArrayBuffer !== 'undefined' && hostCrossOriginIsolated

    this.state = reactive<HostState>({
      status: 'idle',
      bootStage: '',
      bootStageDetail: '',
      bootStagePercent: 0,
      pyodideVersion: '',
      crossOriginIsolated: hostCrossOriginIsolated,
      sabSupported: hostSabSupported,
      lastError: '',
      softInterruptedAt: 0,
      autoRestartCount: 0,
      memoryMb: 0,
    })
  }

  private genId(): string {
    this.nextId += 1
    return `req-${Date.now()}-${this.nextId}`
  }

  // 最近一次 init 的 indexUrl，自愈时复用
  private lastInitIndexUrl: string | null = null

  async init(pyodideIndexUrl: string): Promise<InitDoneInfo> {
    if (this.worker) throw new Error('Worker 已存在')

    this.lastInitIndexUrl = pyodideIndexUrl
    this.worker = this.workerFactory()
    this.interruptBuffer = createInterruptBuffer()

    this.worker.addEventListener('message', this.handleMessage)
    this.worker.addEventListener('error', (e: Event) => {
      const message = (e as ErrorEvent).message || 'Worker 错误'
      this.handleWorkerCrash(message)
    })

    this.state.status = 'booting'
    this.state.bootStage = 'starting'

    return new Promise<InitDoneInfo>((resolve, reject) => {
      this.pendingInit = { resolve, reject }
      const req: HostToWorkerRequest = {
        kind: 'init',
        requestId: this.genId(),
        pyodideIndexUrl,
        interruptBuffer: this.interruptBuffer,
      }
      this.worker!.postMessage(req)
    })
  }

  async exec(code: string, timeoutMs = 60_000): Promise<ExecResult> {
    if (!this.worker || this.state.status === 'dead') {
      return {
        ok: false,
        stdout: '',
        stderr: '',
        errorType: 'kernel_dead',
        errorMessage: 'Worker 未就绪',
        durationMs: 0,
      }
    }

    const requestId = this.genId()
    const softTimeoutMs = Math.max(1, timeoutMs)
    // 硬超时按 1.5x 软超时（设计文档为 60s/90s 即 1.5x）
    const hardTimeoutMs = Math.round(softTimeoutMs * 1.5)
    const req: HostToWorkerRequest = {
      kind: 'exec_inline',
      requestId,
      code,
      timeoutMs: softTimeoutMs,
    }
    this.state.status = 'busy'
    this.state.softInterruptedAt = 0

    return new Promise<ExecResult>((resolve) => {
      const startedAt = Date.now()
      const softTimer = setTimeout(() => {
        // 软中断：写 interruptBuffer
        if (this.interruptBuffer) requestInterrupt(this.interruptBuffer)
        this.state.softInterruptedAt = Date.now()
      }, softTimeoutMs)
      const hardTimer = setTimeout(() => {
        // 硬中断：terminate + 自动重建
        this.handleHardTimeout(requestId)
      }, hardTimeoutMs)

      this.pendingExec.set(requestId, {
        resolve,
        softTimer,
        hardTimer,
        startedAt,
        code,
        timeoutMs: softTimeoutMs,
      })
      this.worker!.postMessage(req)
    })
  }

  /** 软中断：写 SAB；pyodide 在下次字节码 dispatch 时抛 KeyboardInterrupt */
  interrupt(): boolean {
    if (!this.interruptBuffer) return false
    requestInterrupt(this.interruptBuffer)
    return true
  }

  isBusy(): boolean {
    return this.state.status === 'busy'
  }

  /**
   * 把字节写到 Worker 内 Pyodide 的 MEMFS。
   *
   * 仅供主线程"灌入数据 / OPFS → MEMFS sync"使用，**不要暴露给 Agent**。
   * 路径必须以 inputs|scripts|artifacts|reports 之一开头。
   *
   * 守卫同时挡 `booting`：booting 期 worker 内 pyodide 尚未就绪，handleFsWrite 会
   * 立即回 fs_write_error。直接拒绝比让 postMessage 往返一次更干净，且避免把
   * transferable bytes 发给半成品 worker（bytes 会被 transfer 掉无法重试）。
   */
  async writeFs(path: string, bytes: ArrayBuffer): Promise<{ path: string; bytes: number }> {
    if (!this.worker || this.state.status === 'dead' || this.state.status === 'booting') {
      throw new Error('Worker 未就绪')
    }
    const requestId = this.genId()
    return new Promise((resolve, reject) => {
      this.pendingFsWrite.set(requestId, { resolve, reject })
      const req: HostToWorkerRequest = {
        kind: 'fs_write_inline',
        requestId,
        path,
        bytes,
      }
      // bytes 走 transferable，避免拷贝
      this.worker!.postMessage(req, [bytes])
    })
  }

  async snapshotFs(paths?: string[]): Promise<Array<{ path: string; bytes: ArrayBuffer }>> {
    if (!this.worker || this.state.status === 'dead' || this.state.status === 'booting') {
      throw new Error('Worker 未就绪')
    }
    const requestId = this.genId()
    return new Promise((resolve, reject) => {
      this.pendingFsSnapshot.set(requestId, { resolve, reject })
      const req: HostToWorkerRequest = {
        kind: 'fs_snapshot',
        requestId,
        ...(paths && paths.length > 0 ? { paths } : {}),
      }
      this.worker!.postMessage(req)
    })
  }

  /**
   * 查询/加载 runtime 包（python_packages 工具的后端）。
   * - action=list：返回 runtime 内所有包按加载状态分组（loaded/notLoaded）
   * - action=load：按 packages 数组调 pyodide.loadPackage，返回加载结果 + 最新状态
   */
  async queryPackages(
    action: 'list' | 'load',
    packages?: string[],
  ): Promise<PackagesQueryResult> {
    if (!this.worker || this.state.status === 'dead' || this.state.status === 'booting') {
      throw new Error('Worker 未就绪')
    }
    const requestId = this.genId()
    return new Promise((resolve, reject) => {
      this.pendingPackagesQuery.set(requestId, { resolve, reject })
      const req: HostToWorkerRequest = {
        kind: 'packages_query',
        requestId,
        action,
        ...(packages && packages.length > 0 ? { packages } : {}),
      }
      this.worker!.postMessage(req)
    })
  }

  /** 硬中断：直接 terminate + 重建（PoC v0 暂不自动重建） */
  hardKill(): void {
    if (this.worker) {
      this.worker.terminate()
      this.worker = null
    }
    this.state.status = 'dead'
    this.state.lastError = 'Worker 已被强制终止'
    this.failAllPendingDueTo('Worker 已被终止')
  }

  private handleMessage = (event: MessageEvent<WorkerToHostMessage>) => {
    const msg = event.data
    if (!msg) return

    switch (msg.kind) {
      case 'init_progress':
        this.state.bootStage = msg.stage
        this.state.bootStageDetail = msg.detail ?? ''
        this.state.bootStagePercent = msg.percent ?? 0
        break

      case 'init_done':
        this.state.status = 'ready'
        this.state.pyodideVersion = msg.pyodideVersion
        this.state.crossOriginIsolated = msg.crossOriginIsolated
        this.state.sabSupported = msg.sabSupported
        this.pendingInit?.resolve({
          pyodideVersion: msg.pyodideVersion,
          crossOriginIsolated: msg.crossOriginIsolated,
          sabSupported: msg.sabSupported,
        })
        this.pendingInit = null
        // autoRestart 发出的 init（无 pendingInit）：触发重启通知回调
        if (this.restartInitInFlight) {
          this.restartInitInFlight = false
          try {
            this.onAutoRestarted?.({
              pyodideVersion: msg.pyodideVersion,
              autoRestartCount: this.state.autoRestartCount,
            })
          } catch {
            // 回调失败不影响重启主流程
          }
        }
        break

      case 'init_error':
        this.state.status = 'dead'
        this.state.lastError = msg.message
        this.pendingInit?.reject(new Error(msg.message))
        this.pendingInit = null
        break

      case 'exec_done': {
        const pending = this.pendingExec.get(msg.requestId)
        this.pendingExec.delete(msg.requestId)
        if (pending) {
          if (pending.softTimer) clearTimeout(pending.softTimer)
          if (pending.hardTimer) clearTimeout(pending.hardTimer)
        }
        this.state.status = 'ready'
        this.state.softInterruptedAt = 0
        pending?.resolve({
          ok: true,
          stdout: msg.stdout,
          stderr: msg.stderr,
          errorType: null,
          durationMs: msg.durationMs,
        })
        break
      }

      case 'exec_error': {
        const pending = this.pendingExec.get(msg.requestId)
        this.pendingExec.delete(msg.requestId)
        if (pending) {
          if (pending.softTimer) clearTimeout(pending.softTimer)
          if (pending.hardTimer) clearTimeout(pending.hardTimer)
        }
        this.state.status = 'ready'
        this.state.softInterruptedAt = 0
        pending?.resolve({
          ok: false,
          stdout: msg.stdout,
          stderr: msg.stderr,
          errorType: msg.errorType,
          errorMessage: msg.message,
          traceback: msg.traceback,
          durationMs: msg.durationMs,
        })
        break
      }

      case 'exec_stream':
        // PoC v0 暂不渲染流式输出
        break

      case 'fs_write_done': {
        const pending = this.pendingFsWrite.get(msg.requestId)
        this.pendingFsWrite.delete(msg.requestId)
        pending?.resolve({ path: msg.path, bytes: msg.bytes })
        break
      }

      case 'fs_write_error': {
        const pending = this.pendingFsWrite.get(msg.requestId)
        this.pendingFsWrite.delete(msg.requestId)
        pending?.reject(new Error(msg.message))
        break
      }

      case 'fs_snapshot_done': {
        const pending = this.pendingFsSnapshot.get(msg.requestId)
        this.pendingFsSnapshot.delete(msg.requestId)
        pending?.resolve(msg.files)
        break
      }

      case 'fs_snapshot_error': {
        const pending = this.pendingFsSnapshot.get(msg.requestId)
        this.pendingFsSnapshot.delete(msg.requestId)
        pending?.reject(new Error(msg.message))
        break
      }

      case 'packages_query_done': {
        const pending = this.pendingPackagesQuery.get(msg.requestId)
        this.pendingPackagesQuery.delete(msg.requestId)
        pending?.resolve({
          action: msg.action,
          loaded: msg.loaded,
          notLoaded: msg.notLoaded,
          ...(msg.loadResults ? { loadResults: msg.loadResults } : {}),
        })
        break
      }

      case 'packages_query_error': {
        const pending = this.pendingPackagesQuery.get(msg.requestId)
        this.pendingPackagesQuery.delete(msg.requestId)
        pending?.reject(new Error(msg.message))
        break
      }

      case 'mem_report':
        // Worker 周期上报 JS 堆内存（UX §3.4 状态条）；换算 MB 写入 reactive state
        this.state.memoryMb = msg.usedBytes / 1024 / 1024
        break

      case 'shutdown_done':
        if (this.worker) {
          this.worker.terminate()
          this.worker = null
        }
        this.state.status = 'idle'
        break
    }
  }

  /**
   * 硬超时分支：90s 内 Worker 仍未响应。
   *
   * - 给当前 pending exec 返回 timeout 结果
   * - terminate 当前 Worker
   * - 异步自动重建（重建失败容忍：状态变 dead）
   */
  private handleHardTimeout = (timedOutRequestId: string) => {
    const pending = this.pendingExec.get(timedOutRequestId)
    if (!pending) return
    this.pendingExec.delete(timedOutRequestId)
    if (pending.softTimer) clearTimeout(pending.softTimer)
    if (pending.hardTimer) clearTimeout(pending.hardTimer)
    pending.resolve({
      ok: false,
      stdout: '',
      stderr: '',
      errorType: 'timeout',
      errorMessage: '硬超时（90s）',
      durationMs: Date.now() - pending.startedAt,
    })
    // 同步把其他 pending exec 也按 kernel_dead 结掉
    this.failAllPendingDueTo('硬超时清理')
    if (this.worker) {
      this.worker.terminate()
      this.worker = null
    }
    void this.autoRestart()
  }

  /** Worker 进程崩溃（postMessage 抛错 / unhandled error 等） */
  private handleWorkerCrash = (message: string) => {
    this.state.status = 'dead'
    this.state.lastError = message
    this.failAllPendingDueTo(message)
    if (this.worker) {
      this.worker.terminate()
      this.worker = null
    }
  }

  private failAllPendingDueTo = (message: string) => {
    this.pendingExec.forEach((pending) => {
      if (pending.softTimer) clearTimeout(pending.softTimer)
      if (pending.hardTimer) clearTimeout(pending.hardTimer)
      pending.resolve({
        ok: false,
        stdout: '',
        stderr: '',
        errorType: 'kernel_dead',
        errorMessage: message,
        durationMs: Date.now() - pending.startedAt,
      })
    })
    this.pendingExec.clear()
    this.pendingFsWrite.forEach(({ reject }) => reject(new Error(message)))
    this.pendingFsWrite.clear()
    this.pendingFsSnapshot.forEach(({ reject }) => reject(new Error(message)))
    this.pendingFsSnapshot.clear()
    this.pendingPackagesQuery.forEach(({ reject }) => reject(new Error(message)))
    this.pendingPackagesQuery.clear()
  }

  /** 自动重建：在硬超时分支后调用 */
  private autoRestart = async () => {
    if (!this.lastInitIndexUrl) return
    this.state.autoRestartCount += 1
    this.restartInitInFlight = true
    this.worker = this.workerFactory()
    this.interruptBuffer = createInterruptBuffer()
    this.worker.addEventListener('message', this.handleMessage)
    this.worker.addEventListener('error', (e: Event) => {
      const message = (e as ErrorEvent).message || 'Worker 错误'
      this.handleWorkerCrash(message)
    })
    this.state.status = 'booting'
    const req: HostToWorkerRequest = {
      kind: 'init',
      requestId: this.genId(),
      pyodideIndexUrl: this.lastInitIndexUrl,
      interruptBuffer: this.interruptBuffer,
    }
    this.worker.postMessage(req)
  }
}
