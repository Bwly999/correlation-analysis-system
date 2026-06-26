/**
 * 主站 ↔ iframe (notebook.html) 之间的 postMessage RPC schema。
 *
 * 协议要点（详见 docs/design-doc/notebook-agent/架构与数据流.md §2.1）：
 *   - 所有"请求"必须带 requestId；响应统一为 { kind: 'response', requestId, ok, data?, error? }。
 *   - 主站只接受 event.source === iframe.contentWindow 的消息。
 *   - iframe 只接受 event.source === window.parent 的消息。
 *   - ArrayBuffer 必须用 transferable 列表传递（postMessage(msg, [buffer])）。
 *   - 协议 kind 严格枚举，未知 kind 一律忽略。
 */

// ──────────────────────────────────────────────
// 常量：把 kind 集中导出，便于双端校验、防止拼写漂移
// ──────────────────────────────────────────────

export const PARENT_BRIDGE_KINDS = [
  'parent.handshake',
  'parent.import_csv',
  'parent.switch_session',
  'parent.close_request',
] as const

export const IFRAME_BRIDGE_KINDS = [
  'iframe.ready',
  'iframe.workspace_changed',
  'iframe.session_state',
  'iframe.request_unload_confirm',
] as const

export type ParentBridgeKind = (typeof PARENT_BRIDGE_KINDS)[number]
export type IframeBridgeKind = (typeof IFRAME_BRIDGE_KINDS)[number]

// ──────────────────────────────────────────────
// 主站 → iframe
// ──────────────────────────────────────────────

export type ImportCsvSourceKind = 'canvas-node' | 'data-source'

/**
 * 单列的描述信息（对齐设计文档 notebook-agent/数据接入.md §6.2）。
 * 用于让 Agent 在不读 CSV 的情况下就掌握列名与推断类型。
 */
export interface ImportCsvColumnMeta {
  name: string
  inferredType: string
}

export interface ImportCsvMeta {
  sourceKind: ImportCsvSourceKind
  sourceLabel: string
  rowCount: number
  columnCount: number
  /** 全量列描述（行 key 的并集 + 推断类型）。可选，保证协议向后兼容。 */
  columns?: ImportCsvColumnMeta[]
}

export type CloseReason = 'user_clicked_close' | 'session_completed' | 'tab_unload'

export type ParentBridgeRequest =
  | {
      kind: 'parent.handshake'
      requestId: string
      sessionId: string
      origin: string
    }
  | {
      kind: 'parent.import_csv'
      requestId: string
      filename: string // 写入 inputs/<filename>
      buffer: ArrayBuffer // transferable
      meta: ImportCsvMeta
    }
  | {
      // 切换到新 session（开新分析时复用同一个 iframe/runtime，不重建 Pyodide）。
      // iframe 内 runtime 会：重置 Python 状态 → 切 OPFS 目录 → 重连 SSE → 回放历史。
      // 新数据通过随后的 parent.import_csv 单独灌入（若有）。
      kind: 'parent.switch_session'
      requestId: string
      sessionId: string
    }
  | {
      kind: 'parent.close_request'
      requestId: string
      reason: CloseReason
    }

// ──────────────────────────────────────────────
// iframe → 主站
// ──────────────────────────────────────────────

export type IframeSessionState =
  | 'loading_pyodide'
  | 'ready'
  | 'agent_running'
  | 'agent_idle'
  | 'failed'

export type IframeBridgeRequest =
  | {
      kind: 'iframe.ready'
      sessionId: string
    }
  | {
      kind: 'iframe.workspace_changed'
      paths: string[]
    }
  | {
      kind: 'iframe.session_state'
      state: IframeSessionState
      detail?: string
    }
  | {
      kind: 'iframe.request_unload_confirm'
      hasUnsavedExec: boolean
    }

// ──────────────────────────────────────────────
// 双向 response
// ──────────────────────────────────────────────

export interface BridgeError {
  code: string
  message: string
}

export interface ParentBridgeResponse {
  kind: 'response'
  requestId: string
  ok: boolean
  data?: unknown
  error?: BridgeError
}

// ──────────────────────────────────────────────
// 类型守卫
//
// 这些守卫**只校验结构**，不校验 buffer 内容、字符串长度上限等业务约束。
// 业务校验由调用方在收到合法消息后再做。
// ──────────────────────────────────────────────

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null

const isNonEmptyString = (v: unknown): v is string => typeof v === 'string' && v.length > 0

const isArrayBufferLike = (v: unknown): v is ArrayBuffer => {
  if (typeof ArrayBuffer === 'undefined') return false
  // 跨 realm（iframe / Worker / vm）下 instanceof 可能失效，
  // 这里用结构化特征（byteLength + slice）作鸭子类型兜底。
  if (v instanceof ArrayBuffer) return true
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof (v as ArrayBuffer).byteLength === 'number' &&
    typeof (v as ArrayBuffer).slice === 'function' &&
    Object.prototype.toString.call(v) === '[object ArrayBuffer]'
  )
}

const VALID_CLOSE_REASONS: ReadonlySet<string> = new Set<CloseReason>([
  'user_clicked_close',
  'session_completed',
  'tab_unload',
])

const VALID_IFRAME_STATES: ReadonlySet<string> = new Set<IframeSessionState>([
  'loading_pyodide',
  'ready',
  'agent_running',
  'agent_idle',
  'failed',
])

const VALID_IMPORT_CSV_SOURCE_KINDS: ReadonlySet<string> = new Set<ImportCsvSourceKind>([
  'canvas-node',
  'data-source',
])

const validateImportCsvMeta = (meta: unknown): meta is ImportCsvMeta => {
  if (!isObject(meta)) return false
  return (
    isNonEmptyString(meta.sourceKind) &&
    VALID_IMPORT_CSV_SOURCE_KINDS.has(meta.sourceKind) &&
    typeof meta.sourceLabel === 'string' &&
    typeof meta.rowCount === 'number' &&
    typeof meta.columnCount === 'number'
  )
}

export const isParentBridgeRequest = (v: unknown): v is ParentBridgeRequest => {
  if (!isObject(v)) return false
  if (!isNonEmptyString(v.requestId)) return false

  switch (v.kind) {
    case 'parent.handshake':
      return isNonEmptyString(v.sessionId) && isNonEmptyString(v.origin)
    case 'parent.import_csv':
      return (
        isNonEmptyString(v.filename) &&
        isArrayBufferLike(v.buffer) &&
        validateImportCsvMeta(v.meta)
      )
    case 'parent.switch_session':
      return isNonEmptyString(v.sessionId)
    case 'parent.close_request':
      return typeof v.reason === 'string' && VALID_CLOSE_REASONS.has(v.reason)
    default:
      return false
  }
}

export const isIframeBridgeRequest = (v: unknown): v is IframeBridgeRequest => {
  if (!isObject(v)) return false
  switch (v.kind) {
    case 'iframe.ready':
      return isNonEmptyString(v.sessionId)
    case 'iframe.workspace_changed':
      return Array.isArray(v.paths) && v.paths.every((p) => typeof p === 'string')
    case 'iframe.session_state':
      return typeof v.state === 'string' && VALID_IFRAME_STATES.has(v.state)
    case 'iframe.request_unload_confirm':
      return typeof v.hasUnsavedExec === 'boolean'
    default:
      return false
  }
}

export const isParentBridgeResponse = (v: unknown): v is ParentBridgeResponse => {
  if (!isObject(v)) return false
  if (v.kind !== 'response') return false
  if (!isNonEmptyString(v.requestId)) return false
  return typeof v.ok === 'boolean'
}
