import { httpClient, requestStream } from '@/services/httpClient'
import type { AuditEntry } from './auditLogger'

export type NotebookAgentEvent =
  | { type: 'stream.ready' }
  | { type: 'stream.heartbeat' }
  | { type: 'session.status'; sessionId: string; status: string }
  | {
      type: 'session.title_updated'
      sessionId: string
      title: string
    }
  | {
      type: 'session.context_usage'
      sessionId: string
      tokens: number | null
      contextWindow: number
      percent: number | null
    }
  | {
      type: 'session.compaction_start'
      sessionId: string
      reason: 'manual' | 'threshold' | 'overflow'
    }
  | {
      type: 'session.compaction_end'
      sessionId: string
      reason: 'manual' | 'threshold' | 'overflow'
      aborted: boolean
      willRetry: boolean
      errorMessage?: string
      tokensBefore: number | null
      firstKeptEntryId: string | null
      summary: string | null
    }
  | {
      type: 'message.start'
      sessionId: string
      messageId: string
      role: 'assistant'
      visibility: 'assistant_visible'
    }
  | {
      type: 'message.delta'
      sessionId: string
      messageId: string
      delta: string
    }
  | {
      type: 'message.thinking_delta'
      sessionId: string
      messageId: string
      delta: string
    }
  | {
      type: 'message.completed'
      sessionId: string
      messageId: string
      content: string
      rawContent: string
      visibility: 'assistant_visible'
    }
  | {
      type: 'tool.start'
      sessionId: string
      toolCall: Record<string, unknown>
    }
  | {
      type: 'tool.execute'
      sessionId: string
      toolCallId: string
      toolName: string
      params: Record<string, unknown>
    }
  | {
      type: 'tool.end'
      sessionId: string
      toolCallId: string
      result: string
      isError: boolean
    }
  | {
      type: 'error'
      sessionId: string
      message: string
    }

const isSuccessStatus = (status: number) => status >= 200 && status < 300

const decodeStreamChunk = (decoder: TextDecoder, value: unknown) => {
  if (value instanceof ArrayBuffer) {
    return decoder.decode(new Uint8Array(value), { stream: true })
  }
  if (ArrayBuffer.isView(value)) {
    return decoder.decode(value, { stream: true })
  }
  return String(value)
}

const readStreamText = async (stream: ReadableStream<unknown> | null): Promise<string> => {
  if (!stream) return ''

  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decodeStreamChunk(decoder, value)
  }

  buffer += decoder.decode()
  return buffer
}

const readStreamPayload = async (stream: ReadableStream<unknown> | null): Promise<unknown> => {
  const text = (await readStreamText(stream)).trim()
  if (!text) return {}

  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

export const streamNotebookAgentEvents = async (
  sessionId: string,
  options: {
    onOpen?: () => void
    onEvent?: (event: NotebookAgentEvent) => void
    signal?: AbortSignal
  } = {},
) => {
  const response = await requestStream({
    url: `/notebook-agent/sessions/${sessionId}/events`,
    method: 'GET',
    signal: options.signal,
  })

  if (!isSuccessStatus(response.status)) {
    const payload = await readStreamPayload(response.data)
    const message =
      typeof payload === 'object' && payload && 'message' in payload && typeof payload.message === 'string'
        ? payload.message
        : '读取 Notebook Agent 事件流失败'
    throw new Error(message)
  }

  if (!response.data) {
    throw new Error('Notebook Agent 事件流不可用')
  }

  options.onOpen?.()
  const reader = response.data.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { value, done } = await reader.read()
    if (done) break

    buffer += decodeStreamChunk(decoder, value)
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue
      options.onEvent?.(JSON.parse(trimmed) as NotebookAgentEvent)
    }
  }

  buffer += decoder.decode()
  const trailing = buffer.trim()
  if (trailing) {
    options.onEvent?.(JSON.parse(trailing) as NotebookAgentEvent)
  }
}

export const sendNotebookAgentMessage = async (
  sessionId: string,
  payload: {
    id: string
    content: string
  },
) => {
  const response = await httpClient.request({
    url: `/notebook-agent/sessions/${sessionId}/messages`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    data: payload,
  })

  if (!isSuccessStatus(response.status)) {
    const message =
      typeof response.data === 'object'
      && response.data
      && 'message' in response.data
      && typeof response.data.message === 'string'
        ? response.data.message
        : '发送 Notebook Agent 消息失败'
    throw new Error(message)
  }

  return response.data as { ok: boolean }
}

