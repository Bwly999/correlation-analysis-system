// @vitest-environment node

import type { FastifyInstance } from 'fastify'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createServerApp } from '../app.js'
import type { ApiCallTracker } from '../apiCallTracking/apiCallTracker.js'

const apps: FastifyInstance[] = []

const createMockTracker = (): ApiCallTracker & {
  starts: ReturnType<typeof vi.fn>
  completions: ReturnType<typeof vi.fn>
} => {
  const starts = vi.fn()
  const completions = vi.fn()
  return {
    starts,
    completions,
    recordStart: starts,
    recordCompletion: completions,
    close: vi.fn(async () => undefined),
  }
}

const createTestApp = (tracker: ApiCallTracker) => {
  const app = createServerApp({
    apiCallTracker: tracker,
    defaultStorageUser: { id: 'default-user', name: '默认用户' },
  })
  apps.push(app)
  return app
}

const workflowHeaders = (userId: string, userName = '测试用户') => ({
  'x-workflow-user-id': userId,
  'x-workflow-user-name': userName,
})

afterEach(async () => {
  while (apps.length > 0) {
    await apps.pop()!.close()
  }
})

describe('apiCallTracking plugin', () => {
  it('records start and completion for a normal /api request', async () => {
    const tracker = createMockTracker()
    const app = createTestApp(tracker)

    const response = await app.inject({
      method: 'GET',
      url: '/api/storage/me',
      headers: workflowHeaders('user-1'),
    })

    expect(response.statusCode).toBe(200)
    expect(tracker.starts).toHaveBeenCalledTimes(1)
    const startArg = tracker.starts.mock.calls[0]![0]
    // recordStart 入参不含 status，streaming 由 tracker 内部置入
    expect(startArg).toMatchObject({
      userId: 'user-1',
      method: 'GET',
      route: '/api/storage/me',
      requestId: expect.any(String),
      startTimeMs: expect.any(Number),
      clientIp: expect.any(String),
    })
    expect(startArg.fullPath).toContain('/api/storage/me')

    expect(tracker.completions).toHaveBeenCalledTimes(1)
    const [, statusCode, durationMs, status] = tracker.completions.mock.calls[0]!
    expect(statusCode).toBe(200)
    expect(durationMs).toBeGreaterThanOrEqual(0)
    expect(status).toBe('ok')
  })

  it('records start with route template and path params', async () => {
    const tracker = createMockTracker()
    const app = createTestApp(tracker)

    await app.inject({
      method: 'GET',
      url: '/api/storage/workflows/wf-123',
      headers: workflowHeaders('user-1'),
    })

    expect(tracker.starts).toHaveBeenCalledTimes(1)
    const startArg = tracker.starts.mock.calls[0]![0]
    expect(startArg.route).toBe('/api/storage/workflows/:workflowId')
    expect(startArg.paramsJson).toEqual({ workflowId: 'wf-123' })
    expect(startArg.fullPath).toBe('/api/storage/workflows/wf-123')
  })

  it('records start with query string in fullPath', async () => {
    const tracker = createMockTracker()
    const app = createTestApp(tracker)

    await app.inject({
      method: 'GET',
      url: '/api/storage/history/summaries?limit=10&offset=0',
      headers: workflowHeaders('user-1'),
    })

    const startArg = tracker.starts.mock.calls[0]![0]
    expect(startArg.fullPath).toBe('/api/storage/history/summaries?limit=10&offset=0')
  })

  it('classifies 4xx/5xx responses as error status', async () => {
    const tracker = createMockTracker()
    const app = createTestApp(tracker)

    const response = await app.inject({
      method: 'GET',
      url: '/api/storage/workflows/non-existent',
      headers: workflowHeaders('user-1'),
    })

    expect(response.statusCode).toBe(404)
    expect(tracker.completions).toHaveBeenCalledTimes(1)
    const [, statusCode, , status] = tracker.completions.mock.calls[0]!
    expect(statusCode).toBe(404)
    expect(status).toBe('error')
  })

  it('does not record OPTIONS preflight requests', async () => {
    const tracker = createMockTracker()
    const app = createTestApp(tracker)

    await app.inject({ method: 'OPTIONS', url: '/api/storage/me' })

    expect(tracker.starts).not.toHaveBeenCalled()
    expect(tracker.completions).not.toHaveBeenCalled()
  })

  it('does not record non-/api paths (static assets)', async () => {
    const tracker = createMockTracker()
    const app = createTestApp(tracker)

    await app.inject({ method: 'GET', url: '/notebook.html' })

    expect(tracker.starts).not.toHaveBeenCalled()
    expect(tracker.completions).not.toHaveBeenCalled()
  })

  it('records null userId when no workflow user header is present but default user applies', async () => {
    // defaultStorageUser 会被 preHandler 填入 workflowUser，所以 userId 应来自 default
    const tracker = createMockTracker()
    const app = createTestApp(tracker)

    await app.inject({ method: 'GET', url: '/api/storage/me' })

    expect(tracker.starts).toHaveBeenCalledTimes(1)
    // defaultStorageUser 注入后 workflowUser.id === 'default-user'
    expect(tracker.starts.mock.calls[0]![0].userId).toBe('default-user')
  })

  it('never throws to the caller when tracker raises (fire-and-forget)', async () => {
    const tracker: ApiCallTracker = {
      recordStart: () => {
        throw new Error('tracker boom')
      },
      recordCompletion: () => {
        throw new Error('completion boom')
      },
      close: async () => undefined,
    }
    const app = createTestApp(tracker)

    const response = await app.inject({
      method: 'GET',
      url: '/api/storage/me',
      headers: workflowHeaders('user-1'),
    })

    // 请求仍正常返回，打点异常被吞掉
    expect(response.statusCode).toBe(200)
  })
})
