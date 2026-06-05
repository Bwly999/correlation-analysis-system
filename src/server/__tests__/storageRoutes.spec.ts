// @vitest-environment node

import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHmac } from 'node:crypto'
import { mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createServerApp } from '../app.js'
import { createStorageCompositionRoot } from '../bootstrap/storageCompositionRoot.js'

const apps: FastifyInstance[] = []

const createTestApp = (options?: Parameters<typeof createServerApp>[0]) => {
  const app = createServerApp(options)
  apps.push(app)
  return app
}

const request = (
  app: FastifyInstance,
  method: string,
  url: string,
  payload?: unknown,
  headers?: Record<string, string>,
) => app.inject({ method, url, payload, headers: headers ?? {} })

const workflowHeaders = (userId: string, userName = '服务端用户') => ({
  'x-workflow-user-id': userId,
  'x-workflow-user-name': userName,
})

const base64UrlEncode = (value: unknown) =>
  Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url')

const createJwtToken = (payload: Record<string, unknown>, secret = 'route-secret') => {
  const header = base64UrlEncode({ alg: 'HS256', typ: 'JWT' })
  const body = base64UrlEncode(payload)
  const signature = createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url')
  return `${header}.${body}.${signature}`
}

const loadAppFresh = async () => {
  vi.resetModules()
  const appModule = await import('../app.js')
  const app = appModule.createServerApp()
  apps.push(app)
  return app
}

afterEach(async () => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()

  while (apps.length > 0) {
    await apps.pop()!.close()
  }
})

beforeEach(() => {
  vi.stubEnv('WORKFLOW_STORAGE_DATA_DIR', mkdtempSync(join(tmpdir(), 'cas-storage-test-')))
})

