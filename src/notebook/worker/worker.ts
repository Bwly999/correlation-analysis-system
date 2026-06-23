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

import { bootPyodide, execPython, type RuntimePackageMeta } from './pyodideBoot'
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
/** boot 时从 lock 读出的 runtime 全量包清单（python_packages 工具查询用） */
let runtimePackages: RuntimePackageMeta[] = []
const WORKSPACE_ROOTS = ['inputs', 'scripts', 'artifacts', 'reports'] as const

// 内存上报定时器（UX §3.4 状态条）：init 成功后每 2s 把内存占用推给主线程。
//
// 数据源选择：performance.memory（usedJSHeapSize）是 Chromium 非标准 API，
// 且长期仅在主线程暴露——Web Worker 里几乎拿不到（老 Chrome / Firefox / Safari
// 全部为 undefined），导致旧实现里 mem 恒为 0。更关键的是它只统计 V8 JS heap，
// 不含 Pyodide 的 WASM linear memory（pandas/numpy/DataFrame 这些大头全在里面）。
//
// 故改以 Pyodide 的 WASM heap 为主：pyodide._module.wasmMemory.buffer.byteLength
// 是当前 WASM 线性内存大小（随 sbrk 增长，跨浏览器可得）；performance.memory
// 支持时（Chrome ≥128 Worker）叠加 V8 JS heap，使数值更完整。两者都拿不到
// 才不启动定时器（此时状态条 mem 显示 0）。
let memReportTimer: ReturnType<typeof setInterval> | null = null
const MEM_REPORT_INTERVAL_MS = 2000

/** 读 performance.memory.usedJSHeapSize（仅 Chromium 主线程 / 新版 Worker 支持） */
const readJsHeapBytes = (): number => {
  const used = (
    performance as Performance & { memory?: { usedJSHeapSize?: number } }
  ).memory?.usedJSHeapSize
  return typeof used === 'number' ? used : 0
}

/**
 * 读 Pyodide WASM linear memory 当前大小（字节）。
 * `_module` 是 Pyodide 挂在实例上的私有字段（pyodide.asm.js 内 `_module=` 赋值），
 * wasmMemory 是 Emscripten Module 暴露的 WebAssembly.Memory。字段缺失返回 0。
 */
const readWasmHeapBytes = (pyodide: PyodideInterface): number => {
  const mod = (pyodide as PyodideInterface & {
    _module?: { wasmMemory?: WebAssembly.Memory; HEAPU8?: Uint8Array }
  })._module
  const mem = mod?.wasmMemory ?? mod?.HEAPU8?.buffer
  return mem && 'byteLength' in mem ? mem.byteLength : 0
}

const startMemReporting = (pyodide: PyodideInterface) => {
  if (memReportTimer) return
  const report = () => {
    const used = readWasmHeapBytes(pyodide) + readJsHeapBytes()
    if (used > 0) {
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
    runtimePackages = result.runtimePackages

    post({
      kind: 'init_done',
      requestId: req.requestId,
      pyodideVersion: result.pyodideVersion,
      crossOriginIsolated: typeof crossOriginIsolated !== 'undefined' && crossOriginIsolated,
      sabSupported: typeof SharedArrayBuffer !== 'undefined' && interruptBuffer !== null,
    })
    startMemReporting(pyodide)
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
    case 'packages_query':
      void handlePackagesQuery(req)
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

const handlePackagesQuery = async (
  req: Extract<HostToWorkerRequest, { kind: 'packages_query' }>,
) => {
  if (!pyodide) {
    post({
      kind: 'packages_query_error',
      requestId: req.requestId,
      message: 'Pyodide 尚未初始化',
    })
    return
  }

  // loadedPackages: { [name]: channel } —— pyodide 维护，记录已 loadPackage 过的包
  const loadedMap = pyodide.loadedPackages as unknown as Record<string, string>
  const isLoaded = (name: string) => !!loadedMap[name]

  // action=load：先按需加载，再返回最新状态
  let loadResults: Array<{ name: string; ok: boolean; message?: string }> | undefined
  if (req.action === 'load' && Array.isArray(req.packages)) {
    loadResults = []
    for (const name of req.packages) {
      if (isLoaded(name)) {
        loadResults.push({ name, ok: true })
        continue
      }
      const exists = runtimePackages.some((p) => p.name === name)
      if (!exists) {
        loadResults.push({
          name,
          ok: false,
          message: `包 ${name} 不在 runtime lock 中，无法加载`,
        })
        continue
      }
      try {
        // fetch 白名单 shim 放行同源 runtime wheel
        await pyodide.loadPackage(name)
        loadResults.push({ name, ok: isLoaded(name) })
      } catch (err) {
        loadResults.push({
          name,
          ok: false,
          message: err instanceof Error ? err.message : String(err),
        })
      }
    }
  }

  const loaded: Array<{ name: string; version: string }> = []
  const notLoaded: Array<{ name: string; version: string }> = []
  for (const p of runtimePackages) {
    if (isLoaded(p.name)) {
      loaded.push({ name: p.name, version: p.version })
    } else {
      notLoaded.push({ name: p.name, version: p.version })
    }
  }

  post({
    kind: 'packages_query_done',
    requestId: req.requestId,
    action: req.action,
    loaded,
    notLoaded,
    loadResults,
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
