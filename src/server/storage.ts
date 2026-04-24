import { createStorageCompositionRoot } from './bootstrap/storageCompositionRoot.js'
import type {
  ServerExecutionRecord,
  ServerSavedWorkflow,
  ServerStorageUser,
  ServerWorkflowVersion,
  ServerWorkflowVersionSource,
} from './storageService.js'
import type { ServerStorageService } from './storageService.js'

export {
  createServerStorageService,
  type ServerStorageRepository,
  type ServerStorageService,
  type ServerStorageServiceDependencies,
} from './storageService.js'
export type {
  ServerExecutionRecord,
  ServerSavedWorkflow,
  ServerStorageUser,
  ServerWorkflowVersion,
  ServerWorkflowVersionSource,
} from './storageService.js'

export interface ServerStorageApi {
  resolveServerStorageUser(headers: Record<string, string | string[] | undefined>): ServerStorageUser
  getUserWorkflows(userId: string): Promise<ServerSavedWorkflow[]>
  getUserWorkflowById(userId: string, workflowId: string): Promise<ServerSavedWorkflow | null>
  saveUserWorkflow(
    userId: string,
    workflow: ServerSavedWorkflow,
    source?: ServerWorkflowVersionSource,
  ): Promise<ServerWorkflowVersion>
  deleteUserWorkflow(userId: string, workflowId: string): Promise<boolean>
  getUserWorkflowVersions(userId: string, workflowId: string): Promise<ServerWorkflowVersion[]>
  getUserWorkflowVersion(userId: string, workflowId: string, versionId: string): Promise<ServerWorkflowVersion | null>
  rollbackUserWorkflowVersion(
    userId: string,
    workflowId: string,
    versionId: string,
  ): Promise<{ workflow: ServerSavedWorkflow; version: ServerWorkflowVersion } | null>
  getUserHistory(userId: string): Promise<ServerExecutionRecord[]>
  saveUserHistory(userId: string, record: ServerExecutionRecord, limit?: number): Promise<ServerExecutionRecord[]>
  clearUserHistory(userId: string): Promise<void>
}

export const createServerStorageApi = (
  storageService: ServerStorageService,
): ServerStorageApi => ({
  resolveServerStorageUser: (headers) => storageService.resolveStorageUser(headers),
  getUserWorkflows: (userId) => storageService.getUserWorkflows(userId),
  getUserWorkflowById: (userId, workflowId) => storageService.getUserWorkflowById(userId, workflowId),
  saveUserWorkflow: (userId, workflow, source = 'save') => storageService.saveUserWorkflow(userId, workflow, source),
  deleteUserWorkflow: (userId, workflowId) => storageService.deleteUserWorkflow(userId, workflowId),
  getUserWorkflowVersions: (userId, workflowId) => storageService.getUserWorkflowVersions(userId, workflowId),
  getUserWorkflowVersion: (userId, workflowId, versionId) =>
    storageService.getUserWorkflowVersion(userId, workflowId, versionId),
  rollbackUserWorkflowVersion: (userId, workflowId, versionId) =>
    storageService.rollbackUserWorkflowVersion(userId, workflowId, versionId),
  getUserHistory: (userId) => storageService.getUserHistory(userId),
  saveUserHistory: (userId, record, limit = 20) => storageService.saveUserHistory(userId, record, limit),
  clearUserHistory: (userId) => storageService.clearUserHistory(userId),
})

let defaultStorageApi: ServerStorageApi | null = null

const getDefaultStorageApi = (): ServerStorageApi => {
  if (defaultStorageApi) {
    return defaultStorageApi
  }

  const root = createStorageCompositionRoot()
  defaultStorageApi = createServerStorageApi(root.storageService)
  return defaultStorageApi
}

export const resolveServerStorageUser = (
  headers: Record<string, string | string[] | undefined>,
): ServerStorageUser => getDefaultStorageApi().resolveServerStorageUser(headers)

export const getUserWorkflows = async (userId: string): Promise<ServerSavedWorkflow[]> =>
  getDefaultStorageApi().getUserWorkflows(userId)

export const getUserWorkflowById = async (
  userId: string,
  workflowId: string,
): Promise<ServerSavedWorkflow | null> =>
  getDefaultStorageApi().getUserWorkflowById(userId, workflowId)

export const saveUserWorkflow = async (
  userId: string,
  workflow: ServerSavedWorkflow,
  source: ServerWorkflowVersionSource = 'save',
): Promise<ServerWorkflowVersion> =>
  getDefaultStorageApi().saveUserWorkflow(userId, workflow, source)

export const deleteUserWorkflow = async (userId: string, workflowId: string): Promise<boolean> =>
  getDefaultStorageApi().deleteUserWorkflow(userId, workflowId)

export const getUserWorkflowVersions = async (
  userId: string,
  workflowId: string,
): Promise<ServerWorkflowVersion[]> =>
  getDefaultStorageApi().getUserWorkflowVersions(userId, workflowId)

export const getUserWorkflowVersion = async (
  userId: string,
  workflowId: string,
  versionId: string,
): Promise<ServerWorkflowVersion | null> =>
  getDefaultStorageApi().getUserWorkflowVersion(userId, workflowId, versionId)

export const rollbackUserWorkflowVersion = async (
  userId: string,
  workflowId: string,
  versionId: string,
): Promise<{ workflow: ServerSavedWorkflow; version: ServerWorkflowVersion } | null> =>
  getDefaultStorageApi().rollbackUserWorkflowVersion(userId, workflowId, versionId)

export const getUserHistory = async (userId: string): Promise<ServerExecutionRecord[]> =>
  getDefaultStorageApi().getUserHistory(userId)

export const saveUserHistory = async (
  userId: string,
  record: ServerExecutionRecord,
  limit = 20,
): Promise<ServerExecutionRecord[]> =>
  getDefaultStorageApi().saveUserHistory(userId, record, limit)

export const clearUserHistory = async (userId: string): Promise<void> =>
  getDefaultStorageApi().clearUserHistory(userId)
