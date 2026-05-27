import type { FastifyPluginAsync } from 'fastify'
import type { ServerExecutionRecord, ServerSavedWorkflow } from '../storageService.js'
import { requireWorkflowUser } from '../http/workflowUser.js'
import { toHistorySummary } from '../storageService.js'

export const createStorageRoutes = (): FastifyPluginAsync => async (app) => {
  app.get('/api/storage/me', async (request) => requireWorkflowUser(request))

  app.get('/api/storage/workflows', async (request) => {
    const currentUser = requireWorkflowUser(request)
    return app.serverDependencies.storageService.getUserWorkflows(currentUser.id)
  })

  app.post('/api/storage/workflows', async (request) => {
    const currentUser = requireWorkflowUser(request)
    const workflow = request.body as ServerSavedWorkflow
    await app.serverDependencies.storageService.saveUserWorkflow(currentUser.id, workflow)
    return { ok: true }
  })

  app.get('/api/storage/workflows/:workflowId/versions', async (request) => {
    const currentUser = requireWorkflowUser(request)
    const { workflowId } = request.params as { workflowId: string }
    return app.serverDependencies.storageService.getUserWorkflowVersions(currentUser.id, workflowId)
  })

  app.get('/api/storage/workflows/:workflowId/versions/:versionId', async (request, reply) => {
    const currentUser = requireWorkflowUser(request)
    const { workflowId, versionId } = request.params as { workflowId: string; versionId: string }
    const version = await app.serverDependencies.storageService.getUserWorkflowVersion(currentUser.id, workflowId, versionId)
    if (!version) {
      reply.code(404)
      return { message: '未找到工作流版本' }
    }
    return version
  })

  app.post('/api/storage/workflows/:workflowId/versions/:versionId/rollback', async (request, reply) => {
    const currentUser = requireWorkflowUser(request)
    const { workflowId, versionId } = request.params as { workflowId: string; versionId: string }
    const result = await app.serverDependencies.storageService.rollbackUserWorkflowVersion(
      currentUser.id,
      workflowId,
      versionId,
    )
    if (!result) {
      reply.code(404)
      return { message: '未找到工作流版本' }
    }
    return result
  })

  app.get('/api/storage/workflows/:workflowId', async (request, reply) => {
    const currentUser = requireWorkflowUser(request)
    const { workflowId } = request.params as { workflowId: string }
    const workflow = await app.serverDependencies.storageService.getUserWorkflowById(currentUser.id, workflowId)
    if (!workflow) {
      reply.code(404)
      return { message: '未找到工作流' }
    }
    return workflow
  })

  app.delete('/api/storage/workflows/:workflowId', async (request, reply) => {
    const currentUser = requireWorkflowUser(request)
    const { workflowId } = request.params as { workflowId: string }
    const deleted = await app.serverDependencies.storageService.deleteUserWorkflow(currentUser.id, workflowId)
    if (!deleted) {
      reply.code(404)
      return { message: '未找到工作流' }
    }
    return { ok: true }
  })

  app.get('/api/storage/history', async (request) => {
    const currentUser = requireWorkflowUser(request)
    return app.serverDependencies.storageService.getUserHistory(currentUser.id)
  })

  app.get('/api/storage/history/summaries', async (request) => {
    const currentUser = requireWorkflowUser(request)
    return app.serverDependencies.storageService.getUserHistorySummaries(currentUser.id)
  })

  app.get('/api/storage/history/:recordId', async (request, reply) => {
    const currentUser = requireWorkflowUser(request)
    const { recordId } = request.params as { recordId: string }
    const record = await app.serverDependencies.storageService.getUserHistoryRecord(currentUser.id, recordId)
    if (!record) {
      reply.code(404)
      return { message: '未找到运行记录' }
    }
    return record
  })

  app.post('/api/storage/history', async (request, reply) => {
    const currentUser = requireWorkflowUser(request)
    const body = request.body as { record?: ServerExecutionRecord; limit?: number }
    if (!body.record) {
      reply.code(400)
      return { message: '缺少运行记录' }
    }
    const history = await app.serverDependencies.storageService.saveUserHistory(currentUser.id, body.record, body.limit)
    return history.map((record) => toHistorySummary(record))
  })

  app.delete('/api/storage/history', async (request) => {
    const currentUser = requireWorkflowUser(request)
    await app.serverDependencies.storageService.clearUserHistory(currentUser.id)
    return { ok: true }
  })
}
