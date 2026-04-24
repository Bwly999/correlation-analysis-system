import type {
  WorkflowAiGenerationDiagnostics,
  WorkflowAiModelProfile,
  WorkflowAiPlanRequest,
  WorkflowAiSessionInputRequest,
  WorkflowAiStreamEvent,
} from '../../ai/types.js'
import {
  generateWorkflowAiPlan,
  getSystemModelProfiles,
  streamWorkflowAiPlan,
  testWorkflowAiModelProfile,
  toPublicModelProfile,
} from '../workflowAi/profiles.js'
import {
  getWorkflowAiSession,
  runWorkflowAiSession,
  startWorkflowAiSession,
  submitWorkflowAiSessionInput,
} from '../workflowAi/orchestrator.js'
import type { ServerDependencies } from '../bootstrap/serverDependencies.js'
import type { HttpDomainHandler } from '../http/types.js'

const writeFailedStreamEvent = (context: Parameters<HttpDomainHandler<ServerDependencies>>[0], error: unknown, message: string) => {
  const diagnostics: WorkflowAiGenerationDiagnostics | undefined =
    typeof error === 'object' && error !== null && 'diagnostics' in error
      ? (error.diagnostics as WorkflowAiGenerationDiagnostics)
      : undefined
  context.writeNdjson({
    type: 'failed',
    message: error instanceof Error ? error.message : message,
    diagnostics,
  } satisfies WorkflowAiStreamEvent)
}

export const createWorkflowAiRoutes = (): HttpDomainHandler<ServerDependencies> => async (context) => {
  const { pathname, method } = context

  if (method === 'GET' && pathname === '/api/workflow-ai/model-profiles') {
    context.sendJson(200, { profiles: getSystemModelProfiles().map(toPublicModelProfile) })
    return true
  }

  if (method === 'POST' && pathname === '/api/workflow-ai/model-profiles/test') {
    const body = await context.readJsonBody<{ profile?: WorkflowAiModelProfile }>()
    if (!body.profile) {
      context.sendJson(400, { message: '缺少模型配置' })
      return true
    }

    const result = await testWorkflowAiModelProfile(body.profile)
    context.sendJson(200, result)
    return true
  }

  if (method === 'POST' && pathname === '/api/workflow-ai/plan') {
    const body = await context.readJsonBody<WorkflowAiPlanRequest>()
    const result = await generateWorkflowAiPlan(body)
    context.sendJson(200, result)
    return true
  }

  if (method === 'POST' && pathname === '/api/workflow-ai/plan/stream') {
    const body = await context.readJsonBody<WorkflowAiPlanRequest>()
    let hasWrittenEvent = false
    context.startNdjson(200)

    try {
      await streamWorkflowAiPlan(body, (event) => {
        hasWrittenEvent = true
        context.writeNdjson(event)
      })
    } catch (error) {
      if (!hasWrittenEvent) {
        writeFailedStreamEvent(context, error, '生成 AI 计划失败')
      }
    } finally {
      context.response.end()
    }
    return true
  }

  if (method === 'POST' && pathname === '/api/workflow-ai/session/start') {
    const body = await context.readJsonBody<WorkflowAiPlanRequest>()
    const session = startWorkflowAiSession(body)
    context.sendJson(200, { session })
    return true
  }

  if (method === 'POST' && /^\/api\/workflow-ai\/session\/[^/]+\/input$/.test(pathname)) {
    const sessionId = decodeURIComponent(pathname.replace('/api/workflow-ai/session/', '').replace('/input', ''))
    const body = await context.readJsonBody<WorkflowAiSessionInputRequest>()
    const session = await submitWorkflowAiSessionInput(sessionId, body)
    context.sendJson(200, { session })
    return true
  }

  if (method === 'POST' && /^\/api\/workflow-ai\/session\/[^/]+\/run$/.test(pathname)) {
    const sessionId = decodeURIComponent(pathname.replace('/api/workflow-ai/session/', '').replace('/run', ''))
    let hasWrittenEvent = false
    context.startNdjson(200)

    try {
      await runWorkflowAiSession(sessionId, (event) => {
        hasWrittenEvent = true
        context.writeNdjson(event)
      })
    } catch (error) {
      if (!hasWrittenEvent) {
        writeFailedStreamEvent(context, error, '运行 AI 编排会话失败')
      }
    } finally {
      context.response.end()
    }
    return true
  }

  if (method === 'GET' && /^\/api\/workflow-ai\/session\/[^/]+$/.test(pathname)) {
    const sessionId = decodeURIComponent(pathname.replace('/api/workflow-ai/session/', ''))
    const session = getWorkflowAiSession(sessionId)
    if (!session) {
      context.sendJson(404, { message: '未找到 AI 编排会话' })
      return true
    }
    context.sendJson(200, { session })
    return true
  }

  return false
}
