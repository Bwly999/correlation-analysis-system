import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { WorkflowAiPlanRequest } from '../../ai/types.js'

const baseRequest: WorkflowAiPlanRequest = {
  mode: 'create',
  prompt: '创建一个工作流',
  profile: {
    id: 'custom',
    name: '测试模型',
    baseUrl: 'http://example.com',
    model: 'test',
    apiKey: 'secret',
    enabled: true,
    source: 'custom',
  },
  nodeCatalog: [],
}

describe('workflowAi sessionStore', () => {
  let tempDir = ''
  let storeFile = ''

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(tmpdir(), 'workflow-ai-session-store-'))
    storeFile = path.join(tempDir, 'sessions.json')
    vi.stubEnv('WORKFLOW_AI_SESSION_STORE_FILE', storeFile)
    vi.resetModules()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('persists session records to disk after creation and update', async () => {
    const sessionStore = await import('../workflowAi/sessionStore.js')
    const session = sessionStore.createWorkflowAiSession(baseRequest)

    sessionStore.updateWorkflowAiSession(session.sessionId, (record) => {
      record.state.status = 'running'
    })

    const persisted = JSON.parse(readFileSync(storeFile, 'utf-8')) as Record<string, unknown>
    expect(Object.keys(persisted)).toHaveLength(1)
    expect((persisted[session.sessionId] as any).state.status).toBe('running')
  })

  it('prunes expired session records when they exceed the ttl window', async () => {
    vi.stubEnv('WORKFLOW_AI_SESSION_TTL_MS', '10')
    const sessionStore = await import('../workflowAi/sessionStore.js')
    const session = sessionStore.createWorkflowAiSession(baseRequest)

    const persisted = JSON.parse(readFileSync(storeFile, 'utf-8')) as Record<string, any>
    persisted[session.sessionId].updatedAt = Date.now() - 60_000
    persisted[session.sessionId].createdAt = Date.now() - 60_000
    persisted[session.sessionId].state.updatedAt = undefined
    persisted[session.sessionId].request.prompt = '过期会话'
    persisted.extra = {
      createdAt: Date.now() - 60_000,
      updatedAt: Date.now() - 60_000,
      request: baseRequest,
      state: session,
    }

    rmSync(storeFile, { force: true })
    await import('node:fs/promises').then(({ writeFile }) => writeFile(storeFile, JSON.stringify(persisted), 'utf-8'))

    vi.resetModules()
    const reloadedStore = await import('../workflowAi/sessionStore.js')

    expect(reloadedStore.getWorkflowAiSession(session.sessionId)).toBeNull()
    expect(reloadedStore.getWorkflowAiSession('extra')).toBeNull()
  })
})
