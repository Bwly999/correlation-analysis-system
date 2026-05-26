import { buildWorkflowAiNodeCatalog } from '@/ai/catalog'
import { httpClient, requestStream } from '@/services/httpClient'
import type {
  WorkflowAiSessionState,
  WorkflowAiGenerationDiagnostics,
  WorkflowAiModelProfile,
  WorkflowAiModelTestResult,
  WorkflowAiPlan,
  WorkflowAiPlanRequest,
  WorkflowAiPlanResponse,
  WorkflowAiSessionInputRequest,
  WorkflowAiSessionInputResponse,
  WorkflowAiSessionGetResponse,
  WorkflowAiSessionRunResponse,
  WorkflowAiSessionStartResponse,
  WorkflowAiStreamEvent,
} from '@/ai/types'

type WorkflowAiErrorPayload = {
  message?: string
  diagnostics?: WorkflowAiGenerationDiagnostics
}

type StreamWorkflowAiPlanOptions = {
  onEvent?: (event: WorkflowAiStreamEvent) => void
}

export class WorkflowAiRequestError extends Error {
  diagnostics?: WorkflowAiGenerationDiagnostics
  statusCode?: number

  constructor(message: string, diagnostics?: WorkflowAiGenerationDiagnostics, statusCode?: number) {
    super(message)
    this.name = 'WorkflowAiRequestError'
    this.diagnostics = diagnostics
    this.statusCode = statusCode
  }
}

const isSuccessStatus = (status: number) => status >= 200 && status < 300

const readResponsePayload = <T>(response: { data: unknown }): T => (response.data ?? {}) as T

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

const readStreamPayload = async <T>(stream: ReadableStream<unknown> | null): Promise<T> => {
  const buffer = await readStreamText(stream)
  const text = buffer.trim()
  if (!text) return {} as T

  return JSON.parse(text) as T
}

const parseNdjsonLine = (line: string): WorkflowAiStreamEvent | null => {
  const normalized = line.trim()
  if (!normalized) return null
  return JSON.parse(normalized) as WorkflowAiStreamEvent
}

export const requestWorkflowAiPlan = async (request: WorkflowAiPlanRequest) => {
  if (!request.profile.enabled) {
    throw new Error('当前模型配置不可用，请先检查模型设置')
  }

  const response = await httpClient.request({
    url: '/workflow-ai/plan',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    data: {
      ...request,
      nodeCatalog: request.nodeCatalog?.length ? request.nodeCatalog : buildWorkflowAiNodeCatalog(),
    },
  })

  const payload = readResponsePayload<WorkflowAiPlanResponse & WorkflowAiErrorPayload>(response)

  if (!isSuccessStatus(response.status)) {
    throw new WorkflowAiRequestError(
      payload.message || '生成 AI 计划失败',
      payload.diagnostics,
      response.status,
    )
  }

  return payload as WorkflowAiPlanResponse
}

export const streamWorkflowAiPlan = async (
  request: WorkflowAiPlanRequest,
  options: StreamWorkflowAiPlanOptions = {},
): Promise<WorkflowAiPlanResponse> => {
  if (!request.profile.enabled) {
    throw new Error('当前模型配置不可用，请先检查模型设置')
  }

  const response = await requestStream({
    url: '/workflow-ai/plan/stream',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    data: {
      ...request,
      nodeCatalog: request.nodeCatalog?.length ? request.nodeCatalog : buildWorkflowAiNodeCatalog(),
    },
  })

  if (!isSuccessStatus(response.status)) {
    const payload = await readStreamPayload<WorkflowAiErrorPayload>(response.data)
    throw new WorkflowAiRequestError(
      payload.message || '生成 AI 计划失败',
      payload.diagnostics,
      response.status,
    )
  }

  if (!response.data) {
    throw new Error('AI 流式响应不可用')
  }

  const reader = response.data.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let completedPayload: WorkflowAiPlanResponse | null = null
  let failedPayload: { message: string; diagnostics?: WorkflowAiGenerationDiagnostics } | null = null

  while (true) {
    const { value, done } = await reader.read()
    if (done) break

    buffer += decodeStreamChunk(decoder, value)
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      const event = parseNdjsonLine(line)
      if (!event) continue
      options.onEvent?.(event)

      if (event.type === 'completed') {
        completedPayload = {
          plan: event.plan as WorkflowAiPlan,
          diagnostics: event.diagnostics,
        }
      }

      if (event.type === 'failed') {
        failedPayload = {
          message: event.message,
          diagnostics: event.diagnostics,
        }
      }
    }
  }

  buffer += decoder.decode()
  const lastEvent = parseNdjsonLine(buffer)
  if (lastEvent) {
    options.onEvent?.(lastEvent)
    if (lastEvent.type === 'completed') {
      completedPayload = {
        plan: lastEvent.plan as WorkflowAiPlan,
        diagnostics: lastEvent.diagnostics,
      }
    }
    if (lastEvent.type === 'failed') {
      failedPayload = {
        message: lastEvent.message,
        diagnostics: lastEvent.diagnostics,
      }
    }
  }

  if (completedPayload) {
    return completedPayload
  }

  if (failedPayload) {
    throw new WorkflowAiRequestError(failedPayload.message, failedPayload.diagnostics, response.status)
  }

  throw new Error('AI 流式响应提前结束，未返回最终结果')
}

