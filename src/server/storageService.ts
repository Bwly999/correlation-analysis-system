import type {
  StorageExecutionRecordDto,
  StorageUserDto,
  StorageWorkflowDto,
  StorageWorkflowRollbackResultDto,
  StorageWorkflowVersionDto,
  TransportWorkflowVersionSource,
} from '../shared/contracts/storage.js'
import {
  WORKFLOW_USER_ID_HEADER,
  WORKFLOW_USER_NAME_HEADER,
  resolveSingleHeaderValue,
} from './http/workflowHeaders.js'
import type { WorkflowStorageRepository } from './storageRepository.js'

export type ServerSavedWorkflow = StorageWorkflowDto

export type ServerWorkflowVersionSource = TransportWorkflowVersionSource

export type ServerWorkflowVersion = StorageWorkflowVersionDto<ServerSavedWorkflow>

export type ServerExecutionRecord = StorageExecutionRecordDto

export type ServerStorageUser = StorageUserDto

export type ServerStorageRepository = WorkflowStorageRepository<
  ServerSavedWorkflow,
  ServerWorkflowVersion,
  ServerExecutionRecord
>

export interface ServerStorageService {
  resolveStorageUser(headers: Record<string, string | string[] | undefined>): ServerStorageUser
  getUserWorkflows(userId: string): Promise<ServerSavedWorkflow[]>
  getUserWorkflowById(userId: string, workflowId: string): Promise<ServerSavedWorkflow | null>
  saveUserWorkflow(
    userId: string,
    workflow: ServerSavedWorkflow,
    source?: ServerWorkflowVersionSource,
  ): Promise<ServerWorkflowVersion>
  deleteUserWorkflow(userId: string, workflowId: string): Promise<boolean>
  getUserWorkflowVersions(userId: string, workflowId: string): Promise<ServerWorkflowVersion[]>
  getUserWorkflowVersion(
    userId: string,
    workflowId: string,
    versionId: string,
  ): Promise<ServerWorkflowVersion | null>
  rollbackUserWorkflowVersion(
    userId: string,
    workflowId: string,
    versionId: string,
  ): Promise<StorageWorkflowRollbackResultDto<ServerSavedWorkflow, ServerWorkflowVersion> | null>
  getUserHistory(userId: string): Promise<ServerExecutionRecord[]>
  saveUserHistory(userId: string, record: ServerExecutionRecord, limit?: number): Promise<ServerExecutionRecord[]>
  clearUserHistory(userId: string): Promise<void>
}

export interface ServerStorageServiceDependencies {
  repository: ServerStorageRepository
  defaultUser?: ServerStorageUser
  now?: () => number
  createWorkflowVersionId?: () => string
}

const cloneJson = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

const defaultCreateWorkflowVersionId = () => `wfver_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

export const createServerStorageService = (
  dependencies: ServerStorageServiceDependencies,
): ServerStorageService => {
  const repository = dependencies.repository
  const defaultUser = dependencies.defaultUser
  const now = dependencies.now ?? (() => Date.now())
  const createWorkflowVersionId = dependencies.createWorkflowVersionId ?? defaultCreateWorkflowVersionId

  const createWorkflowVersion = (
    workflow: ServerSavedWorkflow,
    source: ServerWorkflowVersionSource,
  ): ServerWorkflowVersion => ({
    id: createWorkflowVersionId(),
    workflowId: workflow.id,
    workflowName: workflow.name,
    createdAt: now(),
    workflowUpdatedAt: workflow.updatedAt,
    source,
    workflow: cloneJson(workflow),
  })

  const saveWorkflow = async (
    userId: string,
    workflow: ServerSavedWorkflow,
    source: ServerWorkflowVersionSource = 'save',
  ): Promise<ServerWorkflowVersion> => {
    const normalizedWorkflow = cloneJson(workflow)
    const version = createWorkflowVersion(normalizedWorkflow, source)

    await repository.writeWorkflowDocument(userId, workflow.id, (document) => ({
      current: normalizedWorkflow,
      versions: [version, ...document.versions.filter((item) => item.id !== version.id)],
    }))

    return cloneJson(version)
  }

  return {
    resolveStorageUser(headers) {
      const id = resolveSingleHeaderValue(headers[WORKFLOW_USER_ID_HEADER]) || defaultUser?.id
      if (!id) {
        const error = new Error(
          `缺少用户标识，请通过 ${WORKFLOW_USER_ID_HEADER} 请求头或 defaultUser 依赖注入提供用户`,
        )
        ;(error as Error & { statusCode: number }).statusCode = 400
        throw error
      }
      const name = resolveSingleHeaderValue(headers[WORKFLOW_USER_NAME_HEADER]) || defaultUser?.name || '默认用户'

      return { id, name }
    },

    async getUserWorkflows(userId) {
      const documents = await repository.listWorkflowDocuments(userId)
      return documents
        .map((document) => document.current)
        .filter((workflow): workflow is ServerSavedWorkflow => Boolean(workflow))
        .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    },

    async getUserWorkflowById(userId, workflowId) {
      const document = await repository.readWorkflowDocument(userId, workflowId)
      return document.current ? cloneJson(document.current) : null
    },

    async saveUserWorkflow(userId, workflow, source = 'save') {
      return saveWorkflow(userId, workflow, source)
    },

    async deleteUserWorkflow(userId, workflowId) {
      return repository.deleteWorkflowDocument(userId, workflowId)
    },

    async getUserWorkflowVersions(userId, workflowId) {
      const document = await repository.readWorkflowDocument(userId, workflowId)
      return document.versions
        .filter((version) => version.workflowId === workflowId)
        .sort((a, b) => b.createdAt - a.createdAt)
        .map((version) => cloneJson(version))
    },

    async getUserWorkflowVersion(userId, workflowId, versionId) {
      const document = await repository.readWorkflowDocument(userId, workflowId)
      return cloneJson(
        document.versions.find(
          (version) => version.workflowId === workflowId && version.id === versionId,
        ) ?? null,
      )
    },

    async rollbackUserWorkflowVersion(userId, workflowId, versionId) {
      const document = await repository.readWorkflowDocument(userId, workflowId)
      const targetVersion = document.versions.find(
        (version) => version.workflowId === workflowId && version.id === versionId,
      )
      if (!targetVersion) return null

      const restoredWorkflow: ServerSavedWorkflow = {
        ...cloneJson(targetVersion.workflow),
        updatedAt: now(),
      }
      const rollbackVersion = await saveWorkflow(userId, restoredWorkflow, 'rollback')
      return {
        workflow: cloneJson(restoredWorkflow),
        version: cloneJson(rollbackVersion),
      }
    },

    async getUserHistory(userId) {
      const document = await repository.readHistoryDocument(userId)
      return [...document.records].sort((a, b) => (b.startTime || 0) - (a.startTime || 0))
    },

    async saveUserHistory(userId, record, limit = 20) {
      const nextDocument = await repository.writeHistoryDocument(userId, (document) => ({
        records: [record, ...document.records.filter((item) => item.id !== record.id)].slice(0, limit),
      }))

      return [...nextDocument.records].sort((a, b) => (b.startTime || 0) - (a.startTime || 0))
    },

    async clearUserHistory(userId) {
      await repository.writeHistoryDocument(userId, () => ({
        records: [],
      }))
    },
  }
}
