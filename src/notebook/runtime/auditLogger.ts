/**
 * Notebook 前端审计落日志（L6）。
 *
 * iframe 内维护一个 ring buffer（最多 500 条），记录关键事件用于事后排查。
 * 隐私约束：不记录代码全文（只记 SHA-256 hash + 长度）、不记录数据值。
 *
 * 详见 docs/design-doc/notebook-agent/安全模型.md §8.1。
 */

export type AuditEntry =
  | { ts: string; kind: 'exec_start'; execId: string; codeHash: string; codeLen: number }
  | { ts: string; kind: 'exec_done'; execId: string; status: string; elapsedMs: number }
  | { ts: string; kind: 'fs_write'; path: string; bytes: number }
  | { ts: string; kind: 'fs_edit'; path: string; replacements: number }
  | { ts: string; kind: 'tool_error'; tool: string; code: string }
  | { ts: string; kind: 'worker_restart'; reason: string }
  | { ts: string; kind: 'quota_hit'; current: number; limit: number }

const MAX_ENTRIES = 500

export class AuditLog {
  private buffer: AuditEntry[] = []
  /** 连续 tool_error 计数（用于触发上报阈值） */
  private consecutiveToolErrors = 0
  private readonly onReportable?: (entries: AuditEntry[]) => void

  constructor(opts?: { onReportable?: (entries: AuditEntry[]) => void }) {
    this.onReportable = opts?.onReportable
  }

  /** 记录一条审计事件。超出 MAX_ENTRIES 时丢弃最旧条目（ring buffer）。 */
  push(entry: AuditEntry): void {
    this.buffer.push(entry)
    if (this.buffer.length > MAX_ENTRIES) {
      this.buffer.shift()
    }
    // tool_error 连续 5 次触发上报；任何非 tool_error 事件重置计数（表示取得进展）
    if (entry.kind === 'tool_error') {
      this.consecutiveToolErrors += 1
      if (this.consecutiveToolErrors === 5) {
        this.onReportable?.(this.snapshot())
      }
    } else {
      this.consecutiveToolErrors = 0
    }
  }

  /** worker_restart / quota_hit 是单独可上报事件 */
  pushAndReport(entry: Extract<AuditEntry, { kind: 'worker_restart' | 'quota_hit' }>): void {
    this.push(entry)
    this.onReportable?.([entry])
  }

  /** 返回当前 buffer 的浅拷贝快照（供上报） */
  snapshot(): AuditEntry[] {
    return [...this.buffer]
  }

  /** 清空（一般 session 重置时调用） */
  clear(): void {
    this.buffer = []
    this.consecutiveToolErrors = 0
  }

  get length(): number {
    return this.buffer.length
  }
}

/**
 * 计算代码的 SHA-256 hash（用于审计记录，避免明文落库）。
 * 用 SubtleCrypto（COI 下可用，且无外部依赖）。
 * 返回 hex 字符串；失败时回退到 'sha-unavailable'。
 */
export const computeCodeHash = async (code: string): Promise<string> => {
  try {
    const data = new TextEncoder().encode(code)
    const digest = await crypto.subtle.digest('SHA-256', data)
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
  } catch {
    return 'sha-unavailable'
  }
}
