import type {
  JsTransformAgentSafeDebugResult,
  JsTransformAgentSessionRequest,
} from '@/ai/types'
import { fetchWithWorkflowContext } from '@/services/workflowRequestContext'

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

export const createJsTransformAgentSession = async (
  request: JsTransformAgentSessionRequest,
): Promise<JsTransformAgentSessionCreateResponse> => {
  const response = await fetchWithWorkflowContext('/api/pi-agent/js-transform/sessions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  })

  return await readJsonOrThrow<JsTransformAgentSessionCreateResponse>(response, '创建 JS 节点 AI 会话失败')
}

export const sendJsTransformAgentMessage = async (
  sessionId: string,
  content: string,
): Promise<JsTransformAgentSendMessageResponse> => {
  const response = await fetchWithWorkflowContext(`/api/pi-agent/js-transform/sessions/${sessionId}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ content }),
  })

  return await readJsonOrThrow<JsTransformAgentSendMessageResponse>(response, '发送 JS 节点 AI 消息失败')
}

export const updateJsTransformAgentMode = async (
  sessionId: string,
  mode: 'ask' | 'agent',
) => {
  const response = await fetchWithWorkflowContext(`/api/pi-agent/js-transform/sessions/${sessionId}/mode`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ mode }),
  })

  return await readJsonOrThrow<{ ok: boolean }>(response, '切换 JS 节点 AI 模式失败')
}

export const streamJsTransformAgentEvents = async (
  sessionId: string,
  options: { onEvent?: (event: any) => void } = {},
) => {
  const response = await fetchWithWorkflowContext(`/api/pi-agent/js-transform/sessions/${sessionId}/events`)
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}))
    const message =
      typeof payload === 'object' && payload && 'message' in payload && typeof payload.message === 'string'
        ? payload.message
        : '读取 JS 节点 AI 事件流失败'
    throw new Error(message)
  }

  if (!response.body) {
    throw new Error('JS 节点 AI 事件流不可用')
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

export const resolveJsTransformAgentToolResult = async (
  sessionId: string,
  toolCallId: string,
  result: {
    content: Array<{ type: 'text'; text: string }>
    details: JsTransformAgentSafeDebugResult
    isError?: boolean
  },
) => {
  const response = await fetchWithWorkflowContext(`/api/pi-agent/js-transform/sessions/${sessionId}/tool-result`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ toolCallId, result }),
  })

  return await readJsonOrThrow<{ ok: boolean }>(response, '发送 JS 节点 AI 工具执行结果失败')
}
