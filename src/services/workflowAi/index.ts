import { buildWorkflowAiNodeCatalog } from '@/ai/catalog'
import type {
  AgentSessionCanvasSyncRequest,
  AgentSessionCanvasSyncResponse,
  AgentSessionEvent,
  AgentSessionGetResponse,
  AgentSessionMessageRequest,
  AgentSessionMessageResponse,
  AgentSessionStartResponse,
  AgentProjectionSnapshot,
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

const WORKFLOW_AI_API_BASE_URL = import.meta.env.VITE_WORKFLOW_AI_API_BASE_URL || '/api'

type WorkflowAiErrorPayload = {
  message?: string
  diagnostics?: WorkflowAiGenerationDiagnostics
}

type StreamWorkflowAiPlanOptions = {
  onEvent?: (event: WorkflowAiStreamEvent) => void
}

type AgentSessionStreamOptions = {
  onEvent?: (event: AgentSessionEvent) => void
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

const readResponsePayload = async (response: Response): Promise<WorkflowAiErrorPayload> => {
  try {
    return (await response.json()) as WorkflowAiErrorPayload
  } catch {
    return {}
  }
}

const parseNdjsonLine = (line: string): WorkflowAiStreamEvent | null => {
  const normalized = line.trim()
  if (!normalized) return null
  return JSON.parse(normalized) as WorkflowAiStreamEvent
}

const parseAgentNdjsonLine = (line: string): AgentSessionEvent | null => {
  const normalized = line.trim()
  if (!normalized) return null
  return JSON.parse(normalized) as AgentSessionEvent
}

export const requestWorkflowAiPlan = async (request: WorkflowAiPlanRequest) => {
  if (!request.profile.enabled) {
    throw new Error('当前模型配置不可用，请先检查模型设置')
  }

  const response = await fetch(`${WORKFLOW_AI_API_BASE_URL}/workflow-ai/plan`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ...request,
      nodeCatalog: request.nodeCatalog?.length ? request.nodeCatalog : buildWorkflowAiNodeCatalog(),
    }),
  })

  const payload = (await readResponsePayload(response)) as WorkflowAiPlanResponse & WorkflowAiErrorPayload

  if (!response.ok) {
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

  const response = await fetch(`${WORKFLOW_AI_API_BASE_URL}/workflow-ai/plan/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ...request,
      nodeCatalog: request.nodeCatalog?.length ? request.nodeCatalog : buildWorkflowAiNodeCatalog(),
    }),
  })

  if (!response.ok) {
    const payload = await readResponsePayload(response)
    throw new WorkflowAiRequestError(
      payload.message || '生成 AI 计划失败',
      payload.diagnostics,
      response.status,
    )
  }

  if (!response.body) {
    throw new Error('AI 流式响应不可用')
  }

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()
  let buffer = ''
  let completedPayload: WorkflowAiPlanResponse | null = null
  let failedPayload: { message: string; diagnostics?: WorkflowAiGenerationDiagnostics } | null = null

  while (true) {
    const { value, done } = await reader.read()
    if (done) break

    buffer += value
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
  const response = await fetch(`${WORKFLOW_AI_API_BASE_URL}/workflow-ai/session/start`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ...request,
      nodeCatalog: request.nodeCatalog?.length ? request.nodeCatalog : buildWorkflowAiNodeCatalog(),
    }),
  })

  const payload = (await readResponsePayload(response)) as WorkflowAiSessionStartResponse & WorkflowAiErrorPayload
  if (!response.ok) {
    throw new WorkflowAiRequestError(
      payload.message || '启动 AI 编排会话失败',
      payload.diagnostics,
      response.status,
    )
  }

  return payload
}

export const createAgentSession = async (
  request: WorkflowAiPlanRequest,
): Promise<AgentSessionStartResponse> => {
  const response = await fetch(`${WORKFLOW_AI_API_BASE_URL}/agent/sessions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ...request,
      nodeCatalog: request.nodeCatalog?.length ? request.nodeCatalog : buildWorkflowAiNodeCatalog(),
    }),
  })

  const payload = (await readResponsePayload(response)) as AgentSessionStartResponse & WorkflowAiErrorPayload
  if (!response.ok) {
    throw new WorkflowAiRequestError(
      payload.message || '创建 Agent 会话失败',
      payload.diagnostics,
      response.status,
    )
  }

  return payload
}

