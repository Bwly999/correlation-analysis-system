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
const WORKSPACE_ROOTS = ['inputs', 'scripts', 'artifacts', 'reports'] as const

// 内存上报定时器（UX §3.4 状态条）：init 成功后每 2s 把 JS 堆占用推给主线程。
// 仅 Chromium 系内核有 performance.memory；无该字段时不启动（状态条 mem 显示 0）。
let memReportTimer: ReturnType<typeof setInterval> | null = null
const MEM_REPORT_INTERVAL_MS = 2000

const startMemReporting = () => {
  if (memReportTimer) return
  // performance.memory 是非标准 API，仅基于 Chromium 的浏览器可用。
  const perfMemory = (performance as Performance & { memory?: { usedJSHeapSize?: number } }).memory
  if (!perfMemory || typeof perfMemory.usedJSHeapSize !== 'number') return
  const report = () => {
    const used = (performance as Performance & { memory?: { usedJSHeapSize?: number } }).memory
      ?.usedJSHeapSize
    if (typeof used === 'number') {
      post({ kind: 'mem_report', usedBytes: used })
    }
  }
  report() // 立即上报一次，避免状态条前 2s 仍是 0
  memReportTimer = setInterval(report, MEM_REPORT_INTERVAL_MS)
}

const stopMemReporting = () => {
  if (memReportTimer) {
    clearInterval(memReportTimer)
    memReportTimer = null
  }
}

const cloneUint8ArrayToArrayBuffer = (bytes: Uint8Array): ArrayBuffer => {
  const out = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(out).set(bytes)
  return out
}

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
    startMemReporting()
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
    case 'fs_snapshot':
      void handleFsSnapshot(req)
      break
    case 'shutdown':
      stopMemReporting()
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

const collectSnapshotPaths = (
  baseDir: string,
  requestedPaths?: string[],
): string[] => {
  if (!pyodide) return []
  const fs = pyodide.FS
  const listFileRecursive = (dirPath: string): string[] => {
    let entries: string[] = []
    try {
      entries = fs.readdir(dirPath)
    } catch {
      return []
    }

    return entries
      .filter((name) => name !== '.' && name !== '..')
      .flatMap((name) => {
        const childPath = `${dirPath}/${name}`.replace(/\/+/g, '/')
        try {
          const stat = fs.stat(childPath)
          if (fs.isDir(stat.mode)) {
            return listFileRecursive(childPath)
          }
          return [childPath]
        } catch {
          return []
        }
      })
  }

  if (!requestedPaths || requestedPaths.length === 0) {
    return WORKSPACE_ROOTS.flatMap((dir) => listFileRecursive(`/${dir}`))
  }

  return requestedPaths.flatMap((path) => {
    try {
      const normalized = `/${resolveSafePath(path).join('/')}`
      const stat = fs.stat(normalized)
      if (fs.isDir(stat.mode)) {
        return listFileRecursive(normalized)
      }
      return [normalized]
    } catch {
      return []
    }
  })
}

const handleFsSnapshot = async (
  req: Extract<HostToWorkerRequest, { kind: 'fs_snapshot' }>,
) => {
  if (!pyodide) {
    post({
      kind: 'fs_snapshot_error',
      requestId: req.requestId,
      message: 'Pyodide 尚未初始化',
    })
    return
  }

  try {
    const files = collectSnapshotPaths('/', req.paths).map((fullPath) => {
      const bytes = pyodide!.FS.readFile(fullPath) as Uint8Array
      return {
        path: fullPath.replace(/^\//, ''),
        bytes: cloneUint8ArrayToArrayBuffer(bytes),
      }
    })

    const transfer = files.map((file) => file.bytes)
    ;(self as unknown as Worker).postMessage(
      {
        kind: 'fs_snapshot_done',
        requestId: req.requestId,
        files,
      } satisfies WorkerToHostMessage,
      transfer,
    )
  } catch (err) {
    post({
      kind: 'fs_snapshot_error',
      requestId: req.requestId,
      message: err instanceof Error ? err.message : String(err),
    })
  }
}
