// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Readable } from 'node:stream'
import { mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { createServerHandler } from '../app.js'

type MockResponse = ServerResponse & {
  body: string
  headersMap: Record<string, string>
}

const createRequest = (
  method: string,
  url: string,
  body?: unknown,
  headers?: Record<string, string>,
) => {
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
    write(chunk: string) {
      this.body += chunk ?? ''
      return true
    },
    end(chunk?: string) {
      this.body += chunk ?? ''
      return this
    },
  } as MockResponse

  return response
}

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
    const handler = createServerHandler()
    const expectedMessage = '缺少用户标识，请通过 x-workflow-user-id 请求头或 defaultUser 依赖注入提供用户'
    const workflowRequests = [
      {
        name: 'storage',
        request: createRequest('GET', '/api/storage/me'),
        assertBody: (body: string) => {
          expect(JSON.parse(body)).toEqual({ message: expectedMessage })
        },
      },
      {
        name: 'pi-agent',
        request: createRequest('POST', '/api/pi-agent/sessions', {
          mode: 'edit',
          prompt: '帮我分析当前画布',
          profile: { id: 'custom', name: '测试模型', baseUrl: 'http://example.com', model: 'glm-4.7', enabled: true, source: 'custom' },
          nodeCatalog: [],
        }),
        assertBody: (body: string) => {
          expect(JSON.parse(body)).toEqual({ message: expectedMessage })
        },
      },
    ]

    for (const candidate of workflowRequests) {
      const response = createResponse()
      await handler(candidate.request, response)
      expect(response.statusCode, candidate.name).toBe(400)
      candidate.assertBody(response.body)
    }
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
    const handler = createServerHandler()
    const response = createResponse()

    await handler(
      createRequest('POST', '/api/analysis/lasso', {
        data: [{ target: 1, f1: 2 }],
        target: 'target',
        config: {},
      }),
      response,
    )

    expect(response.statusCode).toBe(200)
    expect(JSON.parse(response.body)).toEqual({
      status: 'success',
      results: { summary: { ok: true } },
    })
  })
})
