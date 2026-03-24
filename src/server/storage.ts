type ServerSavedWorkflow = {
  id: string
  name: string
  updatedAt: number
  nodes: unknown[]
  edges: unknown[]
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
  history: ServerExecutionRecord[]
}

const userStorageMap = new Map<string, ServerUserStorage>()

const getUserStorage = (userId: string): ServerUserStorage => {
  const existing = userStorageMap.get(userId)
  if (existing) return existing

  const created: ServerUserStorage = {
    workflows: [],
    history: [],
  }
  userStorageMap.set(userId, created)
  return created
}

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

export const saveUserWorkflow = (userId: string, workflow: ServerSavedWorkflow): void => {
  const storage = getUserStorage(userId)
  storage.workflows = storage.workflows.filter((item) => item.id !== workflow.id).concat(workflow)
}

export const deleteUserWorkflow = (userId: string, workflowId: string): boolean => {
  const storage = getUserStorage(userId)
  const previousLength = storage.workflows.length
  storage.workflows = storage.workflows.filter((workflow) => workflow.id !== workflowId)
  return storage.workflows.length !== previousLength
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
