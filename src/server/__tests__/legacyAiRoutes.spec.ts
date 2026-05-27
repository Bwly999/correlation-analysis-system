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
  headers: Record<string, string> = {
    'x-workflow-user-id': 'legacy-routes-user',
    'x-workflow-user-name': 'Legacy Routes User',
  },
) => {
  const payload = body === undefined ? '' : JSON.stringify(body)
  const stream = Readable.from(payload ? [payload] : []) as IncomingMessage
  stream.method = method
  stream.url = url
  stream.headers = headers
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

describe('legacy ai routes', () => {
  beforeEach(() => {
    vi.stubEnv('WORKFLOW_STORAGE_DATA_DIR', mkdtempSync(join(tmpdir(), 'cas-legacy-routes-')))
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('returns 404 for removed workflow-ai routes', async () => {
    const handler = createServerHandler()
    const response = createResponse()

    await handler(createRequest('GET', '/api/workflow-ai/model-profiles'), response)

    expect(response.statusCode).toBe(404)
    expect(JSON.parse(response.body)).toEqual({ message: '未找到接口' })
  })

  it('returns 404 for removed workflow mcp routes', async () => {
    const handler = createServerHandler()
    const response = createResponse()

    await handler(createRequest('GET', '/api/opencode/workflow-mcp/health'), response)

    expect(response.statusCode).toBe(404)
    expect(JSON.parse(response.body)).toEqual({ message: '未找到接口' })
  })
})
