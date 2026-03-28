import type { IncomingMessage, ServerResponse } from 'node:http'
import {
  generateWorkflowAiPlan,
  getSystemModelProfiles,
  testWorkflowAiModelProfile,
  toPublicModelProfile,
} from './workflowAi/profiles.js'
import type { WorkflowAiModelProfile, WorkflowAiPlanRequest } from '../ai/types.js'
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

const readJsonBody = async <T>(request: IncomingMessage): Promise<T> => {
  const chunks: Buffer[] = []

  for await (const chunk of request) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }

  const raw = Buffer.concat(chunks).toString('utf-8').trim()
  return (raw ? JSON.parse(raw) : {}) as T
}

const sendError = (response: ServerResponse, error: unknown) => {
  const message = error instanceof Error ? error.message : '服务处理失败'
  sendJson(response, 500, { message })
}

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
      const plan = await generateWorkflowAiPlan(body)
      sendJson(response, 200, plan)
      return
    }

    sendJson(response, 404, { message: '未找到接口' })
  } catch (error) {
    sendError(response, error)
  }
}