export const startWorkflowAiSession = async (
  request: WorkflowAiPlanRequest,
): Promise<WorkflowAiSessionStartResponse> => {
  const response = await httpClient.request({
    url: '/workflow-ai/session/start',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    data: {
      ...request,
      nodeCatalog: request.nodeCatalog?.length ? request.nodeCatalog : buildWorkflowAiNodeCatalog(),
    },
  })

  const payload = readResponsePayload<WorkflowAiSessionStartResponse & WorkflowAiErrorPayload>(response)
  if (!isSuccessStatus(response.status)) {
    throw new WorkflowAiRequestError(
      payload.message || '启动 AI 编排会话失败',
      payload.diagnostics,
      response.status,
    )
  }

  return payload
}

export const runWorkflowAiSession = async (
  sessionId: string,
  options: StreamWorkflowAiPlanOptions = {},
): Promise<WorkflowAiSessionRunResponse> => {
  const response = await requestStream({
    url: `/workflow-ai/session/${sessionId}/run`,
    method: 'POST',
  })

  if (!isSuccessStatus(response.status)) {
    const payload = await readStreamPayload<WorkflowAiErrorPayload>(response.data)
    throw new WorkflowAiRequestError(
      payload.message || '运行 AI 编排会话失败',
      payload.diagnostics,
      response.status,
    )
  }

  if (!response.data) {
    throw new Error('AI 会话流式响应不可用')
  }

  const reader = response.data.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let completedPayload: WorkflowAiSessionRunResponse | null = null
  let failedPayload: { message: string; diagnostics?: WorkflowAiGenerationDiagnostics } | null = null

  while (true) {
    const { value, done } = await reader.read()
    if (done) break

    buffer += decodeStreamChunk(decoder, value)
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      const event = parseNdjsonLine(line)
      if (!event) continue
      options.onEvent?.(event)

      if (event.type === 'completed' && event.draft) {
        completedPayload = {
          plan: event.plan as WorkflowAiPlan,
          draft: event.draft,
          diagnostics: event.diagnostics,
        }
      }

      if (event.type === 'failed') {
        failedPayload = {
          message: event.message,
          diagnostics: event.diagnostics,
        }
      }
    }
  }

  buffer += decoder.decode()
  const lastEvent = parseNdjsonLine(buffer)
  if (lastEvent) {
    options.onEvent?.(lastEvent)
    if (lastEvent.type === 'completed' && lastEvent.draft) {
      completedPayload = {
        plan: lastEvent.plan as WorkflowAiPlan,
        draft: lastEvent.draft,
        diagnostics: lastEvent.diagnostics,
      }
    }
    if (lastEvent.type === 'failed') {
      failedPayload = {
        message: lastEvent.message,
        diagnostics: lastEvent.diagnostics,
      }
    }
  }

  if (completedPayload) {
    return completedPayload
  }

  if (failedPayload) {
    throw new WorkflowAiRequestError(failedPayload.message, failedPayload.diagnostics, response.status)
  }

  throw new Error('AI 会话流式响应提前结束，未返回最终结果')
}

export const getWorkflowAiSession = async (
  sessionId: string,
): Promise<WorkflowAiSessionGetResponse> => {
  const response = await httpClient.request({
    url: `/workflow-ai/session/${sessionId}`,
    method: 'GET',
  })
  const payload = readResponsePayload<WorkflowAiSessionGetResponse & WorkflowAiErrorPayload>(response)

  if (!isSuccessStatus(response.status)) {
    throw new WorkflowAiRequestError(
      payload.message || '读取 AI 编排会话失败',
      payload.diagnostics,
      response.status,
    )
  }

  return payload
}

export const submitWorkflowAiSessionInput = async (
  sessionId: string,
  request: WorkflowAiSessionInputRequest,
): Promise<WorkflowAiSessionInputResponse> => {
  const response = await httpClient.request({
    url: `/workflow-ai/session/${sessionId}/input`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    data: request,
  })
  const payload = readResponsePayload<WorkflowAiSessionInputResponse & WorkflowAiErrorPayload>(response)

  if (!isSuccessStatus(response.status)) {
    throw new WorkflowAiRequestError(
      payload.message || '提交 AI 编排补充信息失败',
      payload.diagnostics,
      response.status,
    )
  }

  return payload
}

export const fetchSystemModelProfiles = async (): Promise<WorkflowAiModelProfile[]> => {
  const response = await httpClient.request({
    url: '/workflow-ai/model-profiles',
    method: 'GET',
  })
  const payload = readResponsePayload<{ profiles?: WorkflowAiModelProfile[] } & WorkflowAiErrorPayload>(response)
  if (!isSuccessStatus(response.status)) {
    throw new Error(payload.message || '加载系统模型配置失败')
  }
  const data = payload as { profiles?: WorkflowAiModelProfile[] }
  return data.profiles ?? []
}

export const testWorkflowAiModelProfile = async (
  profile: WorkflowAiModelProfile,
): Promise<WorkflowAiModelTestResult> => {
  const response = await httpClient.request({
    url: '/workflow-ai/model-profiles/test',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    data: { profile },
  })

  const data = readResponsePayload<WorkflowAiModelTestResult & { message?: string }>(response)
  if (!isSuccessStatus(response.status)) {
    throw new Error(data.message || '模型配置测试失败')
  }

  return data
}
