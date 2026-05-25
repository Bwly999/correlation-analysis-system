// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHmac } from 'node:crypto'
import { Readable } from 'node:stream'
import { mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { createServerHandler } from '../app.js'
import { createStorageCompositionRoot } from '../bootstrap/storageCompositionRoot.js'

type MockResponse = ServerResponse & {
  body: string
  headersMap: Record<string, string>
}

const createRequest = (method: string, url: string, body?: unknown, headers?: Record<string, string>) => {
  const payload = body === undefined ? '' : JSON.stringify(body)
  const stream = Readable.from(payload ? [payload] : []) as IncomingMessage
  stream.method = method
  stream.url = url
  stream.headers = headers ?? {}
  return stream
}

const createResponse = () => {
  const headersMap: Record<string, string> = {}
  const response = {
    statusCode: 200,
    body: '',
    headersMap,
    setHeader(name: string, value: string) {
      headersMap[name] = value
      return this
    },
    end(chunk?: string) {
      this.body = chunk ?? ''
      return this
    },
  } as MockResponse

  return response
}

const base64UrlEncode = (value: unknown) =>
  Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url')

const createJwtToken = (payload: Record<string, unknown>, secret = 'route-secret') => {
  const header = base64UrlEncode({ alg: 'HS256', typ: 'JWT' })
  const body = base64UrlEncode(payload)
  const signature = createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url')
  return `${header}.${body}.${signature}`
}

const loadHandlerFresh = async () => {
  vi.resetModules()
  const appModule = await import('../app.js')
  return appModule.createServerHandler()
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

beforeEach(() => {
  vi.stubEnv('WORKFLOW_STORAGE_DATA_DIR', mkdtempSync(join(tmpdir(), 'cas-storage-test-')))
})

describe('storage routes', () => {
  it('should allow explicit dependency injection for storage user resolution', async () => {
    const root = createStorageCompositionRoot()
    const handler = createServerHandler({
      storageService: root.storageService,
      resolveStorageUser: () => ({
        id: 'injected-user',
        name: '注入用户',
      }),
    })
    const response = createResponse()

    await handler(createRequest('GET', '/api/storage/me'), response)

    expect(response.statusCode).toBe(200)
    expect(JSON.parse(response.body)).toEqual({
      id: 'injected-user',
      name: '注入用户',
    })
  })

  it('should expose the current storage user', async () => {
    const handler = createServerHandler()
    const request = createRequest('GET', '/api/storage/me', undefined, {
      'x-workflow-user-id': 'server-user-1',
      'x-workflow-user-name': '服务端用户',
    })
    const response = createResponse()

    await handler(request, response)

    expect(response.statusCode).toBe(200)
    expect(JSON.parse(response.body)).toEqual({
      id: 'server-user-1',
      name: '服务端用户',
    })
  })

  it('should resolve the current user from a valid JWT when auth is enabled', async () => {
    vi.stubEnv('WORKFLOW_JWT_SECRET', 'route-secret')
    const handler = createServerHandler()
    const token = createJwtToken({
      w3Account: 'jwt-user-1',
      cnName: 'JWT 用户',
      exp: Math.floor(Date.now() / 1000) + 60,
    })
    const response = createResponse()

    await handler(
      createRequest('GET', '/api/storage/me', undefined, {
        authorization: `Bearer ${token}`,
        'x-workflow-user-id': 'spoofed-user',
      }),
      response,
    )

    expect(response.statusCode).toBe(200)
    expect(JSON.parse(response.body)).toEqual({
      id: 'jwt-user-1',
      name: 'JWT 用户',
    })
  })

  it('should fallback to default storage user when request headers do not provide workflow user', async () => {
    const handler = createServerHandler({
      defaultStorageUser: {
        id: 'default-user-1',
        name: '默认注入用户',
      },
    })
    const response = createResponse()

    await handler(createRequest('GET', '/api/storage/me'), response)

    expect(response.statusCode).toBe(200)
    expect(JSON.parse(response.body)).toEqual({
      id: 'default-user-1',
      name: '默认注入用户',
    })
  })

  it('should reject node api requests without JWT when auth is enabled', async () => {
    vi.stubEnv('WORKFLOW_JWT_SECRET', 'route-secret')
    const handler = createServerHandler()
    const response = createResponse()

    await handler(createRequest('GET', '/api/workflow-ai/model-profiles'), response)

    expect(response.statusCode).toBe(401)
    expect(JSON.parse(response.body)).toEqual({
      message: '缺少 Authorization Bearer token',
    })
  })

  it('should keep CORS preflight requests public when auth is enabled', async () => {
    vi.stubEnv('WORKFLOW_JWT_SECRET', 'route-secret')
    const handler = createServerHandler()
    const response = createResponse()

    await handler(createRequest('OPTIONS', '/api/storage/me'), response)

    expect(response.statusCode).toBe(204)
    expect(response.body).toBe('')
  })

  it('should isolate workflows by current user', async () => {
    const handler = createServerHandler()

    await handler(
      createRequest(
        'POST',
        '/api/storage/workflows',
        { id: 'wf_user_a', name: '用户A工作流', updatedAt: 1, nodes: [], edges: [] },
        { 'x-workflow-user-id': 'user-a' },
      ),
      createResponse(),
    )

    await handler(
      createRequest(
        'POST',
        '/api/storage/workflows',
        { id: 'wf_user_b', name: '用户B工作流', updatedAt: 2, nodes: [], edges: [] },
        { 'x-workflow-user-id': 'user-b' },
      ),
      createResponse(),
    )

    const response = createResponse()
    await handler(createRequest('GET', '/api/storage/workflows', undefined, { 'x-workflow-user-id': 'user-a' }), response)

    expect(response.statusCode).toBe(200)
    expect(JSON.parse(response.body)).toEqual([
      expect.objectContaining({
        id: 'wf_user_a',
        name: '用户A工作流',
      }),
    ])
  })

  it('should list workflow versions in reverse chronological order', async () => {
    const handler = createServerHandler()

    await handler(
      createRequest(
        'POST',
        '/api/storage/workflows',
        {
          id: 'wf_versions',
          name: '版本工作流',
          updatedAt: 10,
          nodes: [{ id: 'node_v1' }],
          edges: [],
        },
        { 'x-workflow-user-id': 'version-user' },
      ),
      createResponse(),
    )

    await handler(
      createRequest(
        'POST',
        '/api/storage/workflows',
        {
          id: 'wf_versions',
          name: '版本工作流',
          updatedAt: 20,
          nodes: [{ id: 'node_v2' }],
          edges: [],
        },
        { 'x-workflow-user-id': 'version-user' },
      ),
      createResponse(),
    )

    const response = createResponse()
    await handler(
      createRequest(
        'GET',
        '/api/storage/workflows/wf_versions/versions',
        undefined,
        { 'x-workflow-user-id': 'version-user' },
      ),
      response,
    )

    expect(response.statusCode).toBe(200)
    expect(JSON.parse(response.body)).toEqual([
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
    const [latestVersion, firstVersion] = JSON.parse(response.body)
    expect(latestVersion.createdAt).toBeGreaterThanOrEqual(firstVersion.createdAt)
    expect(latestVersion.workflowUpdatedAt).toBe(20)
    expect(firstVersion.workflowUpdatedAt).toBe(10)
  })

  it('should return a workflow version snapshot by version id', async () => {
    const handler = createServerHandler()

    await handler(
      createRequest(
        'POST',
        '/api/storage/workflows',
        {
          id: 'wf_version_detail',
          name: '版本详情工作流',
          updatedAt: 30,
          nodes: [{ id: 'node_detail_v1' }],
          edges: [],
        },
        { 'x-workflow-user-id': 'version-detail-user' },
      ),
      createResponse(),
    )

    await handler(
      createRequest(
        'POST',
        '/api/storage/workflows',
        {
          id: 'wf_version_detail',
          name: '版本详情工作流',
          updatedAt: 40,
          nodes: [{ id: 'node_detail_v2' }],
          edges: [],
        },
        { 'x-workflow-user-id': 'version-detail-user' },
      ),
      createResponse(),
    )

    const listResponse = createResponse()
    await handler(
      createRequest(
        'GET',
        '/api/storage/workflows/wf_version_detail/versions',
        undefined,
        { 'x-workflow-user-id': 'version-detail-user' },
      ),
      listResponse,
    )

    const versions = JSON.parse(listResponse.body)
    const targetVersionId = versions[1].id as string

    const response = createResponse()
    await handler(
      createRequest(
        'GET',
        `/api/storage/workflows/wf_version_detail/versions/${encodeURIComponent(targetVersionId)}`,
        undefined,
        { 'x-workflow-user-id': 'version-detail-user' },
      ),
      response,
    )

    expect(response.statusCode).toBe(200)
    expect(JSON.parse(response.body)).toEqual(
      expect.objectContaining({
        id: targetVersionId,
        workflowId: 'wf_version_detail',
        workflowName: '版本详情工作流',
        source: 'save',
        workflow: expect.objectContaining({
          id: 'wf_version_detail',
          updatedAt: 30,
          nodes: [{ id: 'node_detail_v1' }],
          edges: [],
        }),
      }),
    )
  })

  it('should rollback workflow to a historical version and create a rollback version record', async () => {
    const handler = createServerHandler()

    await handler(
      createRequest(
        'POST',
        '/api/storage/workflows',
        {
          id: 'wf_rollback',
          name: '回滚工作流',
          updatedAt: 100,
          nodes: [{ id: 'node_rb_v1' }],
          edges: [],
        },
        { 'x-workflow-user-id': 'rollback-user' },
      ),
      createResponse(),
    )

    await handler(
      createRequest(
        'POST',
        '/api/storage/workflows',
        {
          id: 'wf_rollback',
          name: '回滚工作流',
          updatedAt: 200,
          nodes: [{ id: 'node_rb_v2' }],
          edges: [],
        },
        { 'x-workflow-user-id': 'rollback-user' },
      ),
      createResponse(),
    )

    const listResponse = createResponse()
    await handler(
      createRequest(
        'GET',
        '/api/storage/workflows/wf_rollback/versions',
        undefined,
        { 'x-workflow-user-id': 'rollback-user' },
      ),
      listResponse,
    )

    const versions = JSON.parse(listResponse.body)
    const targetVersionId = versions[1].id as string

    const rollbackResponse = createResponse()
    await handler(
      createRequest(
        'POST',
        `/api/storage/workflows/wf_rollback/versions/${encodeURIComponent(targetVersionId)}/rollback`,
        undefined,
        { 'x-workflow-user-id': 'rollback-user' },
      ),
      rollbackResponse,
    )

    expect(rollbackResponse.statusCode).toBe(200)
    expect(JSON.parse(rollbackResponse.body)).toEqual({
      workflow: expect.objectContaining({
        id: 'wf_rollback',
        name: '回滚工作流',
        nodes: [{ id: 'node_rb_v1' }],
        edges: [],
      }),
      version: expect.objectContaining({
        workflowId: 'wf_rollback',
        workflowName: '回滚工作流',
        source: 'rollback',
      }),
    })

    const currentWorkflowResponse = createResponse()
    await handler(
      createRequest('GET', '/api/storage/workflows/wf_rollback', undefined, { 'x-workflow-user-id': 'rollback-user' }),
      currentWorkflowResponse,
    )
    expect(JSON.parse(currentWorkflowResponse.body)).toEqual(
      expect.objectContaining({
        id: 'wf_rollback',
        nodes: [{ id: 'node_rb_v1' }],
      }),
    )

    const postRollbackVersionsResponse = createResponse()
    await handler(
      createRequest(
        'GET',
        '/api/storage/workflows/wf_rollback/versions',
        undefined,
        { 'x-workflow-user-id': 'rollback-user' },
      ),
      postRollbackVersionsResponse,
    )
    const postRollbackVersions = JSON.parse(postRollbackVersionsResponse.body)
    expect(postRollbackVersions).toHaveLength(3)
    expect(postRollbackVersions[0].source).toBe('rollback')
  })

  it('should proxy lasso analysis requests to the python backend', async () => {
    vi.stubEnv('PYTHON_ANALYSIS_API_BASE_URL', 'http://127.0.0.1:9000')
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ status: 'success', results: { summary: { ok: true } } }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const handler = createServerHandler()
    const response = createResponse()

    await handler(
      createRequest('POST', '/api/analysis/lasso', {
        data: [{ target: 1, f1: 2 }],
        target: 'target',
        config: { alpha: 0.1 },
      }),
      response,
    )

    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:9000/analyze/lasso', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        data: [{ target: 1, f1: 2 }],
        target: 'target',
        config: { alpha: 0.1 },
      }),
    })
    expect(response.statusCode).toBe(200)
    expect(JSON.parse(response.body)).toEqual({
      status: 'success',
      results: { summary: { ok: true } },
    })
  })

  it('should proxy multiple linear regression analysis requests to the python backend', async () => {
    vi.stubEnv('PYTHON_ANALYSIS_API_BASE_URL', 'http://127.0.0.1:9000')
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ status: 'success', results: { summary: { ok: true } } }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const handler = createServerHandler()
    const response = createResponse()

    await handler(
      createRequest('POST', '/api/analysis/multiple-linear-regression', {
        data: [{ target: 1, f1: 2 }],
        target: 'target',
        config: { factorNames: ['f1'] },
      }),
      response,
    )

    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:9000/analyze/multiple-linear-regression',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          data: [{ target: 1, f1: 2 }],
          target: 'target',
          config: { factorNames: ['f1'] },
        }),
      },
    )
    expect(response.statusCode).toBe(200)
    expect(JSON.parse(response.body)).toEqual({
      status: 'success',
      results: { summary: { ok: true } },
    })
  })

  it('should proxy random forest feature importance analysis requests to the python backend', async () => {
    vi.stubEnv('PYTHON_ANALYSIS_API_BASE_URL', 'http://127.0.0.1:9000')
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ status: 'success', results: { summary: { ok: true } } }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const handler = createServerHandler()
    const response = createResponse()

    await handler(
      createRequest('POST', '/api/analysis/random-forest-feature-importance', {
        data: [{ target: 1, f1: 2 }],
        target: 'target',
        config: { factorNames: ['f1'], nEstimators: 200 },
      }),
      response,
    )

    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:9000/analyze/random-forest-feature-importance',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          data: [{ target: 1, f1: 2 }],
          target: 'target',
          config: { factorNames: ['f1'], nEstimators: 200 },
        }),
      },
    )
    expect(response.statusCode).toBe(200)
    expect(JSON.parse(response.body)).toEqual({
      status: 'success',
      results: { summary: { ok: true } },
    })
  })

  it('should proxy logistic regression classification analysis requests to the python backend', async () => {
    vi.stubEnv('PYTHON_ANALYSIS_API_BASE_URL', 'http://127.0.0.1:9000')
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ status: 'success', results: { summary: { ok: true } } }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const handler = createServerHandler()
    const response = createResponse()

    await handler(
      createRequest('POST', '/api/analysis/logistic-regression-classification', {
        data: [{ label: 'A', f1: 2 }],
        target: 'label',
        config: { factorNames: ['f1'] },
      }),
      response,
    )

    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:9000/analyze/logistic-regression-classification',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          data: [{ label: 'A', f1: 2 }],
          target: 'label',
          config: { factorNames: ['f1'] },
        }),
      },
    )
    expect(response.statusCode).toBe(200)
    expect(JSON.parse(response.body)).toEqual({
      status: 'success',
      results: { summary: { ok: true } },
    })
  })

  it('should return python backend errors for analysis requests', async () => {
    vi.stubEnv('PYTHON_ANALYSIS_API_BASE_URL', 'http://127.0.0.1:9000')
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => JSON.stringify({ detail: '目标字段不存在' }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const handler = createServerHandler()
    const response = createResponse()

    await handler(
      createRequest('POST', '/api/analysis/xgboost-shap', {
        data: [{ target: 1, f1: 2 }],
        target: 'missing_target',
        config: {},
      }),
      response,
    )

    expect(response.statusCode).toBe(400)
    expect(JSON.parse(response.body)).toEqual({ detail: '目标字段不存在' })
  })

  it('should surface a clear error when the python analysis backend is unreachable', async () => {
    vi.stubEnv('PYTHON_ANALYSIS_API_BASE_URL', 'http://127.0.0.1:9000')
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('fetch failed'))
    vi.stubGlobal('fetch', fetchMock)

    const handler = createServerHandler()
    const response = createResponse()

    await handler(
      createRequest('POST', '/api/analysis/lasso', {
        data: [{ target: 1, f1: 2 }],
        target: 'target',
        config: { alpha: 0.1 },
      }),
      response,
    )

    expect(response.statusCode).toBe(502)
    expect(JSON.parse(response.body)).toEqual({
      message: 'Python 分析服务不可用，请确认算法后端已启动',
      diagnostics: {
        targetUrl: 'http://127.0.0.1:9000/analyze/lasso',
        cause: 'fetch failed',
      },
    })
  })

  it('should persist workflows and versions after reloading the server module', async () => {
    const storageDir = mkdtempSync(join(tmpdir(), 'cas-storage-routes-'))
    vi.stubEnv('WORKFLOW_STORAGE_DATA_DIR', storageDir)

    const initialHandler = await loadHandlerFresh()
    await initialHandler(
      createRequest(
        'POST',
        '/api/storage/workflows',
        {
          id: 'wf_persisted',
          name: '持久化工作流',
          updatedAt: 50,
          nodes: [{ id: 'node_persisted_v1' }],
          edges: [],
        },
        { 'x-workflow-user-id': 'persist-user' },
      ),
      createResponse(),
    )

    const reloadedHandler = await loadHandlerFresh()
    const workflowResponse = createResponse()
    await reloadedHandler(
      createRequest(
        'GET',
        '/api/storage/workflows/wf_persisted',
        undefined,
        { 'x-workflow-user-id': 'persist-user' },
      ),
      workflowResponse,
    )

    expect(workflowResponse.statusCode).toBe(200)
    expect(JSON.parse(workflowResponse.body)).toEqual(
      expect.objectContaining({
        id: 'wf_persisted',
        name: '持久化工作流',
      }),
    )

    const versionsResponse = createResponse()
    await reloadedHandler(
      createRequest(
        'GET',
        '/api/storage/workflows/wf_persisted/versions',
        undefined,
        { 'x-workflow-user-id': 'persist-user' },
      ),
      versionsResponse,
    )

    expect(JSON.parse(versionsResponse.body)).toEqual([
      expect.objectContaining({
        workflowId: 'wf_persisted',
        source: 'save',
      }),
    ])
  })

  it('should persist history after reloading the server module', async () => {
    const storageDir = mkdtempSync(join(tmpdir(), 'cas-storage-history-'))
    vi.stubEnv('WORKFLOW_STORAGE_DATA_DIR', storageDir)

    const initialHandler = await loadHandlerFresh()
    await initialHandler(
      createRequest(
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
        { 'x-workflow-user-id': 'history-user' },
      ),
      createResponse(),
    )

    const reloadedHandler = await loadHandlerFresh()
    const response = createResponse()
    await reloadedHandler(
      createRequest(
        'GET',
        '/api/storage/history',
        undefined,
        { 'x-workflow-user-id': 'history-user' },
      ),
      response,
    )

    expect(response.statusCode).toBe(200)
    expect(JSON.parse(response.body)).toEqual([
      expect.objectContaining({
        id: 'exec_1',
        workflowName: '历史工作流',
      }),
    ])
  })

  it('should return compact history summaries and full record detail through separate endpoints', async () => {
    const handler = createServerHandler()

    await handler(
      createRequest(
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
        { 'x-workflow-user-id': 'history-summary-user' },
      ),
      createResponse(),
    )

    const summaryResponse = createResponse()
    await handler(
      createRequest(
        'GET',
        '/api/storage/history/summaries',
        undefined,
        { 'x-workflow-user-id': 'history-summary-user' },
      ),
      summaryResponse,
    )

    expect(summaryResponse.statusCode).toBe(200)
    expect(JSON.parse(summaryResponse.body)).toEqual([
      {
        id: 'exec_summary_1',
        workflowId: 'wf_1',
        workflowName: '历史工作流',
        startTime: 100,
        duration: 20,
        status: 'success',
      },
    ])

    const detailResponse = createResponse()
    await handler(
      createRequest(
        'GET',
        '/api/storage/history/exec_summary_1',
        undefined,
        { 'x-workflow-user-id': 'history-summary-user' },
      ),
      detailResponse,
    )

    expect(detailResponse.statusCode).toBe(200)
    expect(JSON.parse(detailResponse.body)).toEqual(
      expect.objectContaining({
        id: 'exec_summary_1',
        nodes: [{ id: 'node_1' }],
        edges: [{ id: 'edge_1' }],
      }),
    )
  })

  it('should return 404 when a history record detail does not exist', async () => {
    const handler = createServerHandler()
    const response = createResponse()

    await handler(
      createRequest(
        'GET',
        '/api/storage/history/missing',
        undefined,
        { 'x-workflow-user-id': 'history-missing-user' },
      ),
      response,
    )

    expect(response.statusCode).toBe(404)
    expect(JSON.parse(response.body)).toEqual({ message: '未找到运行记录' })
  })
})
