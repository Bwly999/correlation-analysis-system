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
  createAgentSessionMock,
  getAgentProjectionMock,
  getAgentSessionSnapshotMock,
  runAgenticAnalysisSessionMock,
  sendAgentSessionMessageMock,
  subscribeToAgentSessionEventsMock,
  syncAgentCanvasMock,
  getAgentObservabilityDebugFilesMock,
  getAgentObservabilityDebugHealthMock,
  getAgentObservabilityDebugReplayMock,
  getAgentObservabilityDebugTraceMock,
  handleWorkflowMcpRequestMock,
  getWorkflowMcpHealthSnapshotMock,
  isWorkflowMcpHealthRequestMock,
  isWorkflowMcpRequestMock,
} = vi.hoisted(() => ({
  generateWorkflowAiPlanMock: vi.fn(),
  streamWorkflowAiPlanMock: vi.fn(),
  startWorkflowAiSessionMock: vi.fn(),
  submitWorkflowAiSessionInputMock: vi.fn(),
  runWorkflowAiSessionMock: vi.fn(),
  getWorkflowAiSessionMock: vi.fn(),
  getWorkflowAiSessionRecordMock: vi.fn(),
  createAgentSessionMock: vi.fn(),
  getAgentProjectionMock: vi.fn(),
  getAgentSessionSnapshotMock: vi.fn(),
  runAgenticAnalysisSessionMock: vi.fn(),
  sendAgentSessionMessageMock: vi.fn(),
  subscribeToAgentSessionEventsMock: vi.fn(),
  syncAgentCanvasMock: vi.fn(),
  getAgentObservabilityDebugFilesMock: vi.fn(),
  getAgentObservabilityDebugHealthMock: vi.fn(),
  getAgentObservabilityDebugReplayMock: vi.fn(),
  getAgentObservabilityDebugTraceMock: vi.fn(),
  handleWorkflowMcpRequestMock: vi.fn(),
  getWorkflowMcpHealthSnapshotMock: vi.fn(),
  isWorkflowMcpHealthRequestMock: vi.fn((pathname: string) => pathname === '/api/opencode/workflow-mcp/health'),
  isWorkflowMcpRequestMock: vi.fn((pathname: string) => pathname === '/api/opencode/workflow-mcp'),
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

vi.mock('../opencode/gateway.js', () => ({
  createAgentSession: createAgentSessionMock,
  getAgentProjection: getAgentProjectionMock,
  getAgentSession: getAgentSessionSnapshotMock,
  runAgenticAnalysisSession: runAgenticAnalysisSessionMock,
  sendAgentSessionMessage: sendAgentSessionMessageMock,
  subscribeToAgentSessionEvents: subscribeToAgentSessionEventsMock,
  syncAgentCanvas: syncAgentCanvasMock,
  getAgentObservabilityDebugFiles: getAgentObservabilityDebugFilesMock,
  getAgentObservabilityDebugHealth: getAgentObservabilityDebugHealthMock,
  getAgentObservabilityDebugReplay: getAgentObservabilityDebugReplayMock,
  getAgentObservabilityDebugTrace: getAgentObservabilityDebugTraceMock,
}))

vi.mock('../opencode/workflowMcpServer.js', () => ({
  handleWorkflowMcpRequest: handleWorkflowMcpRequestMock,
  getWorkflowMcpHealthSnapshot: getWorkflowMcpHealthSnapshotMock,
  isWorkflowMcpHealthRequest: isWorkflowMcpHealthRequestMock,
  isWorkflowMcpRequest: isWorkflowMcpRequestMock,
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
  createAgentSessionMock.mockReset()
  getAgentProjectionMock.mockReset()
  getAgentSessionSnapshotMock.mockReset()
  sendAgentSessionMessageMock.mockReset()
  subscribeToAgentSessionEventsMock.mockReset()
  syncAgentCanvasMock.mockReset()
  getAgentObservabilityDebugFilesMock.mockReset()
  getAgentObservabilityDebugHealthMock.mockReset()
  getAgentObservabilityDebugReplayMock.mockReset()
  getAgentObservabilityDebugTraceMock.mockReset()
  handleWorkflowMcpRequestMock.mockReset()
  getWorkflowMcpHealthSnapshotMock.mockReset()
  isWorkflowMcpHealthRequestMock.mockImplementation((pathname: string) => pathname === '/api/opencode/workflow-mcp/health')
  isWorkflowMcpRequestMock.mockImplementation((pathname: string) => pathname === '/api/opencode/workflow-mcp')
})

describe('workflow ai routes', () => {
  it('rejects agent session creation when workflow-scoped requests omit the workflow user', async () => {
    const handler = createServerHandler()
    const response = createResponse()

    await handler(
      createRequest('POST', '/api/agent/sessions', {
        mode: 'edit',
        prompt: '帮我分析影响销量的关键因素',
        profile: { id: 'custom', name: '测试模型', baseUrl: 'http://example.com', model: 'glm-4.7', enabled: true, source: 'custom' },
        nodeCatalog: [],
      }, {}),
      response,
    )

    expect(response.statusCode).toBe(400)
    expect(JSON.parse(response.body)).toEqual({
      message: '缺少用户标识，请通过 x-workflow-user-id 请求头或 defaultUser 依赖注入提供用户',
    })
  })

  it('uses explicitly injected current user when creating agent session', async () => {
    createAgentSessionMock.mockResolvedValueOnce({
      session: {
        id: 'agent_injected',
        mode: 'edit',
        prompt: '帮我分析影响销量的关键因素',
        status: 'idle',
        profile: {
          id: 'custom',
          name: '测试模型',
          model: 'glm-4.7',
        },
        workflowId: null,
        createdAt: 1,
        updatedAt: 1,
      },
      projection: {
        workflow: {
          workflowId: null,
          workflowName: '销量诊断流程',
          draftNodeCount: 2,
          draftEdgeCount: 1,
          draftSummary: '已载入当前画布，等待开始分析。',
          versionCount: 0,
          latestVersionId: null,
          proposedPlan: null,
        },
        analysis: {
          goal: '帮我分析影响销量的关键因素',
          summary: '系统已记录当前分析目标，等待模型开始处理。',
          candidateTargets: ['sales'],
          candidateFactors: ['price', 'discount'],
          methods: [],
          findings: [],
          risks: [],
          recommendations: [],
        },
        execution: {
          status: 'idle',
          latestAction: '等待用户发送分析指令',
          toolCalls: [],
          pendingApprovals: [],
        },
        canvasSync: {
          status: 'idle',
          message: '当前草案尚未同步到画布',
        },
        error: null,
        updatedAt: 1,
      },
    })

    const handler = createServerHandler({
      resolveStorageUser: () => ({
        id: 'injected-user-id',
        name: '注入用户',
      }),
    })
    const response = createResponse()

    await handler(
      createRequest('POST', '/api/agent/sessions', {
        mode: 'edit',
        prompt: '帮我分析影响销量的关键因素',
        profile: { id: 'custom', name: '测试模型', baseUrl: 'http://example.com', model: 'glm-4.7', enabled: true, source: 'custom' },
        workflowSnapshot: {
          name: '销量诊断流程',
          nodes: [{ id: 'node_1' }, { id: 'node_2' }],
          edges: [{ id: 'edge_1', source: 'node_1', target: 'node_2' }],
        },
        nodeCatalog: [],
      }),
      response,
    )

    expect(response.statusCode).toBe(200)
    expect(createAgentSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'injected-user-id',
      }),
    )
  })

  it('creates an agent session from the new session route', async () => {
    createAgentSessionMock.mockResolvedValueOnce({
      session: {
        id: 'agent_1',
        mode: 'edit',
        prompt: '帮我分析影响销量的关键因素',
        status: 'idle',
        profile: {
          id: 'custom',
          name: '测试模型',
          model: 'glm-4.7',
        },
        workflowId: null,
        createdAt: 1,
        updatedAt: 1,
      },
      projection: {
        workflow: {
          workflowId: null,
          workflowName: '销量诊断流程',
          draftNodeCount: 2,
          draftEdgeCount: 1,
          draftSummary: '已载入当前画布，等待开始分析。',
          versionCount: 0,
          latestVersionId: null,
          proposedPlan: null,
        },
        analysis: {
          goal: '帮我分析影响销量的关键因素',
          summary: '系统已记录当前分析目标，等待模型开始处理。',
          candidateTargets: ['sales'],
          candidateFactors: ['price', 'discount'],
          methods: [],
          findings: [],
          risks: [],
          recommendations: [],
        },
        execution: {
          status: 'idle',
          latestAction: '等待用户发送分析指令',
          toolCalls: [],
          pendingApprovals: [],
        },
        canvasSync: {
          status: 'idle',
          message: '当前草案尚未同步到画布',
        },
        error: null,
        updatedAt: 1,
      },
    })

    const handler = createServerHandler()
    const response = createResponse()

    await handler(
      createRequest('POST', '/api/agent/sessions', {
        mode: 'edit',
        prompt: '帮我分析影响销量的关键因素',
        profile: { id: 'custom', name: '测试模型', baseUrl: 'http://example.com', model: 'glm-4.7', enabled: true, source: 'custom' },
        workflowSnapshot: {
          name: '销量诊断流程',
          nodes: [{ id: 'node_1' }, { id: 'node_2' }],
          edges: [{ id: 'edge_1', source: 'node_1', target: 'node_2' }],
        },
        nodeCatalog: [],
      }),
      response,
    )

    expect(response.statusCode).toBe(200)
    expect(createAgentSessionMock).toHaveBeenCalledWith({
      request: expect.objectContaining({
        prompt: '帮我分析影响销量的关键因素',
      }),
      userId: 'workflow-ai-route-user',
    })
    expect(JSON.parse(response.body)).toEqual({
      session: expect.objectContaining({
        id: 'agent_1',
        status: 'idle',
      }),
      projection: expect.objectContaining({
        workflow: expect.objectContaining({
          workflowName: '销量诊断流程',
        }),
      }),
    })
  })

  it('uses auth-injected workflow user when creating an agent session', async () => {
    createAgentSessionMock.mockResolvedValueOnce({
      session: {
        id: 'agent_jwt',
        mode: 'edit',
        prompt: '帮我分析影响销量的关键因素',
        status: 'idle',
        profile: {
          id: 'custom',
          name: '测试模型',
          model: 'glm-4.7',
        },
        workflowId: null,
        createdAt: 1,
        updatedAt: 1,
      },
      projection: {
        workflow: {
          workflowId: null,
          workflowName: '销量诊断流程',
          draftNodeCount: 2,
          draftEdgeCount: 1,
          draftSummary: '已载入当前画布，等待开始分析。',
          versionCount: 0,
          latestVersionId: null,
          proposedPlan: null,
        },
        analysis: {
          goal: '帮我分析影响销量的关键因素',
          summary: '系统已记录当前分析目标，等待模型开始处理。',
          candidateTargets: ['sales'],
          candidateFactors: ['price', 'discount'],
          methods: [],
          findings: [],
          risks: [],
          recommendations: [],
        },
        execution: {
          status: 'idle',
          latestAction: '等待用户发送分析指令',
          toolCalls: [],
          pendingApprovals: [],
        },
        canvasSync: {
          status: 'idle',
          message: '当前草案尚未同步到画布',
        },
        error: null,
        updatedAt: 1,
      },
    })
    const handler = createServerHandler({
      authGuard: {
        async authenticate(headers) {
          headers['x-workflow-user-id'] = 'jwt-agent-user'
          headers['x-workflow-user-name'] = 'JWT Agent 用户'
          return { enabled: true, user: { id: 'jwt-agent-user', name: 'JWT Agent 用户' } }
        },
      },
    })
    const response = createResponse()

    await handler(
      createRequest('POST', '/api/agent/sessions', {
        mode: 'edit',
        prompt: '帮我分析影响销量的关键因素',
        profile: { id: 'custom', name: '测试模型', baseUrl: 'http://example.com', model: 'glm-4.7', enabled: true, source: 'custom' },
        nodeCatalog: [],
      }, {
        'x-workflow-user-id': 'spoofed-user',
        'x-workflow-user-name': '伪造用户',
      }),
      response,
    )

    expect(response.statusCode).toBe(200)
    expect(createAgentSessionMock).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'jwt-agent-user',
    }))
  })

  it('sends a message through the agent session message route', async () => {
    sendAgentSessionMessageMock.mockResolvedValueOnce({
      session: {
        id: 'agent_1',
        mode: 'edit',
        prompt: '帮我分析影响销量的关键因素',
        status: 'completed',
        profile: {
          id: 'custom',
          name: '测试模型',
          model: 'glm-4.7',
        },
        workflowId: null,
        createdAt: 1,
        updatedAt: 2,
      },
      projection: {
        workflow: {
          workflowId: null,
          workflowName: '销量诊断流程',
          draftNodeCount: 2,
          draftEdgeCount: 1,
          draftSummary: '建议先保留导入、筛选和相关性分析三段主链。',
          versionCount: 0,
          latestVersionId: null,
          proposedPlan: null,
        },
        analysis: {
          goal: '帮我分析影响销量的关键因素',
          summary: '价格和折扣目前是最值得优先验证的两个候选因子。',
          candidateTargets: ['sales'],
          candidateFactors: ['price', 'discount'],
          methods: ['相关性分析'],
          findings: ['销量适合作为目标字段'],
          risks: [],
          recommendations: ['先校验缺失值和异常值'],
        },
        execution: {
          status: 'completed',
          latestAction: '本轮分析已完成',
          toolCalls: [],
          pendingApprovals: [],
        },
        canvasSync: {
          status: 'idle',
          message: '当前草案尚未同步到画布',
        },
        error: null,
        updatedAt: 2,
      },
      assistantMessage: {
        id: 'assistant_1',
        role: 'assistant',
        content: '价格和折扣目前是最值得优先验证的两个候选因子。',
        status: 'completed',
        createdAt: 2,
      },
    })

    const handler = createServerHandler()
    const response = createResponse()

    await handler(
      createRequest('POST', '/api/agent/sessions/agent_1/messages', {
        content: '继续分析当前销量问题',
      }),
      response,
    )

    expect(response.statusCode).toBe(200)
    expect(sendAgentSessionMessageMock).toHaveBeenCalledWith(
      {
        sessionId: 'agent_1',
        message: '继续分析当前销量问题',
      },
      expect.any(Function),
    )
    expect(JSON.parse(response.body)).toEqual({
      session: expect.objectContaining({
        id: 'agent_1',
        status: 'completed',
      }),
      projection: expect.objectContaining({
        analysis: expect.objectContaining({
          summary: '价格和折扣目前是最值得优先验证的两个候选因子。',
        }),
      }),
      assistantMessage: expect.objectContaining({
        role: 'assistant',
      }),
    })
  })

  it('starts an agentic analysis run through the agent session route', async () => {
    runAgenticAnalysisSessionMock.mockResolvedValueOnce({
      session: {
        id: 'agent_1',
        mode: 'edit',
        prompt: '帮我分析影响销量的关键因素',
        status: 'running',
        profile: {
          id: 'custom',
          name: '测试模型',
          model: 'glm-4.7',
        },
        workflowId: null,
        createdAt: 1,
        updatedAt: 2,
      },
      projection: {
        workflow: {
          workflowId: null,
          workflowName: '销量诊断流程',
          draftNodeCount: 2,
          draftEdgeCount: 1,
          draftSummary: '已进入 agentic 分析流程。',
          versionCount: 0,
          latestVersionId: null,
          proposedPlan: null,
        },
        analysis: {
          goal: '帮我分析影响销量的关键因素',
          summary: '系统已开始 agentic 分析。',
          candidateTargets: ['sales'],
          candidateFactors: ['price', 'discount'],
          methods: [],
          findings: [],
          risks: [],
          recommendations: [],
        },
        execution: {
          status: 'running',
          latestAction: 'Agentic 分析已启动',
          toolCalls: [],
          pendingApprovals: [],
        },
        canvasSync: {
          status: 'idle',
          message: '当前草案尚未同步到画布',
        },
        error: null,
        updatedAt: 2,
      },
    })

    const handler = createServerHandler()
    const response = createResponse()

    await handler(
      createRequest('POST', '/api/agent/sessions/agent_1/agentic-run', {
        content: '开始 agentic 分析',
      }),
      response,
    )

    expect(response.statusCode).toBe(200)
    expect(runAgenticAnalysisSessionMock).toHaveBeenCalledWith(
      {
        sessionId: 'agent_1',
        message: '开始 agentic 分析',
      },
      expect.any(Function),
    )
    expect(JSON.parse(response.body)).toEqual({
      session: expect.objectContaining({
        id: 'agent_1',
        status: 'running',
      }),
      projection: expect.objectContaining({
        execution: expect.objectContaining({
          latestAction: 'Agentic 分析已启动',
        }),
      }),
    })
  })

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

  it('returns 404 for agent dev trace routes outside development mode', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    const handler = createServerHandler()
    const response = createResponse()

    await handler(createRequest('GET', '/api/agent/sessions/agent_1/debug-trace'), response)

    expect(response.statusCode).toBe(404)
    expect(JSON.parse(response.body)).toEqual({ message: '未找到接口' })
    expect(getAgentObservabilityDebugTraceMock).not.toHaveBeenCalled()
  })

  it('returns the current agent debug trace in development mode', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    getAgentObservabilityDebugTraceMock.mockReturnValueOnce({
      enabled: true,
      sessionId: 'agent_1',
      traceId: 'trace_agent_1',
      eventCount: 3,
      projectionSnapshotCount: 1,
      latestStatus: 'running',
      files: {
        rootDir: 'C:\\trace\\agent_1',
        manifestFile: 'C:\\trace\\agent_1\\manifest.json',
        eventsFile: 'C:\\trace\\agent_1\\events.ndjson',
        projectionSnapshotsFile: 'C:\\trace\\agent_1\\projection-snapshots.ndjson',
        rawMessagesFile: 'C:\\trace\\agent_1\\raw-messages.ndjson',
        sessionFile: 'C:\\trace\\agent_1\\session.json',
        summaryFile: 'C:\\trace\\agent_1\\summary.json',
        failureFile: null,
      },
      summary: {
        sessionId: 'agent_1',
        traceId: 'trace_agent_1',
        startedAt: 1,
        lastUpdatedAt: 2,
        eventCount: 3,
        projectionSnapshotCount: 1,
        rawMessageCount: 0,
        parseFailureCount: 0,
        failed: false,
        latestStatus: 'running',
        latestError: null,
      },
      events: [
        {
          sessionId: 'agent_1',
          traceId: 'trace_agent_1',
          seq: 1,
          timestamp: 1,
          source: 'agent-route',
          kind: 'session.lifecycle',
          summary: '会话已创建',
          payload: { status: 'idle' },
        },
      ],
      projectionSnapshots: [],
      rawMessages: [],
      parseFailures: [],
    })

    const handler = createServerHandler()
    const response = createResponse()

    await handler(createRequest('GET', '/api/agent/sessions/agent_1/debug-trace?limit=50&offset=0'), response)

    expect(response.statusCode).toBe(200)
    expect(getAgentObservabilityDebugTraceMock).toHaveBeenCalledWith('agent_1', {
      limit: 50,
      offset: 0,
    })
    expect(JSON.parse(response.body)).toEqual(
      expect.objectContaining({
        enabled: true,
        sessionId: 'agent_1',
        eventCount: 3,
      }),
    )
  })

  it('returns the current agent debug replay in development mode', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    getAgentObservabilityDebugReplayMock.mockReturnValueOnce({
      sessionId: 'agent_1',
      traceId: 'trace_agent_1',
      totalEvents: 3,
      replayMarkers: [
        {
          label: '会话创建',
          seq: 1,
          timestamp: 1,
          kind: 'session.lifecycle',
        },
      ],
      state: {
        cursorSeq: 1,
        sessionStatus: 'idle',
        latestKernelStage: null,
        latestKernelMessage: null,
        latestToolCalls: [],
        latestProjection: null,
        latestRawMessage: null,
        latestError: null,
      },
    })

    const handler = createServerHandler()
    const response = createResponse()

    await handler(createRequest('GET', '/api/agent/sessions/agent_1/debug-trace/replay?seq=1'), response)

    expect(response.statusCode).toBe(200)
    expect(getAgentObservabilityDebugReplayMock).toHaveBeenCalledWith('agent_1', 1)
    expect(JSON.parse(response.body)).toEqual(
      expect.objectContaining({
        sessionId: 'agent_1',
        traceId: 'trace_agent_1',
        totalEvents: 3,
      }),
    )
  })

  it('returns the current agent debug files in development mode', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    getAgentObservabilityDebugFilesMock.mockReturnValueOnce({
      rootDir: 'C:\\trace\\agent_1',
      manifestFile: 'C:\\trace\\agent_1\\manifest.json',
      eventsFile: 'C:\\trace\\agent_1\\events.ndjson',
      projectionSnapshotsFile: 'C:\\trace\\agent_1\\projection-snapshots.ndjson',
      rawMessagesFile: 'C:\\trace\\agent_1\\raw-messages.ndjson',
      sessionFile: 'C:\\trace\\agent_1\\session.json',
      summaryFile: 'C:\\trace\\agent_1\\summary.json',
      failureFile: null,
    })

    const handler = createServerHandler()
    const response = createResponse()

    await handler(createRequest('GET', '/api/agent/sessions/agent_1/debug-trace/files'), response)

    expect(response.statusCode).toBe(200)
    expect(getAgentObservabilityDebugFilesMock).toHaveBeenCalledWith('agent_1')
    expect(JSON.parse(response.body)).toEqual(
      expect.objectContaining({
        rootDir: 'C:\\trace\\agent_1',
      }),
    )
  })

  it('returns agent debug health in development mode', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    getAgentObservabilityDebugHealthMock.mockReturnValueOnce({
      enabled: true,
      logRootDir: 'C:\\repo\\.workflow-debug\\agent-observability',
      activeTraceCount: 1,
      lastWriteAt: 2,
      writeFailures: 0,
    })

    const handler = createServerHandler()
    const response = createResponse()

    await handler(createRequest('GET', '/api/agent/debug/health'), response)

    expect(response.statusCode).toBe(200)
    expect(getAgentObservabilityDebugHealthMock).toHaveBeenCalledTimes(1)
    expect(JSON.parse(response.body)).toEqual(
      expect.objectContaining({
        enabled: true,
        activeTraceCount: 1,
      }),
    )
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
