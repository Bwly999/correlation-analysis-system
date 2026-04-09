import { buildWorkflowAiNodeCatalog } from '@/ai/catalog'
import type {
  AnalysisAgentSessionState,
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

type AnalysisAgentSessionResponse = {
  session: AnalysisAgentSessionState
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

export const startAnalysisAgentSession = async (
  request: WorkflowAiPlanRequest,
): Promise<AnalysisAgentSessionResponse> => {
  const response = await fetch(`${WORKFLOW_AI_API_BASE_URL}/analysis-agent/session/start`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ...request,
      nodeCatalog: request.nodeCatalog?.length ? request.nodeCatalog : buildWorkflowAiNodeCatalog(),
    }),
  })

  const payload = (await readResponsePayload(response)) as AnalysisAgentSessionResponse & WorkflowAiErrorPayload
  if (!response.ok) {
    throw new WorkflowAiRequestError(
      payload.message || '启动分析代理会话失败',
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

export const getAnalysisAgentSession = async (
  sessionId: string,
): Promise<AnalysisAgentSessionResponse> => {
  const response = await fetch(`${WORKFLOW_AI_API_BASE_URL}/analysis-agent/session/${sessionId}`)
  const payload = (await readResponsePayload(response)) as AnalysisAgentSessionResponse & WorkflowAiErrorPayload

  if (!response.ok) {
    throw new WorkflowAiRequestError(
      payload.message || '读取分析代理会话失败',
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

export const syncAnalysisAgentCanvas = async (
  sessionId: string,
  workflowSnapshot: {
    name: string
    nodes: unknown[]
    edges: unknown[]
  },
): Promise<AnalysisAgentSessionResponse & { syncSummary: string }> => {
  const response = await fetch(`${WORKFLOW_AI_API_BASE_URL}/analysis-agent/session/${sessionId}/canvas-sync`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ workflowSnapshot }),
  })
  const payload = (await readResponsePayload(response)) as
    | (AnalysisAgentSessionResponse & { syncSummary: string })
    | WorkflowAiErrorPayload

  if (!response.ok) {
    const errorPayload = payload as WorkflowAiErrorPayload
    throw new WorkflowAiRequestError(
      errorPayload.message || '同步分析代理画布失败',
      errorPayload.diagnostics,
      response.status,
    )
  }

  return payload as AnalysisAgentSessionResponse & { syncSummary: string }
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

export type AgentLoopConfig = {
  maxIterations?: number
  autoExecute?: boolean
  generateConclusion?: boolean
}

export type AgentLoopOutput = {
  iterations: Array<{
    iteration: number
    plan: WorkflowAiPlan
    executionResults: Array<{
      nodeId: string
      nodeLabel: string
      nodeType: string
      success: boolean
      resultKind: string | null
      resultSummary: string
      rowCount?: number
      error?: string
    }>
    interpretation: {
      text: string
      shouldContinue: boolean
      continueReason?: string
    } | null
  }>
  conclusion: {
    summary: string
    findings: string[]
    recommendations: string[]
    caveats: string[]
  } | null
  totalDurationMs: number
  totalIterations: number
}

export const runAnalysisAgentLoop = async (
  sessionId: string,
  config?: AgentLoopConfig,
  options: StreamWorkflowAiPlanOptions = {},
): Promise<AgentLoopOutput> => {
  const response = await fetch(
    `${WORKFLOW_AI_API_BASE_URL}/analysis-agent/session/${sessionId}/run-agent-loop`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ config: config ?? {} }),
    },
  )

  if (!response.ok) {
    const payload = await readResponsePayload(response)
    throw new WorkflowAiRequestError(
      payload.message || '运行 Agent Loop 失败',
      payload.diagnostics,
      response.status,
    )
  }

  if (!response.body) {
    throw new Error('Agent Loop 流式响应不可用')
  }

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()
  let buffer = ''
  let loopOutput: AgentLoopOutput | null = null

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

      if (event.type === 'loop_completed') {
        loopOutput = {
          iterations: [],
          conclusion: null,
          totalDurationMs: event.totalDurationMs,
          totalIterations: event.totalIterations,
        }
      }
      if (event.type === 'conclusion_completed') {
        if (loopOutput) {
          loopOutput.conclusion = event.conclusion
        }
      }
    }
  }

  const lastEvent = parseNdjsonLine(buffer)
  if (lastEvent) {
    options.onEvent?.(lastEvent)
    if (lastEvent.type === 'loop_completed') {
      loopOutput = {
        iterations: [],
        conclusion: null,
        totalDurationMs: lastEvent.totalDurationMs,
        totalIterations: lastEvent.totalIterations,
      }
    }
    if (lastEvent.type === 'conclusion_completed' && loopOutput) {
      loopOutput.conclusion = lastEvent.conclusion
    }
  }

  return (
    loopOutput ?? {
      iterations: [],
      conclusion: null,
      totalDurationMs: 0,
      totalIterations: 0,
    }
  )
}
