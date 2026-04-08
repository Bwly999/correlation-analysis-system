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
} = vi.hoisted(() => ({
  generateWorkflowAiPlanMock: vi.fn(),
  streamWorkflowAiPlanMock: vi.fn(),
  startWorkflowAiSessionMock: vi.fn(),
  submitWorkflowAiSessionInputMock: vi.fn(),
  runWorkflowAiSessionMock: vi.fn(),
  getWorkflowAiSessionMock: vi.fn(),
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
}))

import { createServerHandler } from '../app.js'

type MockResponse = ServerResponse & {
  body: string
  headersMap: Record<string, string>
}

const createRequest = (method: string, url: string, body?: unknown) => {
  const payload = body === undefined ? '' : JSON.stringify(body)
  const stream = Readable.from(payload ? [payload] : []) as IncomingMessage
  stream.method = method
  stream.url = url
  stream.headers = {}
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
  vi.restoreAllMocks()
  generateWorkflowAiPlanMock.mockReset()
  streamWorkflowAiPlanMock.mockReset()
  startWorkflowAiSessionMock.mockReset()
  submitWorkflowAiSessionInputMock.mockReset()
  runWorkflowAiSessionMock.mockReset()
  getWorkflowAiSessionMock.mockReset()
})

describe('workflow ai routes', () => {
  it('starts an analysis agent session from the new session route', async () => {
    startWorkflowAiSessionMock.mockReturnValueOnce({
      sessionId: 'session_1',
      mode: 'create',
      status: 'idle',
      prompt: '帮我分析影响销量的关键因素',
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
      createRequest('POST', '/api/analysis-agent/session/start', {
        mode: 'create',
        prompt: '帮我分析影响销量的关键因素',
        profile: { id: 'custom', name: '测试模型', baseUrl: 'http://example.com', model: 'test', enabled: true, source: 'custom' },
        nodeCatalog: [],
      }),
      response,
    )

    expect(response.statusCode).toBe(200)
    expect(JSON.parse(response.body)).toEqual({
      session: expect.objectContaining({
        sessionId: 'session_1',
        userGoal: '帮我分析影响销量的关键因素',
        phase: 'intent',
        conversation: [
          expect.objectContaining({
            role: 'user',
            content: '帮我分析影响销量的关键因素',
          }),
        ],
        artifacts: [],
        approvalRequests: [],
      }),
    })
  })

  it('syncs canvas state through the analysis agent canvas route', async () => {
    getWorkflowAiSessionMock.mockReturnValueOnce({
      sessionId: 'session_1',
      mode: 'edit',
      status: 'waiting_user',
      prompt: '继续分析',
      draft: {
        summary: '待补全草稿',
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
      missingInfo: [
        {
          key: 'question_1',
          label: '待确认项 1',
          reason: '请确认目标字段',
          blocking: true,
        },
      ],
    })

    const handler = createServerHandler()
    const response = createResponse()

    await handler(
      createRequest('POST', '/api/analysis-agent/session/session_1/canvas-sync', {
        workflowSnapshot: {
          name: '测试工作流',
          nodes: [{ id: 'node_1' }],
          edges: [],
        },
      }),
      response,
    )

    expect(response.statusCode).toBe(200)
    expect(JSON.parse(response.body)).toEqual({
      session: expect.objectContaining({
        sessionId: 'session_1',
        phase: 'waiting_for_input',
      }),
      syncSummary: '已同步当前画布，共 1 个节点、0 条连线',
    })
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
})
