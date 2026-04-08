import type { IncomingMessage, ServerResponse } from 'node:http'
import {
  generateWorkflowAiPlan,
  getSystemModelProfiles,
  streamWorkflowAiPlan,
  testWorkflowAiModelProfile,
  toPublicModelProfile,
} from './workflowAi/profiles.js'
import type {
  WorkflowAiModelProfile,
  WorkflowAiPlanRequest,
  WorkflowAiSessionState,
  WorkflowAiStreamEvent,
} from '../ai/types.js'
import {
  getWorkflowAiSession,
  runWorkflowAiSession,
  startWorkflowAiSession,
  submitWorkflowAiSessionInput,
} from './workflowAi/orchestrator.js'
import { proxyAnalysisRequest } from './analysisProxy.js'
import {
  clearUserHistory,
  deleteUserWorkflow,
  getUserHistory,
  getUserWorkflowById,
  getUserWorkflows,
  resolveServerStorageUser,
  saveUserHistory,
  saveUserWorkflow,
} from './storage.js'

const setCorsHeaders = (response: ServerResponse) => {
  response.setHeader('Access-Control-Allow-Origin', '*')
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  response.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
}

const sendJson = (response: ServerResponse, statusCode: number, payload: unknown) => {
  setCorsHeaders(response)
  response.statusCode = statusCode
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.end(JSON.stringify(payload))
}

const startNdjsonStream = (response: ServerResponse) => {
  setCorsHeaders(response)
  response.statusCode = 200
  response.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8')
  response.setHeader('Cache-Control', 'no-cache, no-transform')
}

const writeNdjsonEvent = (response: ServerResponse, event: WorkflowAiStreamEvent) => {
  response.write(`${JSON.stringify(event)}\n`)
}

const readJsonBody = async <T>(request: IncomingMessage): Promise<T> => {
  const chunks: Buffer[] = []

  for await (const chunk of request) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }

  const raw = Buffer.concat(chunks).toString('utf-8').trim()
  return (raw ? JSON.parse(raw) : {}) as T
}

const sendError = (response: ServerResponse, error: unknown) => {
  const statusCode =
    typeof error === 'object' && error !== null && 'statusCode' in error && typeof error.statusCode === 'number'
      ? error.statusCode
      : 500
  const message = error instanceof Error ? error.message : '服务处理失败'
  const diagnostics =
    typeof error === 'object' && error !== null && 'diagnostics' in error ? error.diagnostics : undefined
  sendJson(response, statusCode, diagnostics ? { message, diagnostics } : { message })
}

const mapAnalysisAgentPhase = (session: WorkflowAiSessionState) => {
  if (session.status === 'waiting_user') return 'waiting_for_input'
  if (session.status === 'completed') return 'completed'
  if (session.status === 'failed') return 'failed'
  if (session.status === 'running') return 'executing'
  return 'intent'
}

const toAnalysisAgentSession = (session: WorkflowAiSessionState) => ({
  ...session,
  userGoal: session.prompt,
  phase: mapAnalysisAgentPhase(session),
  conversation: [
    {
      id: 'user_goal',
      role: 'user',
      content: session.prompt,
    },
  ],
  artifacts: [],
  approvalRequests: session.missingInfo.map((item) => ({
    key: item.key,
    label: item.label,
    reason: item.reason,
    blocking: item.blocking,
  })),
})