describe('storage routes', () => {
  it('allows explicit dependency injection for storage user resolution', async () => {
    const root = createStorageCompositionRoot()
    const app = createTestApp({
      storageService: root.storageService,
      resolveStorageUser: () => ({
        id: 'injected-user',
        name: '注入用户',
      }),
    })

    const response = await request(app, 'GET', '/api/storage/me')

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      id: 'injected-user',
      name: '注入用户',
    })
  })

  it('exposes the current storage user', async () => {
    const app = createTestApp()

    const response = await request(app, 'GET', '/api/storage/me', undefined, workflowHeaders('server-user-1'))

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      id: 'server-user-1',
      name: '服务端用户',
    })
  })

  it('resolves the current user from a valid JWT when auth is enabled', async () => {
    vi.stubEnv('WORKFLOW_JWT_SECRET', 'route-secret')
    const app = createTestApp()
    const token = createJwtToken({
      w3Account: 'jwt-user-1',
      cnName: 'JWT 用户',
      exp: Math.floor(Date.now() / 1000) + 60,
    })

    const response = await request(app, 'GET', '/api/storage/me', undefined, {
      authorization: `Bearer ${token}`,
      'x-workflow-user-id': 'spoofed-user',
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      id: 'jwt-user-1',
      name: 'JWT 用户',
    })
  })

  it('falls back to default storage user when request headers do not provide workflow user', async () => {
    const app = createTestApp({
      defaultStorageUser: {
        id: 'default-user-1',
        name: '默认注入用户',
      },
    })

    const response = await request(app, 'GET', '/api/storage/me')

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      id: 'default-user-1',
      name: '默认注入用户',
    })
  })

  it('rejects node api requests without JWT when auth is enabled', async () => {
    vi.stubEnv('WORKFLOW_JWT_SECRET', 'route-secret')
    const app = createTestApp()

    const response = await request(app, 'GET', '/api/pi-agent/model-profiles')

    expect(response.statusCode).toBe(401)
    expect(response.json()).toEqual({
      message: '缺少 Authorization Bearer token',
    })
  })

  it('keeps CORS preflight requests public when auth is enabled', async () => {
    vi.stubEnv('WORKFLOW_JWT_SECRET', 'route-secret')
    const app = createTestApp()

    const response = await request(app, 'OPTIONS', '/api/storage/me')

    expect(response.statusCode).toBe(204)
    expect(response.body).toBe('')
  })

  it('isolates workflows by current user', async () => {
    const app = createTestApp()

    await request(
      app,
      'POST',
      '/api/storage/workflows',
      { id: 'wf_user_a', name: '用户A工作流', updatedAt: 1, nodes: [], edges: [] },
      workflowHeaders('user-a', '用户A'),
    )
    await request(
      app,
      'POST',
      '/api/storage/workflows',
      { id: 'wf_user_b', name: '用户B工作流', updatedAt: 2, nodes: [], edges: [] },
      workflowHeaders('user-b', '用户B'),
    )

    const response = await request(app, 'GET', '/api/storage/workflows', undefined, workflowHeaders('user-a', '用户A'))

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual([
      expect.objectContaining({
        id: 'wf_user_a',
        name: '用户A工作流',
      }),
    ])
  })

  it('lists workflow versions in reverse chronological order and supports version detail plus rollback', async () => {
    const app = createTestApp()

    await request(
      app,
      'POST',
      '/api/storage/workflows',
      {
        id: 'wf_versions',
        name: '版本工作流',
        updatedAt: 10,
        nodes: [{ id: 'node_v1' }],
        edges: [],
      },
      workflowHeaders('version-user', '版本用户'),
    )
    await request(
      app,
      'POST',
      '/api/storage/workflows',
      {
        id: 'wf_versions',
        name: '版本工作流',
        updatedAt: 20,
        nodes: [{ id: 'node_v2' }],
        edges: [],
      },
      workflowHeaders('version-user', '版本用户'),
    )

    const versionsResponse = await request(
      app,
      'GET',
      '/api/storage/workflows/wf_versions/versions',
      undefined,
      workflowHeaders('version-user', '版本用户'),
    )

    expect(versionsResponse.statusCode).toBe(200)
    const versions = versionsResponse.json()
    expect(versions).toEqual([
      expect.objectContaining({
        workflowId: 'wf_versions',
        workflowName: '版本工作流',
        source: 'save',
      }),
      expect.objectContaining({
        workflowId: 'wf_versions',
        workflowName: '版本工作流',
        source: 'save',
      }),
    ])
    expect(versions[0].createdAt).toBeGreaterThanOrEqual(versions[1].createdAt)
    expect(versions[0].workflowUpdatedAt).toBe(20)
    expect(versions[1].workflowUpdatedAt).toBe(10)

    const versionDetailResponse = await request(
      app,
      'GET',
      `/api/storage/workflows/wf_versions/versions/${encodeURIComponent(versions[1].id)}`,
      undefined,
      workflowHeaders('version-user', '版本用户'),
    )

    expect(versionDetailResponse.statusCode).toBe(200)
    expect(versionDetailResponse.json()).toEqual(
      expect.objectContaining({
        id: versions[1].id,
        workflowId: 'wf_versions',
        workflow: expect.objectContaining({
          updatedAt: 10,
          nodes: [{ id: 'node_v1' }],
        }),
      }),
    )

    const rollbackResponse = await request(
      app,
      'POST',
      `/api/storage/workflows/wf_versions/versions/${encodeURIComponent(versions[1].id)}/rollback`,
      undefined,
      workflowHeaders('version-user', '版本用户'),
    )

    expect(rollbackResponse.statusCode).toBe(200)
    expect(rollbackResponse.json()).toEqual({
      workflow: expect.objectContaining({
        id: 'wf_versions',
        nodes: [{ id: 'node_v1' }],
      }),
      version: expect.objectContaining({
        workflowId: 'wf_versions',
        source: 'rollback',
      }),
    })

    const currentWorkflowResponse = await request(
      app,
      'GET',
      '/api/storage/workflows/wf_versions',
      undefined,
      workflowHeaders('version-user', '版本用户'),
    )
    expect(currentWorkflowResponse.json()).toEqual(
      expect.objectContaining({
        id: 'wf_versions',
        nodes: [{ id: 'node_v1' }],
      }),
    )
  })

  it('returns compact history summaries and full record detail through separate endpoints', async () => {
    const app = createTestApp()

    await request(
      app,
      'POST',
      '/api/storage/history',
      {
        record: {
          id: 'exec_summary_1',
          workflowId: 'wf_1',
          workflowName: '历史工作流',
          startTime: 100,
          duration: 20,
          status: 'success',
          nodes: [{ id: 'node_1' }],
          edges: [{ id: 'edge_1' }],
        },
        limit: 20,
      },
      workflowHeaders('history-summary-user', '历史摘要用户'),
    )

    const summaryResponse = await request(
      app,
      'GET',
      '/api/storage/history/summaries',
      undefined,
      workflowHeaders('history-summary-user', '历史摘要用户'),
    )

    expect(summaryResponse.statusCode).toBe(200)
    expect(summaryResponse.json()).toEqual([
      {
        id: 'exec_summary_1',
        workflowId: 'wf_1',
        workflowName: '历史工作流',
        startTime: 100,
        duration: 20,
        status: 'success',
      },
    ])

    const detailResponse = await request(
      app,
      'GET',
      '/api/storage/history/exec_summary_1',
      undefined,
      workflowHeaders('history-summary-user', '历史摘要用户'),
    )

    expect(detailResponse.statusCode).toBe(200)
    expect(detailResponse.json()).toEqual(
      expect.objectContaining({
        id: 'exec_summary_1',
        nodes: [{ id: 'node_1' }],
        edges: [{ id: 'edge_1' }],
      }),
    )
  })

  it('returns 404 when a history record detail does not exist', async () => {
    const app = createTestApp()

    const response = await request(
      app,
      'GET',
      '/api/storage/history/missing',
      undefined,
      workflowHeaders('history-missing-user', '历史缺失用户'),
    )

    expect(response.statusCode).toBe(404)
    expect(response.json()).toEqual({ message: '未找到运行记录' })
  })

  it('proxies analysis requests to the python backend and preserves upstream errors', async () => {
    vi.stubEnv('PYTHON_ANALYSIS_API_BASE_URL', 'http://127.0.0.1:9000')
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json; charset=utf-8' },
        text: async () => JSON.stringify({ status: 'success', results: { summary: { ok: true } } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json; charset=utf-8' },
        text: async () => JSON.stringify({ status: 'success', results: { summary: { ok: true } } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json; charset=utf-8' },
        text: async () => JSON.stringify({ status: 'success', results: { summary: { ok: true } } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json; charset=utf-8' },
        text: async () => JSON.stringify({ status: 'success', results: { summary: { ok: true } } }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        headers: { get: () => 'application/json; charset=utf-8' },
        text: async () => JSON.stringify({ detail: '目标字段不存在' }),
      })
    vi.stubGlobal('fetch', fetchMock)
    const app = createTestApp()

    const cases = [
      [
        '/api/analysis/lasso',
        { data: [{ target: 1, f1: 2 }], target: 'target', config: { alpha: 0.1 } },
        'http://127.0.0.1:9000/analyze/lasso',
      ],
      [
        '/api/analysis/multiple-linear-regression',
        { data: [{ target: 1, f1: 2 }], target: 'target', config: { factorNames: ['f1'] } },
        'http://127.0.0.1:9000/analyze/multiple-linear-regression',
      ],
      [
        '/api/analysis/random-forest-feature-importance',
        { data: [{ target: 1, f1: 2 }], target: 'target', config: { factorNames: ['f1'], nEstimators: 200 } },
        'http://127.0.0.1:9000/analyze/random-forest-feature-importance',
      ],
      [
        '/api/analysis/logistic-regression-classification',
        { data: [{ label: 'A', f1: 2 }], target: 'label', config: { factorNames: ['f1'] } },
        'http://127.0.0.1:9000/analyze/logistic-regression-classification',
      ],
    ] as const

    for (const [url, payload, targetUrl] of cases) {
      const response = await request(app, 'POST', url, payload)
      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual({
        status: 'success',
        results: { summary: { ok: true } },
      })
      expect(fetchMock).toHaveBeenCalledWith(targetUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })
    }

    const errorResponse = await request(
      app,
      'POST',
      '/api/analysis/xgboost-shap',
      { data: [{ target: 1, f1: 2 }], target: 'missing_target', config: {} },
    )
    expect(errorResponse.statusCode).toBe(400)
    expect(errorResponse.json()).toEqual({ detail: '目标字段不存在' })
  })

  it('accepts larger analysis payloads within the raised 20MB body limit', async () => {
    vi.stubEnv('PYTHON_ANALYSIS_API_BASE_URL', 'http://127.0.0.1:9000')
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json; charset=utf-8' },
      text: async () => JSON.stringify({ status: 'success', results: { summary: { ok: true } } }),
    })
    vi.stubGlobal('fetch', fetchMock)
    const app = createTestApp()

    expect(app.initialConfig.bodyLimit).toBe(20 * 1024 * 1024)

    const oversizedByOldLimit = 'x'.repeat(1024 * 1024 + 2048)
    const payload = {
      data: Array.from({ length: 2 }, (_, index) => ({
        target: index + 1,
        f1: index + 2,
        comment: oversizedByOldLimit,
      })),
      target: 'target',
      config: { factorNames: ['f1'] },
    }

    const response = await request(app, 'POST', '/api/analysis/xgboost-shap', payload)

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      status: 'success',
      results: { summary: { ok: true } },
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('surfaces a clear error when the python analysis backend is unreachable', async () => {
    vi.stubEnv('PYTHON_ANALYSIS_API_BASE_URL', 'http://127.0.0.1:9000')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')))
    const app = createTestApp()

    const response = await request(
      app,
      'POST',
      '/api/analysis/lasso',
      { data: [{ target: 1, f1: 2 }], target: 'target', config: { alpha: 0.1 } },
    )

    expect(response.statusCode).toBe(502)
    expect(response.json()).toEqual({
      message: 'Python 分析服务不可用，请确认算法后端已启动',
      diagnostics: {
        targetUrl: 'http://127.0.0.1:9000/analyze/lasso',
        cause: 'fetch failed',
      },
    })
  })

  it('persists workflows and history after reloading the server module', async () => {
    const storageDir = mkdtempSync(join(tmpdir(), 'cas-storage-routes-'))
    vi.stubEnv('WORKFLOW_STORAGE_DATA_DIR', storageDir)

    const initialApp = await loadAppFresh()
    await request(
      initialApp,
      'POST',
      '/api/storage/workflows',
      {
        id: 'wf_persisted',
        name: '持久化工作流',
        updatedAt: 50,
        nodes: [{ id: 'node_persisted_v1' }],
        edges: [],
      },
      workflowHeaders('persist-user', '持久化用户'),
    )
    await request(
      initialApp,
      'POST',
      '/api/storage/history',
      {
        record: {
          id: 'exec_1',
          workflowId: 'wf_1',
          workflowName: '历史工作流',
          startTime: 100,
          duration: 20,
          status: 'success',
          nodes: [],
          edges: [],
        },
        limit: 20,
      },
      workflowHeaders('persist-user', '持久化用户'),
    )

    const reloadedApp = await loadAppFresh()
    const workflowResponse = await request(
      reloadedApp,
      'GET',
      '/api/storage/workflows/wf_persisted',
      undefined,
      workflowHeaders('persist-user', '持久化用户'),
    )
    expect(workflowResponse.statusCode).toBe(200)
    expect(workflowResponse.json()).toEqual(
      expect.objectContaining({
        id: 'wf_persisted',
        name: '持久化工作流',
      }),
    )

    const versionsResponse = await request(
      reloadedApp,
      'GET',
      '/api/storage/workflows/wf_persisted/versions',
      undefined,
      workflowHeaders('persist-user', '持久化用户'),
    )
    expect(versionsResponse.json()).toEqual([
      expect.objectContaining({
        workflowId: 'wf_persisted',
        source: 'save',
      }),
    ])

    const historyResponse = await request(
      reloadedApp,
      'GET',
      '/api/storage/history',
      undefined,
      workflowHeaders('persist-user', '持久化用户'),
    )
    expect(historyResponse.statusCode).toBe(200)
    expect(historyResponse.json()).toEqual([
      expect.objectContaining({
        id: 'exec_1',
        workflowName: '历史工作流',
      }),
    ])
  })
})
