import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createWorkflowRequestHeaders,
  resolveWorkflowRequestUser,
} from '../workflowRequestContext'

type MemoryStorage = {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
  removeItem: (key: string) => void
  clear: () => void
}

const createMemoryStorage = (): MemoryStorage => {
  const store = new Map<string, string>()
  return {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => {
      store.set(key, value)
    },
    removeItem: (key) => {
      store.delete(key)
    },
    clear: () => {
      store.clear()
    },
  }
}

describe('workflowRequestContext', () => {
  beforeEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    delete (globalThis as typeof globalThis & { __WORKFLOW_API_AUTH_TOKEN__?: string }).__WORKFLOW_API_AUTH_TOKEN__
  })

  it('prefers env-configured workflow user and encodes workflow headers', () => {
    vi.stubEnv('VITE_WORKFLOW_USER_ID', '用户-1')
    vi.stubEnv('VITE_WORKFLOW_USER_NAME', '测试用户')
    ;(globalThis as typeof globalThis & { __WORKFLOW_API_AUTH_TOKEN__?: string }).__WORKFLOW_API_AUTH_TOKEN__ =
      'jwt-from-host'

    expect(resolveWorkflowRequestUser()).toEqual({
      id: '用户-1',
      name: '测试用户',
    })
    expect(createWorkflowRequestHeaders({
      'Content-Type': 'application/json',
    })).toEqual({
      Authorization: 'Bearer jwt-from-host',
      'x-workflow-user-id': encodeURIComponent('用户-1'),
      'x-workflow-user-name': encodeURIComponent('测试用户'),
      'Content-Type': 'application/json',
    })
  })

  it('creates a stable fallback workflow user in browser storage', () => {
    const storage = createMemoryStorage()
    vi.stubGlobal('localStorage', storage)

    const first = resolveWorkflowRequestUser()
    const second = resolveWorkflowRequestUser()

    expect(first.id).toMatch(/^local-workflow-user-/)
    expect(first.name).toBe('默认用户')
    expect(second).toEqual(first)
    expect(storage.getItem('workflow-storage-user-id')).toBe(first.id)
    expect(storage.getItem('workflow-storage-user-name')).toBe('默认用户')
  })

  it('merges caller-provided headers when creating workflow request headers', () => {
    vi.stubEnv('VITE_WORKFLOW_USER_ID', 'user_fetch')
    vi.stubEnv('VITE_WORKFLOW_USER_NAME', '抓取用户')
    expect(createWorkflowRequestHeaders({
      Accept: 'application/x-ndjson',
    })).toEqual({
      'x-workflow-user-id': 'user_fetch',
      'x-workflow-user-name': encodeURIComponent('抓取用户'),
      Accept: 'application/x-ndjson',
    })
  })
})
