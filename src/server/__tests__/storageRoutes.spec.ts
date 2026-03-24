import { describe, expect, it } from 'vitest'
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
})
