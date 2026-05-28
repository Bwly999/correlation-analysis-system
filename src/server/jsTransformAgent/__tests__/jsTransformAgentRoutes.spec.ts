import Fastify, { type FastifyInstance } from 'fastify'
import { afterEach, describe, expect, it, vi } from 'vitest'

const {
  createJsTransformAgentSessionMock,
  sendJsTransformAgentMessageMock,
  updateJsTransformAgentModeMock,
  abortJsTransformAgentRunMock,
  subscribeJsTransformAgentEventsMock,
  getJsTransformAgentSessionMock,
  getJsTransformAgentSessionOwnerMock,
  reportJsTransformAgentToolProgressMock,
  resolveJsTransformAgentToolResultMock,
} = vi.hoisted(() => ({
  createJsTransformAgentSessionMock: vi.fn(),
  sendJsTransformAgentMessageMock: vi.fn(),
  updateJsTransformAgentModeMock: vi.fn(),
  abortJsTransformAgentRunMock: vi.fn(),
  subscribeJsTransformAgentEventsMock: vi.fn(),
  getJsTransformAgentSessionMock: vi.fn(),
  getJsTransformAgentSessionOwnerMock: vi.fn(),
  reportJsTransformAgentToolProgressMock: vi.fn(),
  resolveJsTransformAgentToolResultMock: vi.fn(),
}))

vi.mock('../../piAgent/jsTransformAgentGateway.js', () => ({
  createJsTransformAgentSession: createJsTransformAgentSessionMock,
  sendJsTransformAgentMessage: sendJsTransformAgentMessageMock,
  updateJsTransformAgentMode: updateJsTransformAgentModeMock,
  abortJsTransformAgentRun: abortJsTransformAgentRunMock,
  subscribeJsTransformAgentEvents: subscribeJsTransformAgentEventsMock,
  getJsTransformAgentSession: getJsTransformAgentSessionMock,
  getJsTransformAgentSessionOwner: getJsTransformAgentSessionOwnerMock,
  reportJsTransformAgentToolProgress: reportJsTransformAgentToolProgressMock,
  resolveJsTransformAgentToolResult: resolveJsTransformAgentToolResultMock,
}))

import '../../http/fastify.js'
import { createJsTransformAgentRoutes } from '../../modules/jsTransformAgentRoutes.js'
import * as jsTransformGatewayModule from '../../piAgent/jsTransformAgentGateway.js'

const apps: FastifyInstance[] = []

const createTestApp = async () => {
  const app = Fastify()
  app.decorate('serverDependencies', {
    resolveStorageUser: () => ({
      id: 'js-transform-route-user',
      name: 'JS Transform 路由测试用户',
    }),
  } as any)

  await app.register(createJsTransformAgentRoutes())
  await app.ready()
  apps.push(app)
  return app
}

afterEach(async () => {
  vi.restoreAllMocks()
  createJsTransformAgentSessionMock.mockReset()
  sendJsTransformAgentMessageMock.mockReset()
  updateJsTransformAgentModeMock.mockReset()
  abortJsTransformAgentRunMock.mockReset()
  subscribeJsTransformAgentEventsMock.mockReset()
  getJsTransformAgentSessionMock.mockReset()
  getJsTransformAgentSessionOwnerMock.mockReset()
  reportJsTransformAgentToolProgressMock.mockReset()
  resolveJsTransformAgentToolResultMock.mockReset()

  while (apps.length > 0) {
    await apps.pop()!.close()
  }
})

