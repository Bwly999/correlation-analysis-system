import type { IncomingMessage, ServerResponse } from 'node:http'
import {
  generateWorkflowAiPlan,
  getSystemModelProfiles,
  streamWorkflowAiPlan,
  testWorkflowAiModelProfile,
  toPublicModelProfile,
} from './workflowAi/profiles.js'
import type {
  AgentSessionCanvasSyncRequest,
  AgentSessionEvent,
  AgentSessionMessageRequest,
  WorkflowAiModelProfile,
  WorkflowAiPlanRequest,
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
  createAgentSession,
  getAgentProjection,
  getAgentSession,
  sendAgentSessionMessage,
  subscribeToAgentSessionEvents,
  syncAgentCanvas,
} from './opencode/gateway.js'
import {
  getWorkflowMcpHealthSnapshot,
  handleWorkflowMcpRequest,
  isWorkflowMcpHealthRequest,
  isWorkflowMcpRequest,
} from './opencode/workflowMcpServer.js'
import {
  clearUserHistory,
  deleteUserWorkflow,
  getUserHistory,
  getUserWorkflowById,
  getUserWorkflowVersion,
  getUserWorkflowVersions,
  getUserWorkflows,
  rollbackUserWorkflowVersion,
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

const writeAgentNdjsonEvent = (response: ServerResponse, event: AgentSessionEvent) => {
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

export const createServerHandler = () => async (request: IncomingMessage, response: ServerResponse) => {
  const url = new URL(request.url || '/', 'http://127.0.0.1')
  const currentUser = resolveServerStorageUser(request.headers)
  const workflowVersionRollbackMatch = url.pathname.match(
    /^\/api\/storage\/workflows\/([^/]+)\/versions\/([^/]+)\/rollback$/,
  )
  const workflowVersionDetailMatch = url.pathname.match(
    /^\/api\/storage\/workflows\/([^/]+)\/versions\/([^/]+)$/,
  )
  const workflowVersionsMatch = url.pathname.match(/^\/api\/storage\/workflows\/([^/]+)\/versions$/)
  const workflowDetailMatch = url.pathname.match(/^\/api\/storage\/workflows\/([^/]+)$/)
  const agentSessionMessagesMatch = url.pathname.match(/^\/api\/agent\/sessions\/([^/]+)\/messages$/)
  const agentSessionEventsMatch = url.pathname.match(/^\/api\/agent\/sessions\/([^/]+)\/events$/)
  const agentSessionProjectionMatch = url.pathname.match(/^\/api\/agent\/sessions\/([^/]+)\/projection$/)
  const agentSessionCanvasSyncMatch = url.pathname.match(/^\/api\/agent\/sessions\/([^/]+)\/canvas-sync$/)
  const agentSessionDetailMatch = url.pathname.match(/^\/api\/agent\/sessions\/([^/]+)$/)

  if (request.method === 'OPTIONS') {
    setCorsHeaders(response)
    response.statusCode = 204
    response.end()
    return
  }

  try {
    if (request.method === 'GET' && isWorkflowMcpHealthRequest(url.pathname)) {
      sendJson(response, 200, getWorkflowMcpHealthSnapshot())
      return
    }

    if (isWorkflowMcpRequest(url.pathname)) {
      await handleWorkflowMcpRequest(request, response)
      return
    }

    if (request.method === 'GET' && url.pathname === '/api/storage/me') {
      sendJson(response, 200, currentUser)
      return
    }

    if (request.method === 'POST' && url.pathname === '/api/agent/sessions') {
      const body = await readJsonBody<WorkflowAiPlanRequest>(request)
      const result = await createAgentSession({
        request: body,
        userId: currentUser.id,
      })
      sendJson(response, 200, result)
      return
    }

    if (request.method === 'GET' && agentSessionDetailMatch) {
      const sessionId = decodeURIComponent(agentSessionDetailMatch[1] ?? '')
      const result = getAgentSession(sessionId)
      if (!result) {
        sendJson(response, 404, { message: '未找到 Agent 会话' })
        return
      }
      sendJson(response, 200, result)
      return
    }

    if (request.method === 'POST' && agentSessionMessagesMatch) {
      const sessionId = decodeURIComponent(agentSessionMessagesMatch[1] ?? '')
      const body = await readJsonBody<AgentSessionMessageRequest>(request)
      const result = await sendAgentSessionMessage(
        {
          sessionId,
          message: body.content,
        },
        () => undefined,
      )
      sendJson(response, 200, result)
      return
    }

    if (request.method === 'GET' && agentSessionEventsMatch) {
      const sessionId = decodeURIComponent(agentSessionEventsMatch[1] ?? '')
      const snapshot = getAgentSession(sessionId)
      if (!snapshot) {
        sendJson(response, 404, { message: '未找到 Agent 会话' })
        return
      }

      startNdjsonStream(response)
      const unsubscribe = subscribeToAgentSessionEvents(sessionId, (event) => {
        writeAgentNdjsonEvent(response, event)
      })

      if (!unsubscribe) {
        response.end()
        return
      }

      request.on('close', () => {
        unsubscribe()
        response.end()
      })
      return
    }

    if (request.method === 'GET' && agentSessionProjectionMatch) {
      const sessionId = decodeURIComponent(agentSessionProjectionMatch[1] ?? '')
      const projection = getAgentProjection(sessionId)
      if (!projection) {
        sendJson(response, 404, { message: '未找到 Agent 会话' })
        return
      }
      sendJson(response, 200, { projection })
      return
    }

    if (request.method === 'POST' && agentSessionCanvasSyncMatch) {
      const sessionId = decodeURIComponent(agentSessionCanvasSyncMatch[1] ?? '')
      const body = await readJsonBody<AgentSessionCanvasSyncRequest>(request)
      const result = await syncAgentCanvas({
        sessionId,
        workflowSnapshot: body.workflowSnapshot,
      })
      sendJson(response, 200, result)
      return
    }

    if (request.method === 'GET' && url.pathname === '/api/storage/workflows') {
      sendJson(response, 200, await getUserWorkflows(currentUser.id))
      return
    }

    if (request.method === 'POST' && url.pathname === '/api/storage/workflows') {
      const workflow = await readJsonBody(request)
      await saveUserWorkflow(currentUser.id, workflow as any)
      sendJson(response, 200, { ok: true })
      return
    }

    if (request.method === 'GET' && workflowVersionsMatch) {
      const workflowId = decodeURIComponent(workflowVersionsMatch[1] ?? '')
      sendJson(response, 200, await getUserWorkflowVersions(currentUser.id, workflowId))
      return
    }

    if (request.method === 'GET' && workflowVersionDetailMatch) {
      const workflowId = decodeURIComponent(workflowVersionDetailMatch[1] ?? '')
      const versionId = decodeURIComponent(workflowVersionDetailMatch[2] ?? '')
      const version = await getUserWorkflowVersion(currentUser.id, workflowId, versionId)
      if (!version) {
        sendJson(response, 404, { message: '未找到工作流版本' })
        return
      }
      sendJson(response, 200, version)
      return
    }

    if (request.method === 'POST' && workflowVersionRollbackMatch) {
      const workflowId = decodeURIComponent(workflowVersionRollbackMatch[1] ?? '')
      const versionId = decodeURIComponent(workflowVersionRollbackMatch[2] ?? '')
      const result = await rollbackUserWorkflowVersion(currentUser.id, workflowId, versionId)
      if (!result) {
        sendJson(response, 404, { message: '未找到工作流版本' })
        return
      }
      sendJson(response, 200, result)
      return
    }

    if (request.method === 'GET' && workflowDetailMatch) {
      const workflowId = decodeURIComponent(workflowDetailMatch[1] ?? '')
      const workflow = await getUserWorkflowById(currentUser.id, workflowId)
      if (!workflow) {
        sendJson(response, 404, { message: '未找到工作流' })
        return
      }
      sendJson(response, 200, workflow)
      return
    }

    if (request.method === 'DELETE' && workflowDetailMatch) {
      const workflowId = decodeURIComponent(workflowDetailMatch[1] ?? '')
      const deleted = await deleteUserWorkflow(currentUser.id, workflowId)
      if (!deleted) {
        sendJson(response, 404, { message: '未找到工作流' })
        return
      }
      sendJson(response, 200, { ok: true })
      return
    }

    if (request.method === 'GET' && url.pathname === '/api/storage/history') {
      sendJson(response, 200, await getUserHistory(currentUser.id))
      return
    }

    if (request.method === 'POST' && url.pathname === '/api/storage/history') {
      const body = await readJsonBody<{ record?: any; limit?: number }>(request)
      if (!body.record) {
        sendJson(response, 400, { message: '缺少运行记录' })
        return
      }
      const history = await saveUserHistory(currentUser.id, body.record, body.limit)
      sendJson(response, 200, history)
      return
    }

    if (request.method === 'DELETE' && url.pathname === '/api/storage/history') {
      await clearUserHistory(currentUser.id)
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

    if (request.method === 'POST' && url.pathname === '/api/analysis/logistic-regression-classification') {
      await proxyAnalysisRequest(request, response, 'logistic-regression-classification', setCorsHeaders)
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

    sendJson(response, 404, { message: '未找到接口' })
  } catch (error) {
    sendError(response, error)
  }
}

