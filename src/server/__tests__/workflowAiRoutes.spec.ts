import { afterEach, describe, expect, it, vi } from 'vitest'
import { Readable } from 'node:stream'
import type { IncomingMessage, ServerResponse } from 'node:http'

const {
  generateWorkflowAiPlanMock,
  streamWorkflowAiPlanMock,
  startWorkflowAiSessionMock,
  submitWorkflowAiSessionInputMock,
  runWorkflowAiSessionMock,
  getWorkflowAiSessionMock,
  getWorkflowAiSessionRecordMock,
  handleWorkflowMcpRequestMock,
  getWorkflowMcpHealthSnapshotMock,
  isWorkflowMcpHealthRequestMock,
  isWorkflowMcpRequestMock,
  createPiAgentSessionMock,
  sendPiAgentMessageMock,
  subscribePiAgentEventsMock,
  getPiAgentSessionMock,
  resolvePiAgentToolResultMock,
} = vi.hoisted(() => ({
  generateWorkflowAiPlanMock: vi.fn(),
  streamWorkflowAiPlanMock: vi.fn(),
  startWorkflowAiSessionMock: vi.fn(),
  submitWorkflowAiSessionInputMock: vi.fn(),
  runWorkflowAiSessionMock: vi.fn(),
  getWorkflowAiSessionMock: vi.fn(),
  getWorkflowAiSessionRecordMock: vi.fn(),
  handleWorkflowMcpRequestMock: vi.fn(),
  getWorkflowMcpHealthSnapshotMock: vi.fn(),
  isWorkflowMcpHealthRequestMock: vi.fn((pathname: string) => pathname === '/api/opencode/workflow-mcp/health'),
  isWorkflowMcpRequestMock: vi.fn((pathname: string) => pathname === '/api/opencode/workflow-mcp'),
  createPiAgentSessionMock: vi.fn(),
  sendPiAgentMessageMock: vi.fn(),
  subscribePiAgentEventsMock: vi.fn(),
  getPiAgentSessionMock: vi.fn(),
  resolvePiAgentToolResultMock: vi.fn(),
}))

vi.mock('../workflowAi/profiles.js', () => ({
  generateWorkflowAiPlan: generateWorkflowAiPlanMock,
  streamWorkflowAiPlan: streamWorkflowAiPlanMock,
  getSystemModelProfiles: vi.fn(() => []),
  testWorkflowAiModelProfile: vi.fn(),
  toPublicModelProfile: vi.fn((profile) => profile),
}))

vi.mock('../workflowAi/orchestrator.js', () => ({
  startWorkflowAiSession: startWorkflowAiSessionMock,
  submitWorkflowAiSessionInput: submitWorkflowAiSessionInputMock,
  runWorkflowAiSession: runWorkflowAiSessionMock,
  getWorkflowAiSession: getWorkflowAiSessionMock,
  getWorkflowAiSessionRecord: getWorkflowAiSessionRecordMock,
}))

vi.mock('../workflowMcp/workflowMcpServer.js', () => ({
  handleWorkflowMcpRequest: handleWorkflowMcpRequestMock,
  getWorkflowMcpHealthSnapshot: getWorkflowMcpHealthSnapshotMock,
  isWorkflowMcpHealthRequest: isWorkflowMcpHealthRequestMock,
  isWorkflowMcpRequest: isWorkflowMcpRequestMock,
}))

vi.mock('../piAgent/gateway.js', () => ({
  createPiAgentSession: createPiAgentSessionMock,
  sendPiAgentMessage: sendPiAgentMessageMock,
  subscribePiAgentEvents: subscribePiAgentEventsMock,
  getPiAgentSession: getPiAgentSessionMock,
  resolvePiAgentToolResult: resolvePiAgentToolResultMock,
}))

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
    'x-workflow-user-id': 'workflow-ai-route-user',
    'x-workflow-user-name': 'Workflow AI 路由测试用户',
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

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  generateWorkflowAiPlanMock.mockReset()
  streamWorkflowAiPlanMock.mockReset()
  startWorkflowAiSessionMock.mockReset()
  submitWorkflowAiSessionInputMock.mockReset()
  runWorkflowAiSessionMock.mockReset()
  getWorkflowAiSessionMock.mockReset()
  getWorkflowAiSessionRecordMock.mockReset()
  handleWorkflowMcpRequestMock.mockReset()
  getWorkflowMcpHealthSnapshotMock.mockReset()
  createPiAgentSessionMock.mockReset()
  sendPiAgentMessageMock.mockReset()
  subscribePiAgentEventsMock.mockReset()
  getPiAgentSessionMock.mockReset()
  resolvePiAgentToolResultMock.mockReset()
  isWorkflowMcpHealthRequestMock.mockImplementation((pathname: string) => pathname === '/api/opencode/workflow-mcp/health')
  isWorkflowMcpRequestMock.mockImplementation((pathname: string) => pathname === '/api/opencode/workflow-mcp')
})