export const createServerHandler = () => async (request: IncomingMessage, response: ServerResponse) => {
  const url = new URL(request.url || '/', 'http://127.0.0.1')
  const currentUser = resolveServerStorageUser(request.headers)

  if (request.method === 'OPTIONS') {
    setCorsHeaders(response)
    response.statusCode = 204
    response.end()
    return
  }

  try {
    if (request.method === 'GET' && url.pathname === '/api/storage/me') {
      sendJson(response, 200, currentUser)
      return
    }

    if (request.method === 'GET' && url.pathname === '/api/storage/workflows') {
      sendJson(response, 200, getUserWorkflows(currentUser.id))
      return
    }

    if (request.method === 'POST' && url.pathname === '/api/storage/workflows') {
      const workflow = await readJsonBody(request)
      saveUserWorkflow(currentUser.id, workflow as any)
      sendJson(response, 200, { ok: true })
      return
    }

    if (request.method === 'GET' && url.pathname.startsWith('/api/storage/workflows/')) {
      const workflowId = decodeURIComponent(url.pathname.replace('/api/storage/workflows/', ''))
      const workflow = getUserWorkflowById(currentUser.id, workflowId)
      if (!workflow) {
        sendJson(response, 404, { message: '未找到工作流' })
        return
      }
      sendJson(response, 200, workflow)
      return
    }

    if (request.method === 'DELETE' && url.pathname.startsWith('/api/storage/workflows/')) {
      const workflowId = decodeURIComponent(url.pathname.replace('/api/storage/workflows/', ''))
      const deleted = deleteUserWorkflow(currentUser.id, workflowId)
      if (!deleted) {
        sendJson(response, 404, { message: '未找到工作流' })
        return
      }
      sendJson(response, 200, { ok: true })
      return
    }

    if (request.method === 'GET' && url.pathname === '/api/storage/history') {
      sendJson(response, 200, getUserHistory(currentUser.id))
      return
    }

    if (request.method === 'POST' && url.pathname === '/api/storage/history') {
      const body = await readJsonBody<{ record?: any; limit?: number }>(request)
      if (!body.record) {
        sendJson(response, 400, { message: '缺少运行记录' })
        return
      }
      const history = saveUserHistory(currentUser.id, body.record, body.limit)
      sendJson(response, 200, history)
      return
    }

    if (request.method === 'DELETE' && url.pathname === '/api/storage/history') {
      clearUserHistory(currentUser.id)
      sendJson(response, 200, { ok: true })
      return
    }

    if (request.method === 'POST' && url.pathname === '/api/analysis/lasso') {
      await proxyAnalysisRequest(request, response, 'lasso', setCorsHeaders)
      return
    }

    if (request.method === 'POST' && url.pathname === '/api/analysis/multiple-linear-regression') {
      await proxyAnalysisRequest(request, response, 'multiple-linear-regression', setCorsHeaders)
      return
    }

    if (request.method === 'POST' && url.pathname === '/api/analysis/random-forest-feature-importance') {
      await proxyAnalysisRequest(request, response, 'random-forest-feature-importance', setCorsHeaders)
      return
    }

    if (request.method === 'POST' && url.pathname === '/api/analysis/xgboost-shap') {
      await proxyAnalysisRequest(request, response, 'xgboost-shap', setCorsHeaders)
      return
    }

    if (request.method === 'GET' && url.pathname === '/api/workflow-ai/model-profiles') {
      sendJson(response, 200, { profiles: getSystemModelProfiles().map(toPublicModelProfile) })
      return
    }

    if (request.method === 'POST' && url.pathname === '/api/workflow-ai/model-profiles/test') {
      const body = await readJsonBody<{ profile?: WorkflowAiModelProfile }>(request)
      if (!body.profile) {
        sendJson(response, 400, { message: '缺少模型配置' })
        return
      }

      const result = await testWorkflowAiModelProfile(body.profile)
      sendJson(response, 200, result)
      return
    }

    if (request.method === 'POST' && url.pathname === '/api/workflow-ai/plan') {
      const body = await readJsonBody<WorkflowAiPlanRequest>(request)
      const result = await generateWorkflowAiPlan(body)
      sendJson(response, 200, result)
      return
    }

    if (request.method === 'POST' && url.pathname === '/api/workflow-ai/plan/stream') {
      const body = await readJsonBody<WorkflowAiPlanRequest>(request)
      let hasWrittenEvent = false
      startNdjsonStream(response)

      try {
        await streamWorkflowAiPlan(body, (event) => {
          hasWrittenEvent = true
          writeNdjsonEvent(response, event)
        })
      } catch (error) {
        if (!hasWrittenEvent) {
          const message = error instanceof Error ? error.message : '生成 AI 计划失败'
          const diagnostics =
            typeof error === 'object' && error !== null && 'diagnostics' in error ? error.diagnostics : undefined
          writeNdjsonEvent(response, {
            type: 'failed',
            message,
            diagnostics: diagnostics as any,
          })
        }
      } finally {
        response.end()
      }
      return
    }

    if (request.method === 'POST' && url.pathname === '/api/workflow-ai/session/start') {
      const body = await readJsonBody<WorkflowAiPlanRequest>(request)
      const session = startWorkflowAiSession(body)
      sendJson(response, 200, { session })
      return
    }

    if (request.method === 'POST' && url.pathname === '/api/analysis-agent/session/start') {
      const body = await readJsonBody<WorkflowAiPlanRequest>(request)
      const session = startWorkflowAiSession(body)
      sendJson(response, 200, { session: toAnalysisAgentSession(session) })
      return
    }

    if (
      request.method === 'POST'
      && /^\/api\/workflow-ai\/session\/[^/]+\/input$/.test(url.pathname)
    ) {
      const sessionId = decodeURIComponent(url.pathname.replace('/api/workflow-ai/session/', '').replace('/input', ''))
      const body = await readJsonBody(request)
      const session = await submitWorkflowAiSessionInput(sessionId, body as any)
      sendJson(response, 200, { session })
      return
    }

    if (
      request.method === 'POST'
      && /^\/api\/analysis-agent\/session\/[^/]+\/input$/.test(url.pathname)
    ) {
      const sessionId = decodeURIComponent(url.pathname.replace('/api/analysis-agent/session/', '').replace('/input', ''))
      const body = await readJsonBody(request)
      const session = await submitWorkflowAiSessionInput(sessionId, body as any)
      sendJson(response, 200, { session: toAnalysisAgentSession(session) })
      return
    }

    if (
      request.method === 'POST'
      && /^\/api\/workflow-ai\/session\/[^/]+\/run$/.test(url.pathname)
    ) {
      const sessionId = decodeURIComponent(url.pathname.replace('/api/workflow-ai/session/', '').replace('/run', ''))
      let hasWrittenEvent = false
      startNdjsonStream(response)

      try {
        await runWorkflowAiSession(sessionId, (event) => {
          hasWrittenEvent = true
          writeNdjsonEvent(response, event)
        })
      } catch (error) {
        if (!hasWrittenEvent) {
          const message = error instanceof Error ? error.message : '运行 AI 编排会话失败'
          const diagnostics =
            typeof error === 'object' && error !== null && 'diagnostics' in error ? error.diagnostics : undefined
          writeNdjsonEvent(response, {
            type: 'failed',
            message,
            diagnostics: diagnostics as any,
          })
        }
      } finally {
        response.end()
      }
      return
    }

    if (
      request.method === 'GET'
      && /^\/api\/workflow-ai\/session\/[^/]+$/.test(url.pathname)
    ) {
      const sessionId = decodeURIComponent(url.pathname.replace('/api/workflow-ai/session/', ''))
      const session = getWorkflowAiSession(sessionId)
      if (!session) {
        sendJson(response, 404, { message: '未找到 AI 编排会话' })
        return
      }
      sendJson(response, 200, { session })
      return
    }

    if (
      request.method === 'POST'
      && /^\/api\/analysis-agent\/session\/[^/]+\/canvas-sync$/.test(url.pathname)
    ) {
      const sessionId = decodeURIComponent(url.pathname.replace('/api/analysis-agent/session/', '').replace('/canvas-sync', ''))
      const body = await readJsonBody<{ workflowSnapshot?: { nodes?: unknown[]; edges?: unknown[] } }>(request)
      const session = getWorkflowAiSession(sessionId)
      if (!session) {
        sendJson(response, 404, { message: '未找到分析代理会话' })
        return
      }

      const nodeCount = body.workflowSnapshot?.nodes?.length ?? 0
      const edgeCount = body.workflowSnapshot?.edges?.length ?? 0

      sendJson(response, 200, {
        session: toAnalysisAgentSession(session),
        syncSummary: `已同步当前画布，共 ${nodeCount} 个节点、${edgeCount} 条连线`,
      })
      return
    }

    if (
      request.method === 'GET'
      && /^\/api\/analysis-agent\/session\/[^/]+$/.test(url.pathname)
    ) {
      const sessionId = decodeURIComponent(url.pathname.replace('/api/analysis-agent/session/', ''))
      const session = getWorkflowAiSession(sessionId)
      if (!session) {
        sendJson(response, 404, { message: '未找到分析代理会话' })
        return
      }
      sendJson(response, 200, { session: toAnalysisAgentSession(session) })
      return
    }

    sendJson(response, 404, { message: '未找到接口' })
  } catch (error) {
    sendError(response, error)
  }
}

