// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createServerApp } from '../app.js'
import { noopApiCallTracker } from '../apiCallTracking/apiCallTracker.js'

// 单元测试统一注入 no-op tracker，避免默认工厂在 onClose 时连接 MySQL 抛错
const createTestApp = () => createServerApp({ apiCallTracker: noopApiCallTracker })

describe('workflow-scoped route contract', () => {
  beforeEach(() => {
    vi.stubEnv('WORKFLOW_STORAGE_DATA_DIR', mkdtempSync(join(tmpdir(), 'cas-workflow-scoped-')))
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('returns the same missing-user error across workflow-scoped routes', async () => {
    const app = createTestApp()
    const expectedMessage = '缺少用户标识，请通过 x-workflow-user-id 请求头或 defaultUser 依赖注入提供用户'
    const workflowRequests = [
      {
        name: 'storage',
        request: {
          method: 'GET',
          url: '/api/storage/me',
        },
        assertBody: (body: unknown) => {
          expect(body).toEqual({ message: expectedMessage })
        },
      },
      {
        name: 'pi-agent',
        request: {
          method: 'POST',
          url: '/api/pi-agent/sessions',
          payload: {
            mode: 'edit',
            prompt: '帮我分析当前画布',
            profile: { id: 'custom', name: '测试模型', baseUrl: 'http://example.com', model: 'glm-4.7', enabled: true, source: 'custom' },
            nodeCatalog: [],
          },
        },
        assertBody: (body: unknown) => {
          expect(body).toEqual({ message: expectedMessage })
        },
      },
    ]

    for (const candidate of workflowRequests) {
      const response = await app.inject(candidate.request)
      expect(response.statusCode, candidate.name).toBe(400)
      candidate.assertBody(response.json())
    }
    await app.close()
  })

  it('keeps analysis proxy routes outside the workflow-user requirement', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      status: 'success',
      results: { summary: { ok: true } },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetchMock)
    const app = createTestApp()
    const response = await app.inject({
      method: 'POST',
      url: '/api/analysis/lasso',
      payload: {
        data: [{ target: 1, f1: 2 }],
        target: 'target',
        config: {},
      },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      status: 'success',
      results: { summary: { ok: true } },
    })
    await app.close()
  })

  it('returns the full workflow request header allowlist for CORS preflight', async () => {
    const app = createTestApp()
    const response = await app.inject({
      method: 'OPTIONS',
      url: '/api/pi-agent/sessions/session_1/messages',
      headers: {
        origin: 'http://localhost:5173',
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'authorization,x-workflow-user-id,x-workflow-user-name,content-type',
      },
    })

    expect(response.statusCode).toBe(204)
    expect(response.headers['access-control-allow-origin']).toBe('*')
    expect(response.headers['access-control-allow-methods']).toBe('GET,POST,OPTIONS')
    expect(response.headers['access-control-allow-headers']).toBe(
      'Content-Type, Authorization, x-workflow-user-id, x-workflow-user-name',
    )
    await app.close()
  })
})
