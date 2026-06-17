/**
 * Notebook 会话持久化（localStorage）。
 *
 * 目的：让「继续上次分析」在刷新页面 / 重进工作流后仍能找到上次的 sessionId，
 * 从而走 resume 路径（秒开 + 历史回放），而非每次都新建 session 重启 Pyodide。
 *
 * 作用域：同一次浏览器会话内（服务端 sessionStore 为内存态，服务重启即失效）。
 * 前端在 resume 前会先探测后端 session 是否仍存活，失效则降级为新建。
 *
 * 按 userId 隔离 key，避免多用户串扰（与 workflowRequestContext 的 user 解析一致）。
 */
import { resolveWorkflowRequestUser } from '@/services/workflowRequestContext'
import type { ImportCsvMeta } from '@/notebook/shared/parentBridge'

export interface PersistedNotebookSession {
  sessionId: string
  /** 创建时的数据来源 meta（用于「继续上次分析」卡片展示） */
  initialDataMeta?: ImportCsvMeta
  /** 持久化写入时间戳 */
  savedAt: number
}

const STORAGE_KEY_PREFIX = 'notebook:last-session'

const resolveStorageKey = (): string => {
  const user = resolveWorkflowRequestUser()
  return `${STORAGE_KEY_PREFIX}:${user.id}`
}

const resolveBrowserStorage = (): Storage | null => {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

/** 读取上次持久化的 notebook session（不存在返回 null）。 */
export const readPersistedNotebookSession = (): PersistedNotebookSession | null => {
  const storage = resolveBrowserStorage()
  if (!storage) return null
  const raw = storage.getItem(resolveStorageKey())
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as PersistedNotebookSession
    if (typeof parsed?.sessionId === 'string' && parsed.sessionId.length > 0) {
      return parsed
    }
  } catch {
    // 损坏数据：清掉，避免反复解析失败
    storage.removeItem(resolveStorageKey())
  }
  return null
}

/** 持久化当前 notebook session（创建 / 切换后调用）。 */
export const writePersistedNotebookSession = (
  session: PersistedNotebookSession,
): void => {
  const storage = resolveBrowserStorage()
  if (!storage) return
  storage.setItem(resolveStorageKey(), JSON.stringify(session))
}

/** 清除持久化的 notebook session（后端 session 已失效 / 用户显式新建时调用）。 */
export const clearPersistedNotebookSession = (): void => {
  const storage = resolveBrowserStorage()
  if (!storage) return
  storage.removeItem(resolveStorageKey())
}
