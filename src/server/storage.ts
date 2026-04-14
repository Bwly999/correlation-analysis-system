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

type ServerUserStorage = {
  workflows: ServerSavedWorkflow[]
  versions: ServerWorkflowVersion[]
  history: ServerExecutionRecord[]
}

const userStorageMap = new Map<string, ServerUserStorage>()

const getUserStorage = (userId: string): ServerUserStorage => {
  const existing = userStorageMap.get(userId)
  if (existing) return existing

  const created: ServerUserStorage = {
    workflows: [],
    versions: [],
    history: [],
  }
  userStorageMap.set(userId, created)
  return created
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

export const getUserWorkflows = (userId: string): ServerSavedWorkflow[] =>
  [...getUserStorage(userId).workflows].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))

export const getUserWorkflowById = (userId: string, workflowId: string): ServerSavedWorkflow | null =>
  getUserStorage(userId).workflows.find((workflow) => workflow.id === workflowId) ?? null

export const saveUserWorkflow = (
  userId: string,
  workflow: ServerSavedWorkflow,
  source: ServerWorkflowVersionSource = 'save',
): ServerWorkflowVersion => {
  const storage = getUserStorage(userId)
  const normalizedWorkflow = cloneJson(workflow)
  const version = createWorkflowVersion(normalizedWorkflow, source)
  storage.workflows = storage.workflows.filter((item) => item.id !== workflow.id).concat(normalizedWorkflow)
  storage.versions = [version, ...storage.versions.filter((item) => item.id !== version.id)]
  return version
}

export const deleteUserWorkflow = (userId: string, workflowId: string): boolean => {
  const storage = getUserStorage(userId)
  const previousLength = storage.workflows.length
  storage.workflows = storage.workflows.filter((workflow) => workflow.id !== workflowId)
  if (storage.workflows.length !== previousLength) {
    storage.versions = storage.versions.filter((version) => version.workflowId !== workflowId)
  }
  return storage.workflows.length !== previousLength
}

export const getUserWorkflowVersions = (userId: string, workflowId: string): ServerWorkflowVersion[] =>
  getUserStorage(userId)
    .versions
    .filter((version) => version.workflowId === workflowId)
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((version) => cloneJson(version))

export const getUserWorkflowVersion = (
  userId: string,
  workflowId: string,
  versionId: string,
): ServerWorkflowVersion | null =>
  cloneJson(
    getUserStorage(userId).versions.find(
      (version) => version.workflowId === workflowId && version.id === versionId,
    ) ?? null,
  )

export const rollbackUserWorkflowVersion = (
  userId: string,
  workflowId: string,
  versionId: string,
): { workflow: ServerSavedWorkflow; version: ServerWorkflowVersion } | null => {
  const targetVersion = getUserStorage(userId).versions.find(
    (version) => version.workflowId === workflowId && version.id === versionId,
  )
  if (!targetVersion) return null

  const restoredWorkflow: ServerSavedWorkflow = {
    ...cloneJson(targetVersion.workflow),
    updatedAt: Date.now(),
  }
  const rollbackVersion = saveUserWorkflow(userId, restoredWorkflow, 'rollback')
  return {
    workflow: cloneJson(restoredWorkflow),
    version: cloneJson(rollbackVersion),
  }
}

export const getUserHistory = (userId: string): ServerExecutionRecord[] =>
  [...getUserStorage(userId).history].sort((a, b) => (b.startTime || 0) - (a.startTime || 0))

export const saveUserHistory = (
  userId: string,
  record: ServerExecutionRecord,
  limit = 20,
): ServerExecutionRecord[] => {
  const storage = getUserStorage(userId)
  storage.history = [record, ...storage.history.filter((item) => item.id !== record.id)].slice(0, limit)
  return getUserHistory(userId)
}

export const clearUserHistory = (userId: string): void => {
  getUserStorage(userId).history = []
}
