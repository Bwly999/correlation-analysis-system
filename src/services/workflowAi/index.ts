import { buildWorkflowAiNodeCatalog } from '@/ai/catalog'
import type {
  WorkflowAiGenerationDiagnostics,
  WorkflowAiModelProfile,
  WorkflowAiModelTestResult,
  WorkflowAiPlan,
  WorkflowAiPlanRequest,
  WorkflowAiPlanResponse,
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
