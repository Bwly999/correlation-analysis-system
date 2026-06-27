import { createWorkflowApiAuthHeaders } from '@/services/apiAuth'
import { encodeWorkflowHeaderValue } from '@/shared/workflowHeaderEncoding'

const WORKFLOW_USER_ID_STORAGE_KEY = 'workflow-storage-user-id'
const WORKFLOW_USER_NAME_STORAGE_KEY = 'workflow-storage-user-name'
const FALLBACK_WORKFLOW_USER_NAME = '默认用户'
// dev 模式下使用固定用户标识，避免 localStorage 丢失导致按 user 隔离的历史会话找不到
const DEV_WORKFLOW_USER_ID = 'dev-workflow-user'

export type WorkflowRequestUser = {
  id: string
  name: string
}

const resolveBrowserStorage = () => {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

const getOrCreateFallbackWorkflowUser = (): WorkflowRequestUser => {
  // dev 模式固定用户，保证 x-workflow-user-id/name 稳定，历史会话可复现
  if (import.meta.env.MODE === 'development') {
    return {
      id: DEV_WORKFLOW_USER_ID,
      name: FALLBACK_WORKFLOW_USER_NAME,
    }
  }

  const storage = resolveBrowserStorage()
  const generatedId = `local-workflow-user-${Math.random().toString(36).slice(2, 10)}`
  if (!storage) {
    return {
      id: generatedId,
      name: FALLBACK_WORKFLOW_USER_NAME,
    }
  }

  const cachedId = storage.getItem(WORKFLOW_USER_ID_STORAGE_KEY)?.trim()
  const cachedName = storage.getItem(WORKFLOW_USER_NAME_STORAGE_KEY)?.trim()
  if (cachedId) {
    return {
      id: cachedId,
      name: cachedName || FALLBACK_WORKFLOW_USER_NAME,
    }
  }

  storage.setItem(WORKFLOW_USER_ID_STORAGE_KEY, generatedId)
  storage.setItem(WORKFLOW_USER_NAME_STORAGE_KEY, FALLBACK_WORKFLOW_USER_NAME)
  return {
    id: generatedId,
    name: FALLBACK_WORKFLOW_USER_NAME,
  }
}

export const resolveWorkflowRequestUser = (): WorkflowRequestUser => {
  const envUserId = import.meta.env.VITE_WORKFLOW_USER_ID?.trim()
  const envUserName = import.meta.env.VITE_WORKFLOW_USER_NAME?.trim()
  const fallbackUser = getOrCreateFallbackWorkflowUser()
  const userId = envUserId || fallbackUser.id
  const userName = envUserName || fallbackUser.name || FALLBACK_WORKFLOW_USER_NAME

  return {
    id: userId,
    name: userName,
  }
}

export const createWorkflowRequestHeaders = (
  extraHeaders: Record<string, string> = {},
): Record<string, string> => {
  const authHeaders = createWorkflowApiAuthHeaders()
  const user = resolveWorkflowRequestUser()

  return {
    ...authHeaders,
    'x-workflow-user-id': encodeWorkflowHeaderValue(user.id),
    'x-workflow-user-name': encodeWorkflowHeaderValue(user.name),
    ...extraHeaders,
  }
}
