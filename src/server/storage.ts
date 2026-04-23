import { createWorkflowStorageRepository } from './storageRepositoryFactory.js'

type ServerSavedWorkflow = {
  id: string
  name: string
  updatedAt: number
  nodes: unknown[]
  edges: unknown[]
}

type ServerWorkflowVersionSource = 'save' | 'rollback'

type ServerWorkflowVersion = {
  id: string
  workflowId: string
  workflowName: string
  createdAt: number
  workflowUpdatedAt: number
  source: ServerWorkflowVersionSource
  workflow: ServerSavedWorkflow
}

type ServerExecutionRecord = {
  id: string
  workflowId: string
  workflowName: string
  startTime: number
  duration: number
  status: 'success' | 'error' | 'stopped'
  nodes: unknown[]
  edges: unknown[]
}

type ServerStorageUser = {
  id: string
  name?: string
}

const cloneJson = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

const createWorkflowVersionId = () => `wfver_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

const createWorkflowVersion = (
  workflow: ServerSavedWorkflow,
  source: ServerWorkflowVersionSource,
): ServerWorkflowVersion => ({
  id: createWorkflowVersionId(),
  workflowId: workflow.id,
  workflowName: workflow.name,
  createdAt: Date.now(),
  workflowUpdatedAt: workflow.updatedAt,
  source,
  workflow: cloneJson(workflow),
})

const storageRepository = createWorkflowStorageRepository<
  ServerSavedWorkflow,
  ServerWorkflowVersion,
  ServerExecutionRecord
>()

export const resolveServerStorageUser = (headers: Record<string, string | string[] | undefined>): ServerStorageUser => {
  const headerUserId = headers['x-user-id']
  const headerUserName = headers['x-user-name']
  const id =
    (Array.isArray(headerUserId) ? headerUserId[0] : headerUserId) ||
    process.env.WORKFLOW_STORAGE_DEFAULT_USER_ID ||
    'server-demo-user'
  const name =
    (Array.isArray(headerUserName) ? headerUserName[0] : headerUserName) ||
    process.env.WORKFLOW_STORAGE_DEFAULT_USER_NAME ||
    '默认用户'

  return { id, name }
}

export const getUserWorkflows = async (userId: string): Promise<ServerSavedWorkflow[]> => {
  const documents = await storageRepository.listWorkflowDocuments(userId)
  return documents
    .map((document) => document.current)
    .filter((workflow): workflow is ServerSavedWorkflow => Boolean(workflow))
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
}

export const getUserWorkflowById = async (
  userId: string,
  workflowId: string,
): Promise<ServerSavedWorkflow | null> => {
  const document = await storageRepository.readWorkflowDocument(userId, workflowId)
  return document.current ? cloneJson(document.current) : null
}

export const saveUserWorkflow = async (
  userId: string,
  workflow: ServerSavedWorkflow,
  source: ServerWorkflowVersionSource = 'save',
): Promise<ServerWorkflowVersion> => {
  const normalizedWorkflow = cloneJson(workflow)
  const version = createWorkflowVersion(normalizedWorkflow, source)

  await storageRepository.writeWorkflowDocument(userId, workflow.id, (document) => ({
    current: normalizedWorkflow,
    versions: [version, ...document.versions.filter((item) => item.id !== version.id)],
  }))

  return cloneJson(version)
}

export const deleteUserWorkflow = async (userId: string, workflowId: string): Promise<boolean> =>
  storageRepository.deleteWorkflowDocument(userId, workflowId)

export const getUserWorkflowVersions = async (
  userId: string,
  workflowId: string,
): Promise<ServerWorkflowVersion[]> => {
  const document = await storageRepository.readWorkflowDocument(userId, workflowId)
  return document.versions
    .filter((version) => version.workflowId === workflowId)
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((version) => cloneJson(version))
}

export const getUserWorkflowVersion = async (
  userId: string,
  workflowId: string,
  versionId: string,
): Promise<ServerWorkflowVersion | null> => {
  const document = await storageRepository.readWorkflowDocument(userId, workflowId)
  return cloneJson(
    document.versions.find(
      (version) => version.workflowId === workflowId && version.id === versionId,
    ) ?? null,
  )
}

export const rollbackUserWorkflowVersion = async (
  userId: string,
  workflowId: string,
  versionId: string,
): Promise<{ workflow: ServerSavedWorkflow; version: ServerWorkflowVersion } | null> => {
  const document = await storageRepository.readWorkflowDocument(userId, workflowId)
  const targetVersion = document.versions.find(
    (version) => version.workflowId === workflowId && version.id === versionId,
  )
  if (!targetVersion) return null

  const restoredWorkflow: ServerSavedWorkflow = {
    ...cloneJson(targetVersion.workflow),
    updatedAt: Date.now(),
  }
  const rollbackVersion = await saveUserWorkflow(userId, restoredWorkflow, 'rollback')
  return {
    workflow: cloneJson(restoredWorkflow),
    version: cloneJson(rollbackVersion),
  }
}

export const getUserHistory = async (userId: string): Promise<ServerExecutionRecord[]> => {
  const document = await storageRepository.readHistoryDocument(userId)
  return [...document.records].sort((a, b) => (b.startTime || 0) - (a.startTime || 0))
}

export const saveUserHistory = async (
  userId: string,
  record: ServerExecutionRecord,
  limit = 20,
): Promise<ServerExecutionRecord[]> => {
  const nextDocument = await storageRepository.writeHistoryDocument(userId, (document) => ({
    records: [record, ...document.records.filter((item) => item.id !== record.id)].slice(0, limit),
  }))

  return [...nextDocument.records].sort((a, b) => (b.startTime || 0) - (a.startTime || 0))
}

export const clearUserHistory = async (userId: string): Promise<void> => {
  await storageRepository.writeHistoryDocument(userId, () => ({
    records: [],
  }))
}