export const resolveNotebookAgentToolResult = async (
  sessionId: string,
  toolCallId: string,
  result: {
    content: Array<{ type: 'text'; text: string }>
    details: Record<string, unknown>
    isError?: boolean
  },
) => {
  const response = await httpClient.request({
    url: `/notebook-agent/sessions/${sessionId}/tool-result`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    data: { toolCallId, result },
  })

  if (!isSuccessStatus(response.status)) {
    const message =
      typeof response.data === 'object'
      && response.data
      && 'message' in response.data
      && typeof response.data.message === 'string'
        ? response.data.message
        : '发送 Notebook Agent 工具执行结果失败'
    throw new Error(message)
  }

  return response.data as { ok: boolean }
}

/**
 * 终止当前轮 Agent 推理（用户主动取消）。
 * 后端会清队列、取消挂起的工具调用、session.abort() 并广播 session.status:"cancelled"。
 */
export const abortNotebookAgentSession = async (
  sessionId: string,
) => {
  const response = await httpClient.request({
    url: `/notebook-agent/sessions/${sessionId}/abort`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    data: {},
  })

  if (!isSuccessStatus(response.status)) {
    const message =
      typeof response.data === 'object'
      && response.data
      && 'message' in response.data
      && typeof response.data.message === 'string'
        ? response.data.message
        : '终止 Notebook Agent 失败'
    throw new Error(message)
  }

  return response.data as { ok: boolean }
}

/**
 * 手动触发上下文压缩。
 *
 * 后端调 SDK 的 session.compact()，由 LLM 把早期对话总结成结构化摘要。
 * 压缩过程的 compaction_start / compaction_end 事件会经 events 流自动推回，
 * 调用方无需轮询；返回的 ok 仅表示"已成功触发"。
 *
 * @param customInstructions 可选自定义摘要指令（如"重点保留代码变更"）
 */
export const compactNotebookAgentSession = async (
  sessionId: string,
  customInstructions?: string,
) => {
  const response = await httpClient.request({
    url: `/notebook-agent/sessions/${sessionId}/compact`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    data: { customInstructions },
  })

  if (!isSuccessStatus(response.status)) {
    const message =
      typeof response.data === 'object'
      && response.data
      && 'message' in response.data
      && typeof response.data.message === 'string'
        ? response.data.message
        : '触发上下文压缩失败'
    throw new Error(message)
  }

  return response.data as { ok: boolean }
}

/**
 * 向 Agent 注入一条 system message（环境变更通知，如 Worker 重启）。
 * 不触发新一轮，挂在下一条用户消息之前作上下文。
 * 失败静默：这是可观测性增强，不应阻塞重启主流程。
 */
export const notifyNotebookEnvironmentChanged = async (
  sessionId: string,
  message: string,
): Promise<void> => {
  try {
    await httpClient.request({
      url: `/notebook-agent/sessions/${sessionId}/system-message`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      data: { message },
    })
  } catch {
    // 静默：环境通知是 best-effort，失败不阻塞
  }
}

/**
 * 上报审计日志条目到后端（关键事件 / session 结束全量）。
 * 失败静默：审计是 best-effort，不应阻塞笔记本主流程。
 */
export const reportNotebookAuditEntries = async (
  sessionId: string,
  entries: AuditEntry[],
): Promise<void> => {
  if (entries.length === 0) return
  try {
    await httpClient.request({
      url: `/notebook-agent/sessions/${sessionId}/audit`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      data: { entries },
    })
  } catch {
    // 静默：审计上报失败不阻塞
  }
}

// ──────────────────────────────────────────────
// 历史回放 & resume（「继续上次分析」）
// ──────────────────────────────────────────────

/** 后端 sessionStore 里的历史消息记录（与 gateway summarize 返回结构一致） */
export interface NotebookHistoryMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  rawContent?: string
  thinking?: string
  status: 'streaming' | 'completed'
  createdAt: number
}

