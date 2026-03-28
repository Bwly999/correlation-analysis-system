import { afterEach, describe, expect, it, vi } from 'vitest'
import { Readable } from 'node:stream'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { createServerHandler } from '../app.js'

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

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('storage routes', () => {
  it('should expose the current storage user', async () => {
    const handler = createServerHandler()
    const request = createRequest('GET', '/api/storage/me', undefined, {
      'x-user-id': 'server-user-1',
      'x-user-name': '服务端用户',
    })
    const response = createResponse()

    await handler(request, response)

    expect(response.statusCode).toBe(200)
    expect(JSON.parse(response.body)).toEqual({
      id: 'server-user-1',
      name: '服务端用户',
    })
  })

  it('should isolate workflows by current user', async () => {
    const handler = createServerHandler()

    await handler(
      createRequest(
        'POST',
        '/api/storage/workflows',
        { id: 'wf_user_a', name: '用户A工作流', updatedAt: 1, nodes: [], edges: [] },
        { 'x-user-id': 'user-a' },
      ),
      createResponse(),
    )

    await handler(
      createRequest(
        'POST',
        '/api/storage/workflows',
        { id: 'wf_user_b', name: '用户B工作流', updatedAt: 2, nodes: [], edges: [] },
        { 'x-user-id': 'user-b' },
      ),
      createResponse(),
    )

    const response = createResponse()
    await handler(createRequest('GET', '/api/storage/workflows', undefined, { 'x-user-id': 'user-a' }), response)

    expect(response.statusCode).toBe(200)
    expect(JSON.parse(response.body)).toEqual([
      expect.objectContaining({
        id: 'wf_user_a',
        name: '用户A工作流',
      }),
    ])
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
})