export const sendAgentSessionMessage = async (
  sessionId: string,
  request: AgentSessionMessageRequest,
): Promise<AgentSessionMessageResponse> => {
  const response = await fetch(`${WORKFLOW_AI_API_BASE_URL}/agent/sessions/${sessionId}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  })

  const payload = (await readResponsePayload(response)) as AgentSessionMessageResponse & WorkflowAiErrorPayload
  if (!response.ok) {
    throw new WorkflowAiRequestError(
      payload.message || '发送 Agent 消息失败',
      payload.diagnostics,
      response.status,
    )
  }

  return payload
}

export const streamAgentSessionEvents = async (
  sessionId: string,
  options: AgentSessionStreamOptions = {},
) => {
  const response = await fetch(`${WORKFLOW_AI_API_BASE_URL}/agent/sessions/${sessionId}/events`)
  if (!response.ok) {
    const payload = await readResponsePayload(response)
    throw new WorkflowAiRequestError(
      payload.message || '读取 Agent 事件流失败',
      payload.diagnostics,
      response.status,
    )
  }

  if (!response.body) {
    throw new Error('Agent 事件流不可用')
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
      const event = parseAgentNdjsonLine(line)
      if (!event) continue
      options.onEvent?.(event)
    }
  }

  const lastEvent = parseAgentNdjsonLine(buffer)
  if (lastEvent) {
    options.onEvent?.(lastEvent)
  }
}

export const getAgentSession = async (
  sessionId: string,
): Promise<AgentSessionGetResponse> => {
  const response = await fetch(`${WORKFLOW_AI_API_BASE_URL}/agent/sessions/${sessionId}`)
  const payload = (await readResponsePayload(response)) as AgentSessionGetResponse & WorkflowAiErrorPayload

  if (!response.ok) {
    throw new WorkflowAiRequestError(
      payload.message || '读取 Agent 会话失败',
      payload.diagnostics,
      response.status,
    )
  }

  return payload
}

export const getAgentProjection = async (sessionId: string): Promise<AgentProjectionSnapshot> => {
  const response = await fetch(`${WORKFLOW_AI_API_BASE_URL}/agent/sessions/${sessionId}/projection`)
  const payload = (await readResponsePayload(response)) as { projection: AgentProjectionSnapshot } & WorkflowAiErrorPayload

  if (!response.ok) {
    throw new WorkflowAiRequestError(
      payload.message || '读取 Agent 投影失败',
      payload.diagnostics,
      response.status,
    )
  }

  return payload.projection
}

export const syncAgentCanvas = async (
  sessionId: string,
  request: AgentSessionCanvasSyncRequest,
): Promise<AgentSessionCanvasSyncResponse> => {
  const response = await fetch(`${WORKFLOW_AI_API_BASE_URL}/agent/sessions/${sessionId}/canvas-sync`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  })
  const payload = (await readResponsePayload(response)) as AgentSessionCanvasSyncResponse & WorkflowAiErrorPayload

  if (!response.ok) {
    throw new WorkflowAiRequestError(
      payload.message || '同步 Agent 画布失败',
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
  const response = await fetch(`${WORKFLOW_AI_API_BASE_URL}/workflow-ai/session/${sessionId}/run`, {
    method: 'POST',
  })

  if (!response.ok) {
    const payload = await readResponsePayload(response)
    throw new WorkflowAiRequestError(
      payload.message || '运行 AI 编排会话失败',
      payload.diagnostics,
      response.status,
    )
  }

  if (!response.body) {
    throw new Error('AI 会话流式响应不可用')
  }

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()
  let buffer = ''
  let completedPayload: WorkflowAiSessionRunResponse | null = null
  let failedPayload: { message: string; diagnostics?: WorkflowAiGenerationDiagnostics } | null = null

  while (true) {
    const { value, done } = await reader.read()
    if (done) break

    buffer += value
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
  const response = await fetch(`${WORKFLOW_AI_API_BASE_URL}/workflow-ai/session/${sessionId}`)
  const payload = (await readResponsePayload(response)) as WorkflowAiSessionGetResponse & WorkflowAiErrorPayload

  if (!response.ok) {
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
  const response = await fetch(`${WORKFLOW_AI_API_BASE_URL}/workflow-ai/session/${sessionId}/input`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  })
  const payload = (await readResponsePayload(response)) as WorkflowAiSessionInputResponse & WorkflowAiErrorPayload

  if (!response.ok) {
    throw new WorkflowAiRequestError(
      payload.message || '提交 AI 编排补充信息失败',
      payload.diagnostics,
      response.status,
    )
  }

  return payload
}

export const fetchSystemModelProfiles = async (): Promise<WorkflowAiModelProfile[]> => {
  const response = await fetch(`${WORKFLOW_AI_API_BASE_URL}/workflow-ai/model-profiles`)
  const payload = await readResponsePayload(response)
  if (!response.ok) {
    throw new Error(payload.message || '加载系统模型配置失败')
  }
  const data = payload as { profiles?: WorkflowAiModelProfile[] }
  return data.profiles ?? []
}

export const testWorkflowAiModelProfile = async (
  profile: WorkflowAiModelProfile,
): Promise<WorkflowAiModelTestResult> => {
  const response = await fetch(`${WORKFLOW_AI_API_BASE_URL}/workflow-ai/model-profiles/test`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ profile }),
  })

  const data = (await response.json()) as WorkflowAiModelTestResult & { message?: string }
  if (!response.ok) {
    throw new Error(data.message || '模型配置测试失败')
  }

  return data
}
