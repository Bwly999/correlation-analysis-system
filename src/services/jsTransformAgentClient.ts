import type {
  JsTransformAgentSafeDebugResult,
  JsTransformAgentSessionRequest,
} from '@/ai/types'
import { httpClient, requestStream } from '@/services/httpClient'

type ResponseLike = {
  status: number
  data: unknown
}

type JsTransformAgentSessionCreateResponse = {
  sessionId: string
  status: string
  mode: string
  prompt: string
}

type JsTransformAgentSendMessageResponse = {
  ok: boolean
  error?: string
}

type JsTransformAgentAbortResponse = {
  ok: boolean
  restoredMessages: string[]
  error?: string
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

const readJsonOrThrow = <T>(response: ResponseLike, fallbackMessage: string): T => {
  const payload = response.data
  if (!isSuccessStatus(response.status)) {
    const message =
      typeof payload === 'object' && payload && 'message' in payload && typeof payload.message === 'string'
        ? payload.message
        : fallbackMessage
    throw new Error(message)
  }
  return payload as T
}

const readStreamPayload = async (stream: ReadableStream<unknown> | null): Promise<unknown> => {
  const buffer = (await readStreamText(stream)).trim()
  const text = buffer.trim()
  if (!text) return {}

  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

export const createJsTransformAgentSession = async (
  request: JsTransformAgentSessionRequest,
): Promise<JsTransformAgentSessionCreateResponse> => {
  const response = await httpClient.request({
    url: '/js-transform-agent/sessions',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    data: request,
  })

  return readJsonOrThrow<JsTransformAgentSessionCreateResponse>(response, '创建 JS 节点 AI 会话失败')
}

export const sendJsTransformAgentMessage = async (
  sessionId: string,
  content: string,
): Promise<JsTransformAgentSendMessageResponse> => {
  const response = await httpClient.request({
    url: `/js-transform-agent/sessions/${sessionId}/messages`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    data: { content },
  })

  return readJsonOrThrow<JsTransformAgentSendMessageResponse>(response, '发送 JS 节点 AI 消息失败')
}

export const updateJsTransformAgentMode = async (
  sessionId: string,
  mode: 'ask' | 'agent',
) => {
  const response = await httpClient.request({
    url: `/js-transform-agent/sessions/${sessionId}/mode`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    data: { mode },
  })

  return readJsonOrThrow<{ ok: boolean }>(response, '切换 JS 节点 AI 模式失败')
}

export const abortJsTransformAgentRun = async (
  sessionId: string,
): Promise<JsTransformAgentAbortResponse> => {
  const response = await httpClient.request({
    url: `/js-transform-agent/sessions/${sessionId}/abort`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
  })

  return readJsonOrThrow<JsTransformAgentAbortResponse>(response, '取消 JS 节点 AI 执行失败')
}

export const streamJsTransformAgentEvents = async (
  sessionId: string,
  options: { onOpen?: () => void; onEvent?: (event: any) => void; signal?: AbortSignal } = {},
) => {
  const response = await requestStream({
    url: `/js-transform-agent/sessions/${sessionId}/events`,
    method: 'GET',
    signal: options.signal,
  })
  if (!isSuccessStatus(response.status)) {
    const payload = await readStreamPayload(response.data)
    const message =
      typeof payload === 'object' && payload && 'message' in payload && typeof payload.message === 'string'
        ? payload.message
        : '读取 JS 节点 AI 事件流失败'
    throw new Error(message)
  }

  if (!response.data) {
    throw new Error('JS 节点 AI 事件流不可用')
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
      options.onEvent?.(JSON.parse(trimmed))
    }
  }

  buffer += decoder.decode()
  const trailing = buffer.trim()
  if (trailing) {
    options.onEvent?.(JSON.parse(trailing))
  }
}

export const reportJsTransformAgentToolProgress = async (
  sessionId: string,
  toolCallId: string,
) => {
  const response = await httpClient.request({
    url: `/js-transform-agent/sessions/${sessionId}/tool-progress`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    data: { toolCallId },
  })

  return readJsonOrThrow<{ ok: boolean }>(response, '续期 JS 节点 AI 工具执行失败')
}

export const resolveJsTransformAgentToolResult = async (
  sessionId: string,
  toolCallId: string,
  result: {
    content: Array<{ type: 'text'; text: string }>
    details: JsTransformAgentSafeDebugResult
    isError?: boolean
  },
) => {
  const response = await httpClient.request({
    url: `/js-transform-agent/sessions/${sessionId}/tool-result`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    data: { toolCallId, result },
  })

  return readJsonOrThrow<{ ok: boolean }>(response, '发送 JS 节点 AI 工具执行结果失败')
}
