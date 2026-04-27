type WorkflowApiAuthGlobal = typeof globalThis & {
  __WORKFLOW_API_AUTH_TOKEN__?: string
}

export const resolveWorkflowApiAuthToken = (): string | null => {
  const globalToken = (globalThis as WorkflowApiAuthGlobal).__WORKFLOW_API_AUTH_TOKEN__?.trim()
  if (globalToken) return globalToken

  const envToken = import.meta.env.VITE_WORKFLOW_API_AUTH_TOKEN?.trim()
  return envToken || null
}

export const createWorkflowApiAuthHeaders = (): Record<string, string> => {
  const token = resolveWorkflowApiAuthToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}
