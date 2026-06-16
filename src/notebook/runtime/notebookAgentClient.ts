import { httpClient, requestStream } from '@/services/httpClient'

export type NotebookAgentEvent =
  | { type: 'stream.ready' }
  | { type: 'stream.heartbeat' }
  | { type: 'session.status'; sessionId: string; status: string }
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