describe('workflow ai routes', () => {
  it('returns 404 for removed legacy analysis-agent routes', async () => {
    const handler = createServerHandler()

    const startResponse = createResponse()
    await handler(
      createRequest('POST', '/api/analysis-agent/session/start', {
        mode: 'create',
        prompt: '帮我分析影响销量的关键因素',
        profile: { id: 'custom', name: '测试模型', baseUrl: 'http://example.com', model: 'test', enabled: true, source: 'custom' },
        nodeCatalog: [],
      }),
      startResponse,
    )

    const canvasResponse = createResponse()
    await handler(
      createRequest('POST', '/api/analysis-agent/session/session_1/canvas-sync', {
        workflowSnapshot: {
          name: '测试工作流',
          nodes: [{ id: 'node_1' }],
          edges: [],
        },
      }),
      canvasResponse,
    )

    expect(startResponse.statusCode).toBe(404)
    expect(canvasResponse.statusCode).toBe(404)
    expect(JSON.parse(startResponse.body)).toEqual({ message: '未找到接口' })
    expect(JSON.parse(canvasResponse.body)).toEqual({ message: '未找到接口' })
  })

  it('returns diagnostics together with the generated plan', async () => {
    generateWorkflowAiPlanMock.mockResolvedValueOnce({
      plan: {
        summary: '已生成',
        assumptions: [],
        warnings: [],
        questions: [],
        operations: [],
      },
      diagnostics: {
        status: 'success',
        stage: 'validate',
        attempts: [{ attempt: 1, trigger: 'initial', status: 'success', stage: 'validate' }],
        issues: [],
        rawOutputExcerpt: '{"summary":"已生成"}',
      },
    })

    const handler = createServerHandler()
    const response = createResponse()

    await handler(
      createRequest('POST', '/api/workflow-ai/plan', {
        mode: 'create',
        prompt: '创建一个工作流',
        profile: { id: 'custom', name: '测试模型', baseUrl: 'http://example.com', model: 'test', enabled: true, source: 'custom' },
        nodeCatalog: [],
      }),
      response,
    )

    expect(response.statusCode).toBe(200)
    expect(JSON.parse(response.body)).toEqual({
      plan: {
        summary: '已生成',
        assumptions: [],
        warnings: [],
        questions: [],
        operations: [],
      },
      diagnostics: expect.objectContaining({
        status: 'success',
      }),
    })
  })

  it('returns 422 with diagnostics when workflow ai generation fails with a typed planning error', async () => {
    const error = Object.assign(new Error('AI 计划校验失败'), {
      statusCode: 422,
      diagnostics: {
        status: 'failed',
        stage: 'validate',
        attempts: [{ attempt: 1, trigger: 'initial', status: 'failed', stage: 'validate' }],
        issues: [{ stage: 'validate', operationId: 'op_1', message: '空计划缺少追问信息' }],
        rawOutputExcerpt: '{"summary":"失败"}',
      },
    })
    generateWorkflowAiPlanMock.mockRejectedValueOnce(error)

    const handler = createServerHandler()
    const response = createResponse()

    await handler(
      createRequest('POST', '/api/workflow-ai/plan', {
        mode: 'create',
        prompt: '创建一个工作流',
        profile: { id: 'custom', name: '测试模型', baseUrl: 'http://example.com', model: 'test', enabled: true, source: 'custom' },
        nodeCatalog: [],
      }),
      response,
    )

    expect(response.statusCode).toBe(422)
    expect(JSON.parse(response.body)).toEqual({
      message: 'AI 计划校验失败',
      diagnostics: expect.objectContaining({
        status: 'failed',
        stage: 'validate',
        issues: [{ stage: 'validate', operationId: 'op_1', message: '空计划缺少追问信息' }],
      }),
    })
  })

  it('streams workflow ai progress events from the dedicated stream route', async () => {
    streamWorkflowAiPlanMock.mockImplementationOnce(async (_body, emitEvent) => {
      emitEvent({ type: 'started', message: 'AI 编排已开始' })
      emitEvent({ type: 'text_delta', attempt: 1, delta: '{"summary":"流式输出"}' })
      emitEvent({
        type: 'completed',
        plan: {
          summary: '流式输出',
          assumptions: [],
          warnings: [],
          questions: [],
          operations: [],
        },
        diagnostics: {
          status: 'success',
          stage: 'validate',
          attempts: [{ attempt: 1, trigger: 'initial', status: 'success', stage: 'validate' }],
          issues: [],
          rawOutputExcerpt: '{"summary":"流式输出"}',
        },
      })
    })

    const handler = createServerHandler()
    const response = createResponse()

    await handler(
      createRequest('POST', '/api/workflow-ai/plan/stream', {
        mode: 'create',
        prompt: '创建一个工作流',
        profile: { id: 'custom', name: '测试模型', baseUrl: 'http://example.com', model: 'test', enabled: true, source: 'custom' },
        nodeCatalog: [],
      }),
      response,
    )

    expect(response.statusCode).toBe(200)
    expect(response.headersMap['Content-Type']).toContain('application/x-ndjson')
    const lines = response.body.trim().split('\n').map((line) => JSON.parse(line))
    expect(lines.map((line) => line.type)).toEqual(['started', 'text_delta', 'completed'])
    expect(lines[2].plan.summary).toBe('流式输出')
  })

  it('starts a workflow ai session from the dedicated session route', async () => {
    startWorkflowAiSessionMock.mockReturnValueOnce({
      sessionId: 'session_1',
      mode: 'create',
      status: 'idle',
      prompt: '创建一个工作流',
      draft: {
        summary: '',
        assumptions: [],
        warnings: [],
        questions: [],
        nodes: [],
        edges: [],
      },
      trace: [],
      diagnostics: {
        issues: [],
      },
      missingInfo: [],
    })

    const handler = createServerHandler()
    const response = createResponse()

    await handler(
      createRequest('POST', '/api/workflow-ai/session/start', {
        mode: 'create',
        prompt: '创建一个工作流',
        profile: { id: 'custom', name: '测试模型', baseUrl: 'http://example.com', model: 'test', enabled: true, source: 'custom' },
        nodeCatalog: [],
      }),
      response,
    )

    expect(response.statusCode).toBe(200)
    expect(JSON.parse(response.body)).toEqual({
      session: expect.objectContaining({
        sessionId: 'session_1',
        status: 'idle',
      }),
    })
  })

  it('streams workflow ai session events from the session run route', async () => {
    runWorkflowAiSessionMock.mockImplementationOnce(async (_sessionId, emitEvent) => {
      emitEvent({ type: 'started', sessionId: 'session_1', message: 'AI 编排会话已开始' })
      emitEvent({
        type: 'recipe_selected',
        recipeId: 'quick-json-demo',
        recipeName: 'JSON 快速演示',
        reason: '命中关键词：JSON、快速',
      })
      emitEvent({
        type: 'completed',
        plan: {
          summary: '流式输出',
          assumptions: [],
          warnings: [],
          questions: [],
          operations: [],
        },
        draft: {
          summary: '最小草稿',
          assumptions: [],
          warnings: [],
          questions: [],
          nodes: [],
          edges: [],
        },
        diagnostics: {
          status: 'success',
          stage: 'validate',
          attempts: [{ attempt: 1, trigger: 'initial', status: 'success', stage: 'validate' }],
          issues: [],
        },
      })
      return {
        plan: {
          summary: '流式输出',
          assumptions: [],
          warnings: [],
          questions: [],
          operations: [],
        },
        draft: {
          summary: '最小草稿',
          assumptions: [],
          warnings: [],
          questions: [],
          nodes: [],
          edges: [],
        },
        diagnostics: {
          status: 'success',
          stage: 'validate',
          attempts: [{ attempt: 1, trigger: 'initial', status: 'success', stage: 'validate' }],
          issues: [],
        },
      }
    })

    const handler = createServerHandler()
    const response = createResponse()

    await handler(createRequest('POST', '/api/workflow-ai/session/session_1/run'), response)

    expect(response.statusCode).toBe(200)
    expect(response.headersMap['Content-Type']).toContain('application/x-ndjson')
    const lines = response.body.trim().split('\n').map((line) => JSON.parse(line))
    expect(lines.map((line) => line.type)).toEqual(['started', 'recipe_selected', 'completed'])
    expect(lines[2].draft.summary).toBe('最小草稿')
  })

  it('stores user-provided missing information through the session input route', async () => {
    submitWorkflowAiSessionInputMock.mockResolvedValueOnce({
      sessionId: 'session_1',
      mode: 'create',
      status: 'idle',
      prompt: '创建一个工作流',
      draft: {
        summary: '最小草稿',
        assumptions: [],
        warnings: [],
        questions: ['请确认目标字段'],
        nodes: [],
        edges: [],
      },
      trace: [],
      diagnostics: {
        issues: [],
      },
      missingInfo: [],
      contextHints: {
        userAnswers: [
          {
            key: 'question_1',
            value: '目标字段就是 target',
          },
        ],
      },
    })

    const handler = createServerHandler()
    const response = createResponse()

    await handler(
      createRequest('POST', '/api/workflow-ai/session/session_1/input', {
        answers: {
          question_1: '目标字段就是 target',
        },
      }),
      response,
    )

    expect(response.statusCode).toBe(200)
    expect(submitWorkflowAiSessionInputMock).toHaveBeenCalledWith('session_1', {
      answers: {
        question_1: '目标字段就是 target',
      },
    })
    expect(JSON.parse(response.body)).toEqual({
      session: expect.objectContaining({
        sessionId: 'session_1',
        status: 'idle',
      }),
    })
  })

  it('returns the current workflow ai session snapshot', async () => {
    getWorkflowAiSessionMock.mockReturnValueOnce({
      sessionId: 'session_1',
      mode: 'create',
      status: 'running',
      prompt: '创建一个工作流',
      draft: {
        summary: '',
        assumptions: [],
        warnings: [],
        questions: [],
        nodes: [],
        edges: [],
      },
      trace: [],
      diagnostics: {
        issues: [],
      },
      missingInfo: [],
    })

    const handler = createServerHandler()
    const response = createResponse()

    await handler(createRequest('GET', '/api/workflow-ai/session/session_1'), response)

    expect(response.statusCode).toBe(200)
    expect(JSON.parse(response.body)).toEqual({
      session: expect.objectContaining({
        sessionId: 'session_1',
        status: 'running',
      }),
    })
  })

  it('delegates workflow MCP requests to the dedicated MCP handler', async () => {
    handleWorkflowMcpRequestMock.mockImplementationOnce(async (_request, response) => {
      response.statusCode = 200
      response.setHeader('Content-Type', 'application/json; charset=utf-8')
      response.end(JSON.stringify({ ok: true, via: 'mcp' }))
    })

    const handler = createServerHandler()
    const response = createResponse()

    await handler(createRequest('POST', '/api/opencode/workflow-mcp'), response)

    expect(isWorkflowMcpRequestMock).toHaveBeenCalledWith('/api/opencode/workflow-mcp')
    expect(handleWorkflowMcpRequestMock).toHaveBeenCalledTimes(1)
    expect(response.statusCode).toBe(200)
    expect(JSON.parse(response.body)).toEqual({
      ok: true,
      via: 'mcp',
    })
  })

  it('returns workflow MCP health snapshot from the dedicated health route', async () => {
    getWorkflowMcpHealthSnapshotMock.mockReturnValueOnce({
      status: 'ok',
      authEnabled: true,
      sessionStore: {
        activeSessions: 2,
        expiredSessionsCleaned: 1,
        ttlMs: 600000,
        maxSessions: 200,
      },
      toolMetrics: {
        totalCalls: 3,
        totalFailures: 1,
        byTool: {
          workflow_get_session_context: {
            calls: 2,
            failures: 0,
          },
        },
      },
    })

    const handler = createServerHandler()
    const response = createResponse()

    await handler(createRequest('GET', '/api/opencode/workflow-mcp/health'), response)

    expect(response.statusCode).toBe(200)
    expect(JSON.parse(response.body)).toEqual({
      status: 'ok',
      authEnabled: true,
      sessionStore: expect.objectContaining({
        activeSessions: 2,
        expiredSessionsCleaned: 1,
      }),
      toolMetrics: expect.objectContaining({
        totalCalls: 3,
      }),
    })
  })

  it('returns 404 for removed legacy run-agent-loop route', async () => {
    const handler = createServerHandler()
    const response = createResponse()

    await handler(
      createRequest('POST', '/api/analysis-agent/session/session_1/run-agent-loop', {
        config: {
          maxIterations: 2,
        },
      }),
      response,
    )

    expect(response.statusCode).toBe(404)
    expect(JSON.parse(response.body)).toEqual({ message: '未找到接口' })
  })
})