describe('jsTransformAgentRoutes', () => {
  it('creates js transform sessions through the dedicated namespace', async () => {
    createJsTransformAgentSessionMock.mockResolvedValueOnce({
      sessionId: 'js_agent_session_1',
      status: 'idle',
      mode: 'agent',
      prompt: '把字符串日期转成月份字段',
    })

    const app = await createTestApp()
    const response = await app.inject({
      method: 'POST',
      url: '/api/js-transform-agent/sessions',
      payload: {
        nodeId: 'node_js_1',
        mode: 'agent',
        prompt: '把字符串日期转成月份字段',
        profile: {
          id: 'profile_1',
          name: '测试模型',
          baseUrl: 'http://example.com',
          model: 'glm-4.7',
          enabled: true,
          source: 'custom',
        },
        nodeContext: {
          node: {
            nodeId: 'node_js_1',
            nodeLabel: 'JS代码执行',
            nodeType: 'js-transform',
          },
          task: '把字符串日期转成月份字段',
          codeContext: {
            currentCode: 'return rows',
            language: 'javascript',
            declarations: 'declare const rows: Array<Record<string, unknown>>',
            constraints: ['只能写同步 JS'],
          },
          inputContext: {
            inputMode: 'single',
            rowCount: 1,
            sourceSummary: '上游输入共 1 行',
            sampleRows: [{ date: '2026-05-01' }],
            schemaSummary: {
              fields: [{ name: 'date', type: 'string', nullable: false }],
            },
          },
          latestDebugContext: {
            status: 'idle',
            summary: '当前尚未调试',
            outputSample: [],
            errorMessage: '',
          },
          capabilities: {
            ask: ['read_context'],
            agent: ['read_context', 'update_current_code', 'debug_current_node'],
          },
        },
      },
      headers: {
        'x-workflow-user-id': 'js-transform-route-user',
        'x-workflow-user-name': 'JS Transform 路由测试用户',
      },
    })

    expect(response.statusCode).toBe(200)
    expect(createJsTransformAgentSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        nodeId: 'node_js_1',
        mode: 'agent',
      }),
      'js-transform-route-user',
    )
  })

  it('streams ndjson events from the js transform namespace', async () => {
    getJsTransformAgentSessionOwnerMock.mockReturnValueOnce('js-transform-route-user')
    getJsTransformAgentSessionMock.mockReturnValueOnce({ sessionId: 'js_session_1' })
    subscribeJsTransformAgentEventsMock.mockImplementationOnce((_sessionId, write) => {
      write({ type: 'message', content: 'hello' })
      return undefined
    })

    const app = await createTestApp()
    const response = await app.inject({
      method: 'GET',
      url: '/api/js-transform-agent/sessions/js_session_1/events',
      headers: {
        'x-workflow-user-id': 'js-transform-route-user',
        'x-workflow-user-name': 'JS Transform 路由测试用户',
      },
    })

    expect(response.statusCode).toBe(200)
    expect(response.headers['content-type']).toContain('application/x-ndjson')
    expect(response.headers['x-accel-buffering']).toBe('no')
    expect(response.body).toBe('{"type":"stream.ready"}\n{"type":"message","content":"hello"}\n')
  })

  it('aborts a js transform run through the dedicated namespace', async () => {
    getJsTransformAgentSessionOwnerMock.mockReturnValueOnce('js-transform-route-user')
    abortJsTransformAgentRunMock.mockResolvedValueOnce({
      ok: true,
      restoredMessages: ['继续调试', '解释报错'],
    })

    const app = await createTestApp()
    const response = await app.inject({
      method: 'POST',
      url: '/api/js-transform-agent/sessions/js_session_1/abort',
      headers: {
        'x-workflow-user-id': 'js-transform-route-user',
        'x-workflow-user-name': 'JS Transform 路由测试用户',
      },
    })

    expect(response.statusCode).toBe(200)
    expect(abortJsTransformAgentRunMock).toHaveBeenCalledWith('js_session_1')
    expect(response.json()).toEqual({
      ok: true,
      restoredMessages: ['继续调试', '解释报错'],
    })
  })

  it('rejects cross-user js transform session access across session-scoped routes', async () => {
    getJsTransformAgentSessionOwnerMock.mockReturnValue('owner_user')
    getJsTransformAgentSessionMock.mockReturnValue({ sessionId: 'js_session_1' })
    sendJsTransformAgentMessageMock.mockResolvedValue({ ok: true })
    updateJsTransformAgentModeMock.mockResolvedValue({ ok: true })
    abortJsTransformAgentRunMock.mockResolvedValue({ ok: true, restoredMessages: [] })
    resolveJsTransformAgentToolResultMock.mockReturnValue(true)

    const app = await createTestApp()
    const headers = {
      'x-workflow-user-id': 'another_user',
      'x-workflow-user-name': '另一个用户',
    }

    const responses = await Promise.all([
      app.inject({
        method: 'GET',
        url: '/api/js-transform-agent/sessions/js_session_1',
        headers,
      }),
      app.inject({
        method: 'GET',
        url: '/api/js-transform-agent/sessions/js_session_1/events',
        headers,
      }),
      app.inject({
        method: 'POST',
        url: '/api/js-transform-agent/sessions/js_session_1/messages',
        headers,
        payload: { content: '继续' },
      }),
      app.inject({
        method: 'POST',
        url: '/api/js-transform-agent/sessions/js_session_1/mode',
        headers,
        payload: { mode: 'agent' },
      }),
      app.inject({
        method: 'POST',
        url: '/api/js-transform-agent/sessions/js_session_1/abort',
        headers,
      }),
      app.inject({
        method: 'POST',
        url: '/api/js-transform-agent/sessions/js_session_1/tool-result',
        headers,
        payload: {
          toolCallId: 'tool_1',
          result: {
            content: [{ type: 'text', text: 'ok' }],
            details: { ok: true, status: 'success', summary: 'ok', outputSample: [], errorMessage: '' },
          },
        },
      }),
      app.inject({
        method: 'POST',
        url: '/api/js-transform-agent/sessions/js_session_1/tool-progress',
        headers,
        payload: {
          toolCallId: 'tool_1',
        },
      }),
    ])

    responses.forEach((response) => {
      expect(response.statusCode).toBe(403)
      expect(response.json()).toMatchObject({ message: '无权访问该 JS Transform Agent 会话' })
    })
    expect(sendJsTransformAgentMessageMock).not.toHaveBeenCalled()
    expect(updateJsTransformAgentModeMock).not.toHaveBeenCalled()
    expect(abortJsTransformAgentRunMock).not.toHaveBeenCalled()
    expect(resolveJsTransformAgentToolResultMock).not.toHaveBeenCalled()
    expect(reportJsTransformAgentToolProgressMock).not.toHaveBeenCalled()
  })

  it('accepts tool progress heartbeats for in-flight js transform tools', async () => {
    getJsTransformAgentSessionOwnerMock.mockReturnValueOnce('js-transform-route-user')
    reportJsTransformAgentToolProgressMock.mockReturnValueOnce(true)

    const app = await createTestApp()
    const response = await app.inject({
      method: 'POST',
      url: '/api/js-transform-agent/sessions/js_session_1/tool-progress',
      headers: {
        'x-workflow-user-id': 'js-transform-route-user',
        'x-workflow-user-name': 'JS Transform 路由测试用户',
      },
      payload: {
        toolCallId: 'tool_1',
      },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ ok: true })
    expect(reportJsTransformAgentToolProgressMock).toHaveBeenCalledWith('js_session_1', 'tool_1')
  })

  it('routes directly to the piAgent jsTransform gateway implementation module', () => {
    expect(jsTransformGatewayModule).toBeTruthy()
  })
})
