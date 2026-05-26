import type {
  AgentObservabilityDebugFilesResponse,
  AgentObservabilityDebugHealth,
  AgentObservabilityDebugReplayResponse,
  AgentObservabilityDebugTraceResponse,
  AgentSessionCanvasSyncResponse,
  PiAgentSafeToolResult,
  WorkflowAiPlanRequest,
} from '@/ai/types'
import { httpClient, requestStream } from '@/services/httpClient'

type ResponseLike = {
  status: number
  data: unknown
}

type PiAgentSessionCreateResponse = {
  sessionId: string
  status: string
  mode: string
  prompt: string
}

type PiAgentSendMessageResponse = {
  ok: boolean
  error?: string
}

type PiAgentSessionDetailResponse = Record<string, unknown> | null

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

export const createPiAgentSession = async (
  request: WorkflowAiPlanRequest,
): Promise<PiAgentSessionCreateResponse> => {
  const response = await httpClient.request({
    url: '/pi-agent/sessions',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    data: request,
  })

  return readJsonOrThrow<PiAgentSessionCreateResponse>(response, '创建 Pi Agent 会话失败')
}

export const sendPiAgentMessage = async (
  sessionId: string,
  content: string,
): Promise<PiAgentSendMessageResponse> => {
  const response = await httpClient.request({
    url: `/pi-agent/sessions/${sessionId}/messages`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    data: { content },
  })

  return readJsonOrThrow<PiAgentSendMessageResponse>(response, '发送 Pi Agent 消息失败')
}

export const syncPiAgentCanvas = async (
  sessionId: string,
  workflowSnapshot: {
    name: string
    nodes: unknown[]
    edges: unknown[]
  },
): Promise<AgentSessionCanvasSyncResponse> => {
  const response = await httpClient.request({
    url: `/pi-agent/sessions/${sessionId}/canvas-sync`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    data: { workflowSnapshot },
  })

  return readJsonOrThrow<AgentSessionCanvasSyncResponse>(response, '同步 Pi Agent 画布失败')
}

export const streamPiAgentEvents = async (
  sessionId: string,
  options: { onEvent?: (event: any) => void } = {},
) => {
  const response = await requestStream({
    url: `/pi-agent/sessions/${sessionId}/events`,
    method: 'GET',
  })
  if (!isSuccessStatus(response.status)) {
    const payload = await readStreamPayload(response.data)
    const message =
      typeof payload === 'object' && payload && 'message' in payload && typeof payload.message === 'string'
        ? payload.message
        : '读取 Pi Agent 事件流失败'
    throw new Error(message)
  }

  if (!response.data) {
    throw new Error('Pi Agent 事件流不可用')
  }

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

export const getPiAgentSession = async (
  sessionId: string,
): Promise<PiAgentSessionDetailResponse> => {
  const response = await httpClient.request({
    url: `/pi-agent/sessions/${sessionId}`,
    method: 'GET',
  })
  return readJsonOrThrow<PiAgentSessionDetailResponse>(response, '读取 Pi Agent 会话失败')
}

export const resolvePiAgentToolResult = async (
  sessionId: string,
  toolCallId: string,
  result: {
    content: Array<{ type: 'text'; text: string }>
    details: PiAgentSafeToolResult
    isError?: boolean
  },
) => {
  const response = await httpClient.request({
    url: `/pi-agent/sessions/${sessionId}/tool-result`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    data: { toolCallId, result },
  })

  return readJsonOrThrow<{ ok: boolean }>(response, '发送 Pi Agent 工具执行结果失败')
}

export const getPiAgentObservabilityDebugTrace = async (
  sessionId: string,
  options: { limit?: number; offset?: number } = {},
): Promise<AgentObservabilityDebugTraceResponse> => {
  const search = new URLSearchParams()
  if (options.limit !== undefined) search.set('limit', String(options.limit))
  if (options.offset !== undefined) search.set('offset', String(options.offset))
  const suffix = search.size ? `?${search.toString()}` : ''
  const response = await httpClient.request({
    url: `/pi-agent/sessions/${sessionId}/debug-trace${suffix}`,
    method: 'GET',
  })
  return readJsonOrThrow<AgentObservabilityDebugTraceResponse>(response, '读取 Pi Agent 调试 Trace 失败')
}

export const getPiAgentObservabilityDebugReplay = async (
  sessionId: string,
  seq?: number,
): Promise<AgentObservabilityDebugReplayResponse> => {
  const suffix = seq === undefined ? '' : `?seq=${encodeURIComponent(String(seq))}`
  const response = await httpClient.request({
    url: `/pi-agent/sessions/${sessionId}/debug-trace/replay${suffix}`,
    method: 'GET',
  })
  return readJsonOrThrow<AgentObservabilityDebugReplayResponse>(response, '读取 Pi Agent 调试回放失败')
}

export const getPiAgentObservabilityDebugFiles = async (
  sessionId: string,
): Promise<AgentObservabilityDebugFilesResponse> => {
  const response = await httpClient.request({
    url: `/pi-agent/sessions/${sessionId}/debug-trace/files`,
    method: 'GET',
  })
  return readJsonOrThrow<AgentObservabilityDebugFilesResponse>(response, '读取 Pi Agent 调试日志文件失败')
}

export const getPiAgentObservabilityDebugHealth = async (): Promise<AgentObservabilityDebugHealth> => {
  const response = await httpClient.request({
    url: '/pi-agent/debug/health',
    method: 'GET',
  })
  return readJsonOrThrow<AgentObservabilityDebugHealth>(response, '读取 Pi Agent 调试健康状态失败')
}
