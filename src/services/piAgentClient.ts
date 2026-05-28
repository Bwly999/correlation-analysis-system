import type {
  PiAgentSafeToolResult,
  PiAgentCanvasSyncResponse,
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

export type PiAgentSessionToolCallDto = {
  id: string
  toolName: string
  displayName: string
  args: unknown
  status: 'running' | 'success' | 'failed'
  result?: string
  isError?: boolean
}

export type PiAgentSessionMessageDto = {
  id: string
  role: 'user' | 'assistant'
  visibility: 'user' | 'assistant_visible' | 'assistant_debug'
  content: string
  rawContent?: string
  thinking?: string
  status: 'streaming' | 'completed'
  createdAt: number
  toolCalls?: PiAgentSessionToolCallDto[]
}

export type PiAgentSessionDetailResponse = {
  sessionId: string
  status: 'idle' | 'running' | 'completed' | 'failed' | 'interrupted'
  activeTurnState: 'responding' | 'tooling' | 'idle' | 'interrupted' | 'failed'
  lastTurnEndedEarly: boolean
  lastStopReason: 'normal' | 'read_only_observation_end' | 'interrupted' | 'failed'
  lastMessageRole: 'assistant' | 'toolResult' | 'user' | 'unknown'
  endedWithToolResult: boolean
  lastResumeTrigger: 'prompt' | 'continue' | 'followUp' | 'steer' | 'none'
  lastObservedToolName?: string
  lastAssistantMessageText?: string
  pendingFollowUps: string[]
  mode: string
  prompt: string
  messages: PiAgentSessionMessageDto[]
  toolCalls: PiAgentSessionToolCallDto[]
  updatedAt: number
  createdAt: number
  sessionFile?: string
} | null

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
): Promise<PiAgentCanvasSyncResponse> => {
  const response = await httpClient.request({
    url: `/pi-agent/sessions/${sessionId}/canvas-sync`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    data: { workflowSnapshot },
  })

  return readJsonOrThrow<PiAgentCanvasSyncResponse>(response, '同步 Pi Agent 画布失败')
}

export const streamPiAgentEvents = async (
  sessionId: string,
  options: { onOpen?: () => void; onEvent?: (event: any) => void; signal?: AbortSignal } = {},
) => {
  const startTime = Date.now()
  console.log(`[piAgentClient] streamPiAgentEvents start session=${sessionId} at ${new Date().toISOString()}`)
  const response = await requestStream({
    url: `/pi-agent/sessions/${sessionId}/events`,
    method: 'GET',
    signal: options.signal,
  })
  console.log(`[piAgentClient] stream response status=${response.status} headers=${JSON.stringify(response.headers)}`)

  if (!isSuccessStatus(response.status)) {
    const payload = await readStreamPayload(response.data)
    const message =
      typeof payload === 'object' && payload && 'message' in payload && typeof payload.message === 'string'
        ? payload.message
        : '读取 Pi Agent 事件流失败'
    console.error(`[piAgentClient] stream error status=${response.status} message=${message} payload=${JSON.stringify(payload)}`)
    throw new Error(message)
  }

  if (!response.data) {
    console.error(`[piAgentClient] stream data is null after ${Date.now() - startTime}ms`)
    throw new Error('Pi Agent 事件流不可用')
  }

  options.onOpen?.()
  console.log(`[piAgentClient] stream opened after ${Date.now() - startTime}ms, reader type=${response.data.constructor?.name}`)

  const reader = response.data.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let chunkCount = 0

  while (true) {
    let result: ReadableStreamReadResult<unknown>
    try {
      result = await reader.read()
    } catch (err: any) {
      console.error(`[piAgentClient] stream read error after ${Date.now() - startTime}ms:`, err.message)
      throw err
    }
    const { value, done } = result
    if (done) {
      console.log(`[piAgentClient] stream reader done after ${Date.now() - startTime}ms, totalChunks=${chunkCount}`)
      break
    }

    chunkCount++
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
  console.log(`[piAgentClient] streamPiAgentEvents complete session=${sessionId} duration=${Date.now() - startTime}ms`)
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

export const reportPiAgentToolProgress = async (
  sessionId: string,
  toolCallId: string,
) => {
  const response = await httpClient.request({
    url: `/pi-agent/sessions/${sessionId}/tool-progress`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    data: { toolCallId },
  })

  return readJsonOrThrow<{ ok: boolean }>(response, '续期 Pi Agent 工具执行失败')
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

