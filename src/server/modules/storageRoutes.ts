import type { ServerExecutionRecord, ServerSavedWorkflow } from '../storageService.js'
import type { ServerDependencies } from '../bootstrap/serverDependencies.js'
import { requireWorkflowUser } from '../http/workflowUser.js'
import type { HttpDomainHandler } from '../http/types.js'
import { toHistorySummary } from '../storageService.js'

export const createStorageRoutes = (): HttpDomainHandler<ServerDependencies> => async (context) => {
  const { pathname, method, dependencies } = context
  const workflowVersionRollbackMatch = pathname.match(
    /^\/api\/storage\/workflows\/([^/]+)\/versions\/([^/]+)\/rollback$/,
  )
  const workflowVersionDetailMatch = pathname.match(
    /^\/api\/storage\/workflows\/([^/]+)\/versions\/([^/]+)$/,
  )
  const workflowVersionsMatch = pathname.match(/^\/api\/storage\/workflows\/([^/]+)\/versions$/)
  const workflowDetailMatch = pathname.match(/^\/api\/storage\/workflows\/([^/]+)$/)
  const historyDetailMatch = pathname.match(/^\/api\/storage\/history\/([^/]+)$/)

  if (method === 'GET' && pathname === '/api/storage/me') {
    context.sendJson(200, requireWorkflowUser(context))
    return true
  }

  if (method === 'GET' && pathname === '/api/storage/workflows') {
    const currentUser = requireWorkflowUser(context)
    context.sendJson(200, await dependencies.storageService.getUserWorkflows(currentUser.id))
    return true
  }

  if (method === 'POST' && pathname === '/api/storage/workflows') {
    const currentUser = requireWorkflowUser(context)
    const workflow = await context.readJsonBody<ServerSavedWorkflow>()
    await dependencies.storageService.saveUserWorkflow(currentUser.id, workflow)
    context.sendJson(200, { ok: true })
    return true
  }

  if (method === 'GET' && workflowVersionsMatch) {
    const currentUser = requireWorkflowUser(context)
    const workflowId = decodeURIComponent(workflowVersionsMatch[1] ?? '')
    context.sendJson(200, await dependencies.storageService.getUserWorkflowVersions(currentUser.id, workflowId))
    return true
  }

  if (method === 'GET' && workflowVersionDetailMatch) {
    const currentUser = requireWorkflowUser(context)
    const workflowId = decodeURIComponent(workflowVersionDetailMatch[1] ?? '')
    const versionId = decodeURIComponent(workflowVersionDetailMatch[2] ?? '')
    const version = await dependencies.storageService.getUserWorkflowVersion(currentUser.id, workflowId, versionId)
    if (!version) {
      context.sendJson(404, { message: '未找到工作流版本' })
      return true
    }
    context.sendJson(200, version)
    return true
  }

  if (method === 'POST' && workflowVersionRollbackMatch) {
    const currentUser = requireWorkflowUser(context)
    const workflowId = decodeURIComponent(workflowVersionRollbackMatch[1] ?? '')
    const versionId = decodeURIComponent(workflowVersionRollbackMatch[2] ?? '')
    const result = await dependencies.storageService.rollbackUserWorkflowVersion(currentUser.id, workflowId, versionId)
    if (!result) {
      context.sendJson(404, { message: '未找到工作流版本' })
      return true
    }
    context.sendJson(200, result)
    return true
  }

  if (method === 'GET' && workflowDetailMatch) {
    const currentUser = requireWorkflowUser(context)
    const workflowId = decodeURIComponent(workflowDetailMatch[1] ?? '')
    const workflow = await dependencies.storageService.getUserWorkflowById(currentUser.id, workflowId)
    if (!workflow) {
      context.sendJson(404, { message: '未找到工作流' })
      return true
    }
    context.sendJson(200, workflow)
    return true
  }

  if (method === 'DELETE' && workflowDetailMatch) {
    const currentUser = requireWorkflowUser(context)
    const workflowId = decodeURIComponent(workflowDetailMatch[1] ?? '')
    const deleted = await dependencies.storageService.deleteUserWorkflow(currentUser.id, workflowId)
    if (!deleted) {
      context.sendJson(404, { message: '未找到工作流' })
      return true
    }
    context.sendJson(200, { ok: true })
    return true
  }

  if (method === 'GET' && pathname === '/api/storage/history') {
    const currentUser = requireWorkflowUser(context)
    context.sendJson(200, await dependencies.storageService.getUserHistory(currentUser.id))
    return true
  }

  if (method === 'GET' && pathname === '/api/storage/history/summaries') {
    const currentUser = requireWorkflowUser(context)
    context.sendJson(200, await dependencies.storageService.getUserHistorySummaries(currentUser.id))
    return true
  }

  if (method === 'GET' && historyDetailMatch) {
    const currentUser = requireWorkflowUser(context)
    const recordId = decodeURIComponent(historyDetailMatch[1] ?? '')
    const record = await dependencies.storageService.getUserHistoryRecord(currentUser.id, recordId)
    if (!record) {
      context.sendJson(404, { message: '未找到运行记录' })
      return true
    }
    context.sendJson(200, record)
    return true
  }

  if (method === 'POST' && pathname === '/api/storage/history') {
    const currentUser = requireWorkflowUser(context)
    const body = await context.readJsonBody<{ record?: ServerExecutionRecord; limit?: number }>()
    if (!body.record) {
      context.sendJson(400, { message: '缺少运行记录' })
      return true
    }
    const history = await dependencies.storageService.saveUserHistory(currentUser.id, body.record, body.limit)
    context.sendJson(200, history.map((record) => toHistorySummary(record)))
    return true
  }

  if (method === 'DELETE' && pathname === '/api/storage/history') {
    const currentUser = requireWorkflowUser(context)
    await dependencies.storageService.clearUserHistory(currentUser.id)
    context.sendJson(200, { ok: true })
    return true
  }

  return false
}
