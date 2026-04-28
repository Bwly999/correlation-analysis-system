import type { IncomingMessage } from 'node:http'
import { proxyAnalysisRequest, type AnalysisProxyContext } from '../analysisProxy.js'
import { createStorageCompositionRoot, type StorageCompositionRoot } from './storageCompositionRoot.js'
import type { AnalysisRouteKey } from '../analysisProxy.js'
import type { ServerStorageService, ServerStorageUser } from '../storageService.js'
import {
  WORKFLOW_USER_ID_HEADER,
  WORKFLOW_USER_NAME_HEADER,
  resolveSingleHeaderValue,
} from '../http/workflowHeaders.js'
import {
  createWorkflowMcpRuntime,
  type WorkflowMcpRuntime,
} from '../opencode/workflowMcpRuntime.js'
import { decodeWorkflowHeaderValue } from '../../shared/workflowHeaderEncoding.js'

export type ServerStorageUserResolver = (
  headers: IncomingMessage['headers'],
) => ServerStorageUser

export type AnalysisProxyHandler = (context: AnalysisProxyContext, route: AnalysisRouteKey) => Promise<void>

export interface ServerDependencies {
  storageService: ServerStorageService
  resolveStorageUser: ServerStorageUserResolver
  workflowMcpRuntime: WorkflowMcpRuntime
  proxyAnalysisRequest: AnalysisProxyHandler
}

export interface CreateServerDependenciesOptions {
  storageService?: ServerStorageService
  resolveStorageUser?: ServerStorageUserResolver
  workflowMcpRuntime?: WorkflowMcpRuntime
  proxyAnalysisRequest?: AnalysisProxyHandler
  defaultStorageUser?: ServerStorageUser
  storageCompositionRoot?: StorageCompositionRoot
  createStorageCompositionRoot?: () => StorageCompositionRoot
}

export const createServerStorageUserResolver = (
  defaultStorageUser?: ServerStorageUser,
): ServerStorageUserResolver => (headers) => {
  const headerUserId = decodeWorkflowHeaderValue(resolveSingleHeaderValue(headers[WORKFLOW_USER_ID_HEADER]))
  const headerUserName = decodeWorkflowHeaderValue(resolveSingleHeaderValue(headers[WORKFLOW_USER_NAME_HEADER]))
  const id = headerUserId || defaultStorageUser?.id

  if (!id) {
    const error = new Error(
      `缺少用户信息，请通过 ${WORKFLOW_USER_ID_HEADER} 请求头或默认依赖注入提供用户`,
    )
    ;(error as Error & { statusCode: number }).statusCode = 400
    throw error
  }

  return {
    id,
    name: headerUserName || defaultStorageUser?.name || '默认用户',
  }
}

export const createServerDependencies = (
  options: CreateServerDependenciesOptions = {},
): ServerDependencies => {
  const storageCompositionRoot =
    options.storageCompositionRoot
    || options.createStorageCompositionRoot?.()
    || createStorageCompositionRoot(
      options.defaultStorageUser ? { defaultUser: options.defaultStorageUser } : {},
    )
  const storageService = options.storageService ?? storageCompositionRoot.storageService
  const resolveStorageUser = options.resolveStorageUser ?? storageService.resolveStorageUser.bind(storageService)
  const workflowMcpRuntime = options.workflowMcpRuntime ?? createWorkflowMcpRuntime({
    storage: {
      getUserWorkflowById: (userId, workflowId) => storageService.getUserWorkflowById(userId, workflowId),
      saveUserWorkflow: (userId, workflow) => storageService.saveUserWorkflow(userId, workflow),
      getUserHistory: (userId) => storageService.getUserHistory(userId),
      saveUserHistory: (userId, record, limit) => storageService.saveUserHistory(userId, record, limit),
      getUserWorkflowVersions: (userId, workflowId) => storageService.getUserWorkflowVersions(userId, workflowId),
      getUserWorkflowVersion: (userId, workflowId, versionId) =>
        storageService.getUserWorkflowVersion(userId, workflowId, versionId),
      rollbackUserWorkflowVersion: (userId, workflowId, versionId) =>
        storageService.rollbackUserWorkflowVersion(userId, workflowId, versionId),
    },
  })

  return {
    storageService,
    resolveStorageUser,
    workflowMcpRuntime,
    proxyAnalysisRequest: options.proxyAnalysisRequest ?? proxyAnalysisRequest,
  }
}