/** 后端 sessionStore 里的历史工具调用记录 */
export interface NotebookHistoryToolCall {
  id: string
  toolName: string
  args: unknown
  status: 'running' | 'success' | 'failed'
  result?: string
  isError?: boolean
  startedAt: number
  finishedAt?: number
}

export interface NotebookSessionHistory {
  sessionId: string
  title?: string
  status: string
  messages: NotebookHistoryMessage[]
  toolCalls: NotebookHistoryToolCall[]
  createdAt: number
  updatedAt: number
}

export interface NotebookSessionListItem {
  sessionId: string
  title: string
  status: string
  archivedAt?: number
  createdAt: number
  updatedAt: number
  messageCount: number
  lastUserMessagePreview?: string
  initialDataMeta?: {
    sourceKind: 'canvas-node' | 'data-source'
    sourceLabel: string
    rowCount: number
    columnCount: number
  }
}

export interface NotebookSessionListResponse {
  sessions: NotebookSessionListItem[]
}

export interface NotebookSessionCreateRequest {
  initialDataMeta?: {
    sourceKind: 'canvas-node' | 'data-source'
    sourceLabel: string
    rowCount: number
    columnCount: number
  }
  origin?: string
}

export interface NotebookSessionCreateResponse {
  sessionId: string
  systemPrompt: string
}

/** GET /sessions/:id 拉取完整历史（含 messages + toolCalls），供 resume 时回放。 */
export const fetchNotebookSessionHistory = async (
  sessionId: string,
): Promise<NotebookSessionHistory | null> => {
  const response = await httpClient.request({
    url: `/notebook-agent/sessions/${sessionId}`,
    method: 'GET',
  })
  if (!isSuccessStatus(response.status)) return null
  return response.data as NotebookSessionHistory
}

export const listNotebookSessions = async (): Promise<NotebookSessionListResponse> => {
  const response = await httpClient.request({
    url: '/notebook-agent/sessions',
    method: 'GET',
  })

  if (!isSuccessStatus(response.status)) {
    const message =
      typeof response.data === 'object'
      && response.data
      && 'message' in response.data
      && typeof response.data.message === 'string'
        ? response.data.message
        : '读取 Notebook 会话列表失败'
    throw new Error(message)
  }

  return response.data as NotebookSessionListResponse
}

export const createNotebookSessionEntry = async (
  payload: NotebookSessionCreateRequest,
): Promise<NotebookSessionCreateResponse> => {
  const response = await httpClient.request({
    url: '/notebook-agent/sessions',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    data: payload,
  })

  if (!isSuccessStatus(response.status)) {
    const message =
      typeof response.data === 'object'
      && response.data
      && 'message' in response.data
      && typeof response.data.message === 'string'
        ? response.data.message
        : '创建 Notebook 会话失败'
    throw new Error(message)
  }

  return response.data as NotebookSessionCreateResponse
}

export const renameNotebookSession = async (
  sessionId: string,
  title: string,
): Promise<{ ok: boolean }> => {
  const response = await httpClient.request({
    url: `/notebook-agent/sessions/${sessionId}/title`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    data: { title },
  })

  if (!isSuccessStatus(response.status)) {
    const message =
      typeof response.data === 'object'
      && response.data
      && 'message' in response.data
      && typeof response.data.message === 'string'
        ? response.data.message
        : '更新 Notebook 会话标题失败'
    throw new Error(message)
  }

  return response.data as { ok: boolean }
}

export const deleteNotebookSession = async (
  sessionId: string,
): Promise<{ ok: boolean }> => {
  const response = await httpClient.request({
    url: `/notebook-agent/sessions/${sessionId}`,
    method: 'DELETE',
  })

  if (!isSuccessStatus(response.status)) {
    const message =
      typeof response.data === 'object'
      && response.data
      && 'message' in response.data
      && typeof response.data.message === 'string'
        ? response.data.message
        : '删除 Notebook 会话失败'
    throw new Error(message)
  }

  return response.data as { ok: boolean }
}

/** POST /sessions/:id/resume 恢复已归档会话（重建 runtime，保留历史 record）。 */
export const resumeNotebookSession = async (
  sessionId: string,
): Promise<boolean> => {
  try {
    const response = await httpClient.request({
      url: `/notebook-agent/sessions/${sessionId}/resume`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      data: {},
    })
    return isSuccessStatus(response.status)
  } catch {
    return false
  }
}
