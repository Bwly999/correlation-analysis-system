import type {
  AgentObservabilityDebugFilesResponse,
  AgentObservabilityDebugHealth,
  AgentObservabilityDebugReplayResponse,
  AgentObservabilityDebugTraceResponse,
  AgentSessionCanvasSyncResponse,
  PiAgentSafeToolResult,
  WorkflowAiPlanRequest,
} from '@/ai/types'
import { fetchWithWorkflowContext } from '@/services/workflowRequestContext'

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

const readJsonOrThrow = async <T>(response: Response, fallbackMessage: string): Promise<T> => {
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    const message =
      typeof payload === 'object' && payload && 'message' in payload && typeof payload.message === 'string'
        ? payload.message
        : fallbackMessage
    throw new Error(message)
  }
  return payload as T
}

export const createPiAgentSession = async (
  request: WorkflowAiPlanRequest,
): Promise<PiAgentSessionCreateResponse> => {
  const response = await fetchWithWorkflowContext('/api/pi-agent/sessions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  })

  return await readJsonOrThrow<PiAgentSessionCreateResponse>(response, '创建 Pi Agent 会话失败')
}

export const sendPiAgentMessage = async (
  sessionId: string,
  content: string,
): Promise<PiAgentSendMessageResponse> => {
  const response = await fetchWithWorkflowContext(`/api/pi-agent/sessions/${sessionId}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ content }),
  })

  return await readJsonOrThrow<PiAgentSendMessageResponse>(response, '发送 Pi Agent 消息失败')
}

export const syncPiAgentCanvas = async (
  sessionId: string,
  workflowSnapshot: {
    name: string
    nodes: unknown[]
    edges: unknown[]
  },
): Promise<AgentSessionCanvasSyncResponse> => {
  const response = await fetchWithWorkflowContext(`/api/pi-agent/sessions/${sessionId}/canvas-sync`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ workflowSnapshot }),
  })

  return await readJsonOrThrow<AgentSessionCanvasSyncResponse>(response, '同步 Pi Agent 画布失败')
}

export const streamPiAgentEvents = async (
  sessionId: string,
  options: { onEvent?: (event: any) => void } = {},
) => {
  const response = await fetchWithWorkflowContext(`/api/pi-agent/sessions/${sessionId}/events`)
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}))
    const message =
      typeof payload === 'object' && payload && 'message' in payload && typeof payload.message === 'string'
        ? payload.message
        : '读取 Pi Agent 事件流失败'
    throw new Error(message)
  }

  if (!response.body) {
    throw new Error('Pi Agent 事件流不可用')
  }

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()
  let buffer = ''

  while (true) {
    const { value, done } = await reader.read()
    if (done) break

    buffer += value
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue
      options.onEvent?.(JSON.parse(trimmed))
    }
  }

  const trailing = buffer.trim()
  if (trailing) {
    options.onEvent?.(JSON.parse(trailing))
  }
}

export const getPiAgentSession = async (
  sessionId: string,
): Promise<PiAgentSessionDetailResponse> => {
  const response = await fetchWithWorkflowContext(`/api/pi-agent/sessions/${sessionId}`)
  return await readJsonOrThrow<PiAgentSessionDetailResponse>(response, '读取 Pi Agent 会话失败')
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
  const response = await fetchWithWorkflowContext(`/api/pi-agent/sessions/${sessionId}/tool-result`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ toolCallId, result }),
  })

  return await readJsonOrThrow<{ ok: boolean }>(response, '发送 Pi Agent 工具执行结果失败')
}

export const getPiAgentObservabilityDebugTrace = async (
  sessionId: string,
  options: { limit?: number; offset?: number } = {},
): Promise<AgentObservabilityDebugTraceResponse> => {
  const search = new URLSearchParams()
  if (options.limit !== undefined) search.set('limit', String(options.limit))
  if (options.offset !== undefined) search.set('offset', String(options.offset))
  const suffix = search.size ? `?${search.toString()}` : ''
  const response = await fetchWithWorkflowContext(`/api/pi-agent/sessions/${sessionId}/debug-trace${suffix}`)
  return await readJsonOrThrow<AgentObservabilityDebugTraceResponse>(response, '读取 Pi Agent 调试 Trace 失败')
}

export const getPiAgentObservabilityDebugReplay = async (
  sessionId: string,
  seq?: number,
): Promise<AgentObservabilityDebugReplayResponse> => {
  const suffix = seq === undefined ? '' : `?seq=${encodeURIComponent(String(seq))}`
  const response = await fetchWithWorkflowContext(`/api/pi-agent/sessions/${sessionId}/debug-trace/replay${suffix}`)
  return await readJsonOrThrow<AgentObservabilityDebugReplayResponse>(response, '读取 Pi Agent 调试回放失败')
}

export const getPiAgentObservabilityDebugFiles = async (
  sessionId: string,
): Promise<AgentObservabilityDebugFilesResponse> => {
  const response = await fetchWithWorkflowContext(`/api/pi-agent/sessions/${sessionId}/debug-trace/files`)
  return await readJsonOrThrow<AgentObservabilityDebugFilesResponse>(response, '读取 Pi Agent 调试日志文件失败')
}

export const getPiAgentObservabilityDebugHealth = async (): Promise<AgentObservabilityDebugHealth> => {
  const response = await fetchWithWorkflowContext('/api/pi-agent/debug/health')
  return await readJsonOrThrow<AgentObservabilityDebugHealth>(response, '读取 Pi Agent 调试健康状态失败')
}
