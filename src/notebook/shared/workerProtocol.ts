/**
 * Worker ↔ Notebook 主线程之间的 RPC 协议（PoC v0）。
 *
 * 状态：当前 PoC 直接在主页面与 Worker 通信，未经 iframe。
 * iframe 接入后，主页面侧改名为「iframe 内的 workerHost」，协议本体不变。
 *
 * 所有消息都带 requestId（除事件流外），用于 RPC 配对。
 */

// ──────────────────────────────────────────────
// 主线程 → Worker
// ──────────────────────────────────────────────

export type HostToWorkerRequest =
  | {
      kind: 'init'
      requestId: string
      pyodideIndexUrl: string // 形如 /pyodide/v0.27/
      interruptBuffer: SharedArrayBuffer | null // 失败容忍：null 时退化为软中断
    }
  | {
      kind: 'exec_inline'
      requestId: string
      code: string
      timeoutMs?: number
    }
  | {
      // 主线程把字节写进 Worker 内 Pyodide 的 MEMFS。
      // 仅供 import_csv / sync 桥接使用，**不暴露给 Agent**。
      kind: 'fs_write_inline'
      requestId: string
      // 必须以 inputs|scripts|artifacts|reports 之一开头。Worker 内会用 resolveSafePath 二次校验。
      path: string
      bytes: ArrayBuffer
    }
  | {
      kind: 'shutdown'
      requestId: string
    }
  | {
      kind: 'fs_snapshot'
      requestId: string
      paths?: string[]
    }
  | {
      // 查询/加载 runtime 包。action=list 返回 loaded/notLoaded 清单；
      // action=load 按 packages 数组调 pyodide.loadPackage。
      kind: 'packages_query'
      requestId: string
      action: 'list' | 'load'
      packages?: string[]
    }

// ──────────────────────────────────────────────
// Worker → 主线程
// ──────────────────────────────────────────────

export type WorkerToHostMessage =
  | {
      kind: 'init_progress'
      stage: string
      detail?: string
      /** 0-100 进度百分比；为空时由主线程回退到 BOOT_STAGE_TO_UI 映射 */
      percent?: number
    }
  | {
      kind: 'init_done'
      requestId: string
      pyodideVersion: string
      crossOriginIsolated: boolean
      sabSupported: boolean
    }
  | {
      kind: 'init_error'
      requestId: string
      message: string
      stack?: string
    }
  | {
      // exec 流式 stdout/stderr —— PoC 以「整段返回」为主，预留增量字段
      kind: 'exec_stream'
      requestId: string
      stream: 'stdout' | 'stderr'
      chunk: string
    }
  | {
      kind: 'exec_done'
      requestId: string
      stdout: string
      stderr: string
      durationMs: number
      truncated: boolean
    }
  | {
      kind: 'exec_error'
      requestId: string
      errorType:
        | 'syntax_error'
        | 'runtime_error'
        | 'timeout'
        | 'interrupted'
        | 'kernel_dead'
        | 'unknown'
      message: string
      traceback?: string
      stdout: string
      stderr: string
      durationMs: number
    }
  | {
      kind: 'shutdown_done'
      requestId: string
    }
  | {
      kind: 'fs_write_done'
      requestId: string
      path: string
      bytes: number
    }
  | {
      kind: 'fs_write_error'
      requestId: string
      message: string
    }
  | {
      kind: 'fs_snapshot_done'
      requestId: string
      files: Array<{
        path: string
        bytes: ArrayBuffer
      }>
    }
  | {
      kind: 'fs_snapshot_error'
      requestId: string
      message: string
    }
  | {
      // packages_query(action=list) 的结果：runtime 内所有包按加载状态分组
      kind: 'packages_query_done'
      requestId: string
      action: 'list' | 'load'
      loaded: Array<{ name: string; version: string }>
      notLoaded: Array<{ name: string; version: string }>
      // action=load 时的加载结果（成功的包会出现在 loaded 里）
      loadResults?: Array<{ name: string; ok: boolean; message?: string }>
    }
  | {
      kind: 'packages_query_error'
      requestId: string
      message: string
    }
    | {
      // Worker 内周期上报的内存占用（UX §3.4 状态条内存）。
      // 主源：Pyodide WASM linear memory（pyodide._module.wasmMemory），
      // 含 pandas/numpy/DataFrame 等大头；Chromium 系再叠加 performance.memory 的 V8 JS heap。
      // 非 Chromium / WASM heap 不可读时 usedBytes 仍可能为 0。
      kind: 'mem_report'
      usedBytes: number
    }

// ──────────────────────────────────────────────
// SAB 中断协议
//
// 写入 SIGINT (=2) 到 buffer[0]，pyodide 的 setInterruptBuffer 会在
// 下一次 Python 字节码 dispatch 时抛 KeyboardInterrupt。
//
// 0 = 无信号
// 2 = SIGINT（请求软中断）
// ──────────────────────────────────────────────

export const INTERRUPT_NONE = 0
export const INTERRUPT_SIGINT = 2

export const createInterruptBuffer = (): SharedArrayBuffer | null => {
  // SAB 仅在 crossOriginIsolated 上下文中可用
  if (typeof SharedArrayBuffer === 'undefined') return null
  if (typeof crossOriginIsolated !== 'undefined' && !crossOriginIsolated) return null
  try {
    return new SharedArrayBuffer(4)
  } catch {
    return null
  }
}

export const requestInterrupt = (sab: SharedArrayBuffer): void => {
  const view = new Int32Array(sab)
  view[0] = INTERRUPT_SIGINT
}

export const clearInterrupt = (sab: SharedArrayBuffer): void => {
  const view = new Int32Array(sab)
  view[0] = INTERRUPT_NONE
}

