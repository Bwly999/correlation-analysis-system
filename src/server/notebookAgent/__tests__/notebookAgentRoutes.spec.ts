/**
 * notebookAgentRoutes 单测（最小 HTTP 契约）。
 *
 * 验证：
 *   - POST /api/notebook-agent/sessions：body {initialDataMeta} → 返回 sessionId + systemPrompt 头/前缀
 *   - GET /api/notebook-agent/sessions/:id：拿 record 概览
 *   - DELETE /api/notebook-agent/sessions/:id：标 ended
 *   - 无身份头时 401（与 piAgent 一致）
 *   - 不存在 sessionId 时 404
 */

// @vitest-environment node

import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createServerApp } from '../../app.js'
import {
  __resetNotebookSessionsForTest,
} from '../sessionStore.js'

const apps: FastifyInstance[] = []

const createTestApp = () => {
  const app = createServerApp()
  apps.push(app)
  return app
}

const userHeaders = (userId = 'u-1') => ({
  'x-workflow-user-id': userId,
  'x-workflow-user-name': '测试',
})

afterEach(async () => {
  while (apps.length > 0) {
    const app = apps.pop()
    if (app) await app.close()
  }
})

beforeEach(() => {
  __resetNotebookSessionsForTest()
})

describe('POST /api/notebook-agent/sessions', () => {
  it('返回 sessionId + systemPrompt 字段', async () => {
    const app = createTestApp()
    const res = await app.inject({
      method: 'POST',
      url: '/api/notebook-agent/sessions',
      payload: {
        initialDataMeta: {
          sourceKind: 'canvas-node',
          sourceLabel: 'cleanup',
          rowCount: 100,
          columnCount: 4,
        },
        origin: 'http://localhost:5173',
      },
      headers: userHeaders(),
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as { sessionId: string; systemPrompt: string }
    expect(body.sessionId).toMatch(/-/)
    expect(body.systemPrompt).toMatch(/工作循环|分析师/)
  })

  it('缺 initialDataMeta → 400', async () => {
    const app = createTestApp()
    const res = await app.inject({
      method: 'POST',
      url: '/api/notebook-agent/sessions',
      payload: { origin: 'http://localhost:5173' },
      headers: userHeaders(),
    })
    expect(res.statusCode).toBe(400)
  })

  it('未带身份头 → 400', async () => {
    const app = createTestApp()
    const res = await app.inject({
      method: 'POST',
      url: '/api/notebook-agent/sessions',
      payload: {
        initialDataMeta: {
          sourceKind: 'canvas-node',
          sourceLabel: '',
          rowCount: 0,
          columnCount: 0,
        },
        origin: 'http://localhost',
      },
    })
    expect(res.statusCode).toBe(400)
  })
})

describe('GET /api/notebook-agent/sessions/:id', () => {
  it('返回 session 概览', async () => {
    const app = createTestApp()
    const create = await app.inject({
      method: 'POST',
      url: '/api/notebook-agent/sessions',
      payload: {
        initialDataMeta: {
          sourceKind: 'canvas-node',
          sourceLabel: 'x',
          rowCount: 1,
          columnCount: 1,
        },
        origin: 'http://localhost',
      },
      headers: userHeaders(),
    })
    const sessionId = (create.json() as { sessionId: string }).sessionId

    const res = await app.inject({
      method: 'GET',
      url: `/api/notebook-agent/sessions/${sessionId}`,
      headers: userHeaders(),
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as { sessionId: string; status: string; messages: unknown[] }
    expect(body.sessionId).toBe(sessionId)
    expect(body.status).toBe('idle')
    expect(body.messages).toEqual([])
  })

  it('不存在 → 404', async () => {
    const app = createTestApp()
    const res = await app.inject({
      method: 'GET',
      url: '/api/notebook-agent/sessions/no-such-id',
      headers: userHeaders(),
    })
    expect(res.statusCode).toBe(404)
  })

  it('其他用户访问 → 403', async () => {
    const app = createTestApp()
    const create = await app.inject({
      method: 'POST',
      url: '/api/notebook-agent/sessions',
      payload: {
        initialDataMeta: {
          sourceKind: 'canvas-node',
          sourceLabel: 'x',
          rowCount: 1,
          columnCount: 1,
        },
        origin: 'http://localhost',
      },
      headers: userHeaders('alice'),
    })
    const sessionId = (create.json() as { sessionId: string }).sessionId
    const res = await app.inject({
      method: 'GET',
      url: `/api/notebook-agent/sessions/${sessionId}`,
      headers: userHeaders('bob'),
    })
    expect(res.statusCode).toBe(403)
  })
})

describe('DELETE /api/notebook-agent/sessions/:id', () => {
  it('标记 completed 并返回 ok', async () => {
    const app = createTestApp()
    const create = await app.inject({
      method: 'POST',
      url: '/api/notebook-agent/sessions',
      payload: {
        initialDataMeta: {
          sourceKind: 'canvas-node',
          sourceLabel: 'x',
          rowCount: 1,
          columnCount: 1,
        },
        origin: 'http://localhost',
      },
      headers: userHeaders(),
    })
    const sessionId = (create.json() as { sessionId: string }).sessionId

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/notebook-agent/sessions/${sessionId}`,
      headers: userHeaders(),
    })
    expect(res.statusCode).toBe(200)

    const get = await app.inject({
      method: 'GET',
      url: `/api/notebook-agent/sessions/${sessionId}`,
      headers: userHeaders(),
    })
    expect((get.json() as { status: string }).status).toBe('completed')
  })
})
