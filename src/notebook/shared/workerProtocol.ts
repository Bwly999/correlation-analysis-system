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
      kind: 'shutdown'
      requestId: string
    }

// ──────────────────────────────────────────────
// Worker → 主线程
// ──────────────────────────────────────────────

export type WorkerToHostMessage =
  | {
      kind: 'init_progress'
      stage: 'loading_runtime' | 'loading_packages' | 'locking' | 'ready'
      detail?: string
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
