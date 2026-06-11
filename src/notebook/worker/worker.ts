/**
 * Notebook Worker（PoC v0）。
 *
 * 职责：
 *  1) 启动 Pyodide（带 jsglobals 锁）
 *  2) 接收 exec_inline 请求，执行后返回结果
 *  3) 通过 SAB 接收 SIGINT，由 pyodide.setInterruptBuffer 处理
 *
 * 进程模型：
 *  - 一个会话一个 Worker
 *  - 死了之后由主线程 terminate + 重建（不在 Worker 内自我恢复）
 */

import { bootPyodide, execPython } from './pyodideBoot'
import {
  clearInterrupt,
  type HostToWorkerRequest,
  type WorkerToHostMessage,
} from '../shared/workerProtocol'
import { resolveSafePath } from '../shared/opfsAccess'
import type { PyodideInterface } from 'pyodide'

let pyodide: PyodideInterface | null = null
let interruptBuffer: SharedArrayBuffer | null = null
let booting = false

const post = (msg: WorkerToHostMessage) => {
  ;(self as unknown as Worker).postMessage(msg)
}

const handleInit = async (req: Extract<HostToWorkerRequest, { kind: 'init' }>) => {
  if (pyodide || booting) {
    post({
      kind: 'init_error',
      requestId: req.requestId,
      message: 'Worker already initialized',
    })
    return
  }
  booting = true
  interruptBuffer = req.interruptBuffer

  try {
    const result = await bootPyodide({
      pyodideIndexUrl: req.pyodideIndexUrl,
      interruptBuffer: req.interruptBuffer,
      onProgress: (stage, detail) => {
        post({
          kind: 'init_progress',
          stage: stage as 'loading_runtime' | 'loading_packages' | 'locking' | 'ready',
          detail,
        })
      },
    })
    pyodide = result.pyodide

    post({
      kind: 'init_done',
      requestId: req.requestId,
      pyodideVersion: result.pyodideVersion,
      crossOriginIsolated: typeof crossOriginIsolated !== 'undefined' && crossOriginIsolated,
      sabSupported: typeof SharedArrayBuffer !== 'undefined' && interruptBuffer !== null,
    })
  } catch (err) {
    booting = false
    const message = err instanceof Error ? err.message : String(err)
    const stack = err instanceof Error ? err.stack : undefined
    post({ kind: 'init_error', requestId: req.requestId, message, stack })
  }
}

const handleExec = async (req: Extract<HostToWorkerRequest, { kind: 'exec_inline' }>) => {
  if (!pyodide) {
    post({
      kind: 'exec_error',
      requestId: req.requestId,
      errorType: 'kernel_dead',
      message: 'Pyodide 尚未初始化',
      stdout: '',
      stderr: '',
      durationMs: 0,
    })
    return
  }

  // 清掉中断标志（前一轮可能残留）
  if (interruptBuffer) clearInterrupt(interruptBuffer)

  const t0 = performance.now()
  const outcome = await execPython(pyodide, req.code)
  const durationMs = Math.round(performance.now() - t0)

  if (outcome.errorType) {
    post({
      kind: 'exec_error',
      requestId: req.requestId,
      errorType: outcome.errorType,
      message: outcome.errorMessage ?? '',
      traceback: outcome.traceback,
      stdout: outcome.stdout,
      stderr: outcome.stderr,
      durationMs,
    })
    return
  }

  post({
    kind: 'exec_done',
    requestId: req.requestId,
    stdout: outcome.stdout,
    stderr: outcome.stderr,
    durationMs,
    truncated: false,
  })
}

self.addEventListener('message', (event: MessageEvent<HostToWorkerRequest>) => {
  const req = event.data
  if (!req || typeof req !== 'object') return

  switch (req.kind) {
    case 'init':
      void handleInit(req)
      break
    case 'exec_inline':
      void handleExec(req)
      break
    case 'fs_write_inline':
      void handleFsWrite(req)
      break
    case 'shutdown':
      post({ kind: 'shutdown_done', requestId: req.requestId })
      ;(self as unknown as DedicatedWorkerGlobalScope).close()
      break
  }
})

const handleFsWrite = async (
  req: Extract<HostToWorkerRequest, { kind: 'fs_write_inline' }>,
) => {
  if (!pyodide) {
    post({
      kind: 'fs_write_error',
      requestId: req.requestId,
      message: 'Pyodide 尚未初始化',
    })
    return
  }
  let segments: string[]
  try {
    segments = resolveSafePath(req.path)
  } catch (err) {
    post({
      kind: 'fs_write_error',
      requestId: req.requestId,
      message: err instanceof Error ? err.message : String(err),
    })
    return
  }

  try {
    // 父目录递归创建（顶级 4 个由 bootPyodide 已建好；子目录按需建）
    let cur = ''
    for (let i = 0; i < segments.length - 1; i += 1) {
      cur = `${cur}/${segments[i]}`
      try {
        pyodide.FS.mkdirTree(cur)
      } catch {
        // EEXIST 忽略
      }
    }
    const fullPath = `/${segments.join('/')}`
    const bytes = new Uint8Array(req.bytes)
    pyodide.FS.writeFile(fullPath, bytes)
    post({
      kind: 'fs_write_done',
      requestId: req.requestId,
      path: segments.join('/'),
      bytes: bytes.byteLength,
    })
  } catch (err) {
    post({
      kind: 'fs_write_error',
      requestId: req.requestId,
      message: err instanceof Error ? err.message : String(err),
    })
  }
}
