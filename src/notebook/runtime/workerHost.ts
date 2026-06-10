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

// vite worker import：?worker query。
// 不指定 type=module，让 vite 在 dev 时也用 classic worker——
// pyodide 在 worker 内通过 importScripts 加载 pyodide.asm.js，
// module worker 没有 importScripts 会有兼容问题，classic worker 一切正常。
import NotebookWorker from '../worker/worker?worker'

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

export interface HostState {
  status: 'idle' | 'booting' | 'ready' | 'busy' | 'dead'
  bootStage: string
  bootStageDetail: string
  pyodideVersion: string
  crossOriginIsolated: boolean
  sabSupported: boolean
  lastError: string
}

interface PendingExec {
  resolve: (r: ExecResult) => void
}

interface PendingInit {
  resolve: (info: InitDoneInfo) => void
  reject: (err: Error) => void
}

export class WorkerHost {
  readonly state: HostState
  private worker: Worker | null = null
  private interruptBuffer: SharedArrayBuffer | null = null
  private pendingInit: PendingInit | null = null
  private pendingExec: Map<string, PendingExec> = new Map()
  private nextId = 0

  constructor() {
    this.state = reactive<HostState>({
      status: 'idle',
      bootStage: '',
      bootStageDetail: '',
      pyodideVersion: '',
      crossOriginIsolated: false,
      sabSupported: false,
      lastError: '',
    })
  }

  private genId(): string {
    this.nextId += 1
    return `req-${Date.now()}-${this.nextId}`
  }

  async init(pyodideIndexUrl: string): Promise<InitDoneInfo> {
    if (this.worker) throw new Error('Worker 已存在')

    this.worker = new NotebookWorker({ name: 'notebook-pyodide' })
    this.interruptBuffer = createInterruptBuffer()

    this.worker.addEventListener('message', this.handleMessage)
    this.worker.addEventListener('error', (e) => {
      this.state.status = 'dead'
      this.state.lastError = e.message || 'Worker 错误'
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
    const req: HostToWorkerRequest = { kind: 'exec_inline', requestId, code, timeoutMs }
    this.state.status = 'busy'

    return new Promise<ExecResult>((resolve) => {
      this.pendingExec.set(requestId, { resolve })
      this.worker!.postMessage(req)
    })
  }

  /** 软中断：写 SAB；pyodide 在下次字节码 dispatch 时抛 KeyboardInterrupt */
  interrupt(): boolean {
    if (!this.interruptBuffer) return false
    requestInterrupt(this.interruptBuffer)
    return true
  }

  /** 硬中断：直接 terminate + 重建（PoC v0 暂不自动重建） */
  hardKill(): void {
    if (this.worker) {
      this.worker.terminate()
      this.worker = null
    }
    this.state.status = 'dead'
    this.state.lastError = 'Worker 已被强制终止'
    // 把 pending 全部 reject
    this.pendingExec.forEach(({ resolve }) =>
      resolve({
        ok: false,
        stdout: '',
        stderr: '',
        errorType: 'kernel_dead',
        errorMessage: 'Worker 已被终止',
        durationMs: 0,
      }),
    )
    this.pendingExec.clear()
  }

  private handleMessage = (event: MessageEvent<WorkerToHostMessage>) => {
    const msg = event.data
    if (!msg) return

    switch (msg.kind) {
      case 'init_progress':
        this.state.bootStage = msg.stage
        this.state.bootStageDetail = msg.detail ?? ''
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
        this.state.status = 'ready'
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
        this.state.status = 'ready'
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

      case 'shutdown_done':
        if (this.worker) {
          this.worker.terminate()
          this.worker = null
        }
        this.state.status = 'idle'
        break
    }
  }
}
