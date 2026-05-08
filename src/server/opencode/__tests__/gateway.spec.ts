import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  createOpencodeServerMock,
  createOpencodeClientMock,
  sessionCreateMock,
  sessionPromptMock,
  sessionPromptAsyncMock,
  sessionMessagesMock,
  mcpAddMock,
  mcpConnectMock,
  toolIdsMock,
  eventSubscribeMock,
  permissionReplyMock,
  serverCloseMock,
  eventAbortMock,
} = vi.hoisted(() => ({
  createOpencodeServerMock: vi.fn(),
  createOpencodeClientMock: vi.fn(),
  sessionCreateMock: vi.fn(),
  sessionPromptMock: vi.fn(),
  sessionPromptAsyncMock: vi.fn(),
  sessionMessagesMock: vi.fn(),
  mcpAddMock: vi.fn(),
  mcpConnectMock: vi.fn(),
  toolIdsMock: vi.fn(),
  eventSubscribeMock: vi.fn(),
  permissionReplyMock: vi.fn(),
  serverCloseMock: vi.fn(),
  eventAbortMock: vi.fn(),
}))

vi.mock('@opencode-ai/sdk/v2', () => ({
  createOpencodeServer: createOpencodeServerMock,
  createOpencodeClient: createOpencodeClientMock,
}))

import {
  createAgentSession,
  getAgentSession,
  runAgenticAnalysisSession,
  sendAgentSessionMessage,
} from '../gateway.js'

const buildAgentRequest = () => ({
  mode: 'edit' as const,
  prompt: '帮我分析价格、折扣和销量之间的关系',
  profile: {
    id: 'custom-model',
    name: '自定义模型',
    baseUrl: 'http://example.com/v1',
    model: 'test-model',
    apiKey: 'test-key',
    enabled: true,
    source: 'custom' as const,
  },
  workflowSnapshot: {
    name: '销量诊断流程',
    nodes: [{ id: 'node_1' }, { id: 'node_2' }],
    edges: [{ id: 'edge_1', source: 'node_1', target: 'node_2' }],
  },
  contextHints: {
    schemaSummaries: [
      {
        nodeId: 'node_2',
        nodeLabel: '销量结果表',
        resultKind: 'table' as const,
        numericColumns: ['price', 'discount', 'sales'],
        candidateTargetColumns: ['sales'],
        candidateFeatureColumns: ['price', 'discount'],
        blockedReasons: [],
      },
    ],
  },
  nodeCatalog: [
    {
      name: 'manual-json-import',
      displayName: '手动输入数据',
      category: 'trigger',
      description: '手动输入 JSON 数据',
      inputMode: 'single' as const,
      minInputs: 0,
      maxInputs: 0,
      allowedNextCategories: ['action'],
      properties: [],
      help: null,
      assistantHints: null,
    },
  ],
})

describe('agent session bridge', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.WORKFLOW_MCP_AUTH_TOKEN

    createOpencodeServerMock.mockResolvedValue({
      url: 'http://127.0.0.1:4096',
      close: serverCloseMock,
    })

    eventSubscribeMock.mockResolvedValue({
      stream: {
        async *[Symbol.asyncIterator]() {},
      },
    })

    sessionCreateMock.mockResolvedValue({
      data: {
        id: 'opencode_session_1',
      },
    })

    sessionPromptAsyncMock.mockResolvedValue({
      data: {
        id: 'run_1',
      },
    })

    sessionPromptMock.mockResolvedValue({
      data: {
        info: {
          structured: {
            assistantMessage: '价格与折扣目前是最值得优先验证的两个候选因子。',
            workflowSummary: '建议先保留导入、筛选和相关性分析三段主链。',
            findings: ['销量适合作为目标字段', 'price 和 discount 适合作为候选因子'],
            methods: ['相关性分析', '随机森林特征重要度'],
            risks: ['当前样本量可能偏少'],
            recommendations: ['先校验缺失值和异常值'],
            workflowPlan: {
              summary: '构建最小销量诊断流程',
              assumptions: [],
              warnings: [],
              questions: [],
              operations: [
                {
                  id: 'node_1',
                  type: 'createNode',
                  nodeType: 'manual-json-import',
                  nodeLabel: '手动输入数据',
                },
              ],
            },
          },
        },
        parts: [],
      },
    })

    createOpencodeClientMock.mockReturnValue({
      mcp: {
        add: mcpAddMock,
        connect: mcpConnectMock,
      },
      tool: {
        ids: toolIdsMock,
      },
      session: {
        create: sessionCreateMock,
        prompt: sessionPromptMock,
        promptAsync: sessionPromptAsyncMock,
        messages: sessionMessagesMock,
      },
      event: {
        subscribe: eventSubscribeMock,
      },
      permission: {
        reply: permissionReplyMock,
      },
    })

    toolIdsMock.mockResolvedValue({
      data: ['workflow_get_session_context', 'workflow_validate_plan'],
    })
    sessionMessagesMock.mockResolvedValue({
      data: [],
    })
  })

  it('creates an agent session with an initial business projection', async () => {
    const result = await createAgentSession({
      request: buildAgentRequest(),
      userId: 'user_1',
    })

    expect(result.session).toMatchObject({
      prompt: '帮我分析价格、折扣和销量之间的关系',
      mode: 'edit',
      status: 'idle',
    })
    expect(result.projection).toMatchObject({
      workflow: expect.objectContaining({
        workflowName: '销量诊断流程',
        draftNodeCount: 2,
        draftEdgeCount: 1,
      }),
      analysis: expect.objectContaining({
        goal: '帮我分析价格、折扣和销量之间的关系',
        candidateTargets: ['sales'],
        candidateFactors: ['price', 'discount'],
      }),
      execution: expect.objectContaining({
        status: 'idle',
      }),
    })
  })

  it('captures event pump failures as projection errors instead of throwing a network reset', async () => {
    const created = await createAgentSession({
      request: buildAgentRequest(),
      userId: 'user_1',
    })

    eventSubscribeMock.mockRejectedValueOnce(new Error('boom'))

    const events: Array<{ type: string; [key: string]: unknown }> = []
    const result = await sendAgentSessionMessage(
      {
        sessionId: created.session.id,
        message: '继续给出当前分析建议',
      },
      (event) => events.push(event as any),
    )

    expect(result.session.status).toBe('running')
    expect(result.projection.execution.status).toBe('running')
    expect(result.projection.error).toMatchObject({
      message: '监听 opencode 事件流失败',
    })
    expect(events.map((event) => event.type)).toEqual(
      expect.arrayContaining([
        'projection.execution.updated',
        'projection.error.updated',
        'session.status.updated',
      ]),
    )
  })

  it('starts a background opencode run with promptAsync and returns a running snapshot immediately', async () => {
    const created = await createAgentSession({
      request: buildAgentRequest(),
      userId: 'user_1',
    })

    const events: Array<{ type: string; [key: string]: unknown }> = []

    const result = await sendAgentSessionMessage(
      {
        sessionId: created.session.id,
        message: '继续给出当前分析建议',
      },
      (event) => events.push(event as any),
    )

    expect(sessionPromptAsyncMock).toHaveBeenCalledTimes(1)
    expect(sessionPromptAsyncMock).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionID: 'opencode_session_1',
        messageID: expect.stringMatching(/^msg_/),
        tools: expect.objectContaining({
          workflow_get_session_context: true,
          workflow_validate_plan: true,
        }),
        parts: [
          {
            type: 'text',
            text: '继续给出当前分析建议',
          },
        ],
      }),
    )
    expect(sessionPromptMock).not.toHaveBeenCalled()
    expect(result.session.status).toBe('running')
    expect(result.projection.execution).toMatchObject({
      status: 'running',
      latestAction: '正在调用 opencode 分析当前业务问题',
    })
    expect(result.assistantMessage).toBeUndefined()
    expect(events.map((event) => event.type)).toEqual(
      expect.arrayContaining([
        'session.status.updated',
        'projection.execution.updated',
      ]),
    )
  })

  it('projects workflow MCP tool call events into the business execution state', async () => {
    eventSubscribeMock.mockResolvedValueOnce({
      stream: {
        async *[Symbol.asyncIterator]() {
          yield {
            type: 'tool.call.started',
            properties: {
              sessionID: 'opencode_session_1',
              toolCallID: 'tool_call_1',
              toolID: 'workflow_get_session_context',
              title: 'workflow_get_session_context',
            },
          }
          yield {
            type: 'tool.call.completed',
            properties: {
              sessionID: 'opencode_session_1',
              toolCallID: 'tool_call_1',
              toolID: 'workflow_get_session_context',
              title: 'workflow_get_session_context',
            },
          }
        },
      },
      stop: vi.fn(),
    })

    const created = await createAgentSession({
      request: buildAgentRequest(),
      userId: 'user_1',
    })
    const events: Array<{ type: string; [key: string]: unknown }> = []

    await sendAgentSessionMessage(
      {
        sessionId: created.session.id,
        message: '继续给出当前分析建议',
      },
      (event) => events.push(event as any),
    )
    await Promise.resolve()
    await new Promise((resolve) => setTimeout(resolve, 0))

    const snapshot = getAgentSession(created.session.id)
    expect(snapshot?.projection.execution.toolCalls).toEqual([
      expect.objectContaining({
        id: 'tool_call_1',
        toolName: 'workflow_get_session_context',
        displayName: '读取分析上下文',
        status: 'success',
      }),
    ])
    expect(events.some((event) => event.type === 'projection.execution.updated')).toBe(true)
  })

  it('marks the session as failed when promptAsync cannot be started', async () => {
    const created = await createAgentSession({
      request: buildAgentRequest(),
      userId: 'user_1',
    })

    sessionPromptAsyncMock.mockRejectedValueOnce(new Error('启动 opencode session 失败'))

    await expect(
      sendAgentSessionMessage({
        sessionId: created.session.id,
        message: '继续给出当前分析建议',
      }),
    ).rejects.toThrow('启动 opencode session 失败')

    const snapshot = await getAgentSession(created.session.id)
    expect(snapshot?.session.status).toBe('failed')
    expect(snapshot?.projection.execution.status).toBe('failed')
    expect(snapshot?.projection.error?.message).toBe('启动 opencode session 失败')
  })

  it('tolerates string workflowPlan payloads from opencode and completes the session', async () => {
    let releaseIdle: (() => void) | null = null
    eventSubscribeMock.mockResolvedValueOnce({
      stream: {
        async *[Symbol.asyncIterator]() {
          await new Promise<void>((resolve) => {
            releaseIdle = resolve
          })
          yield {
            type: 'session.idle',
            properties: {
              sessionID: 'opencode_session_1',
            },
          }
        },
      },
    })
    sessionPromptAsyncMock.mockImplementationOnce(async () => {
      releaseIdle?.()
      return { data: { id: 'run_1' } }
    })
    sessionMessagesMock.mockResolvedValueOnce({
      data: [
        {
          info: {
            id: 'msg_assistant_1',
            role: 'assistant',
            parentID: 'msg_user_1',
            time: {
              completed: Date.now(),
            },
            structured: {
              assistantMessage: '建议先验证价格与折扣对销量的影响。',
              workflowSummary: '先搭一个最小分析链路。',
              findings: ['销量适合作为目标字段'],
              methods: ['相关性分析'],
              risks: [],
              recommendations: ['先清洗异常值'],
              workflowPlan: '暂不输出结构化工作流，先完成字段核验。',
            },
          },
          parts: [
            {
              type: 'text',
              text: '建议先验证价格与折扣对销量的影响。',
            },
          ],
        },
      ],
    })

    const created = await createAgentSession({
      request: buildAgentRequest(),
      userId: 'user_1',
    })

    const result = await sendAgentSessionMessage({
      sessionId: created.session.id,
      message: '继续给出当前分析建议',
    })

    await Promise.resolve()
    await new Promise((resolve) => setTimeout(resolve, 0))

    const snapshot = getAgentSession(created.session.id)
    expect(result.session.status).toBe('completed')
    expect(snapshot?.session.status).toBe('completed')
    expect(snapshot?.projection.execution.status).toBe('completed')
    expect(snapshot?.projection.workflow.proposedPlan).toBeNull()
    expect(snapshot?.projection.error).toBeNull()
  })

  it('surfaces opencode assistant errors when no structured or text reply is available', async () => {
    let releaseIdle: (() => void) | null = null
    eventSubscribeMock.mockResolvedValueOnce({
      stream: {
        async *[Symbol.asyncIterator]() {
          await new Promise<void>((resolve) => {
            releaseIdle = resolve
          })
          yield {
            type: 'session.idle',
            properties: {
              sessionID: 'opencode_session_1',
            },
          }
        },
      },
    })
    sessionPromptAsyncMock.mockImplementationOnce(async () => {
      releaseIdle?.()
      return { data: { id: 'run_1' } }
    })
    sessionMessagesMock.mockResolvedValueOnce({
      data: [
        {
          info: {
            id: 'msg_assistant_timeout_1',
            role: 'assistant',
            parentID: 'msg_user_1',
            time: {
              completed: Date.now(),
            },
            error: {
              name: 'UnknownError',
              message: 'The operation timed out.',
            },
          },
          parts: [
            {
              type: 'reasoning',
              text: '正在整理业务上下文',
            },
          ],
        },
      ],
    })

    const created = await createAgentSession({
      request: buildAgentRequest(),
      userId: 'user_1',
    })

    const result = await sendAgentSessionMessage({
      sessionId: created.session.id,
      message: '继续给出当前分析建议',
    })

    await Promise.resolve()
    await new Promise((resolve) => setTimeout(resolve, 0))

    const snapshot = getAgentSession(created.session.id)
    expect(result.session.status).toBe('failed')
    expect(snapshot?.session.status).toBe('failed')
    expect(snapshot?.projection.execution.status).toBe('failed')
    expect(snapshot?.projection.error?.message).toBe('The operation timed out.')
  })

  it('coerces string list fields from opencode structured payloads and completes the session', async () => {
    let releaseIdle: (() => void) | null = null
    eventSubscribeMock.mockResolvedValueOnce({
      stream: {
        async *[Symbol.asyncIterator]() {
          await new Promise<void>((resolve) => {
            releaseIdle = resolve
          })
          yield {
            type: 'session.idle',
            properties: {
              sessionID: 'opencode_session_1',
            },
          }
        },
      },
    })
    sessionPromptAsyncMock.mockImplementationOnce(async () => {
      releaseIdle?.()
      return { data: { id: 'run_1' } }
    })
    sessionMessagesMock.mockResolvedValueOnce({
      data: [
        {
          info: {
            id: 'msg_assistant_2',
            role: 'assistant',
            parentID: 'msg_user_1',
            time: {
              completed: Date.now(),
            },
            structured: {
              assistantMessage: '销量与价格、折扣的相关性分析具备高业务价值。',
              workflowSummary: '建议先搭建最小相关性分析流程。',
              findings: '价格和折扣都值得先做相关性筛查',
              methods: 'Pearson 相关系数',
              risks: '',
              recommendations: '先确认销量字段口径',
              workflowPlan: null,
            },
          },
          parts: [
            {
              type: 'text',
              text: '销量与价格、折扣的相关性分析具备高业务价值。',
            },
          ],
        },
      ],
    })

    const created = await createAgentSession({
      request: buildAgentRequest(),
      userId: 'user_1',
    })

    const result = await sendAgentSessionMessage({
      sessionId: created.session.id,
      message: '继续给出当前分析建议',
    })

    await Promise.resolve()
    await new Promise((resolve) => setTimeout(resolve, 0))

    const snapshot = getAgentSession(created.session.id)
    expect(result.session.status).toBe('completed')
    expect(snapshot?.session.status).toBe('completed')
    expect(snapshot?.projection.execution.status).toBe('completed')
    expect(snapshot?.projection.analysis.summary).toContain('销量与价格、折扣的相关性分析具备高业务价值')
    expect(snapshot?.projection.analysis.findings).toEqual(['价格和折扣都值得先做相关性筛查'])
    expect(snapshot?.projection.analysis.methods).toEqual(['Pearson 相关系数'])
    expect(snapshot?.projection.analysis.recommendations).toEqual(['先确认销量字段口径'])
    expect(snapshot?.projection.error).toBeNull()
  })

  it('forwards the internal MCP auth token when workflow MCP auth is enabled', async () => {
    process.env.WORKFLOW_MCP_AUTH_TOKEN = 'test-mcp-token'

    const created = await createAgentSession({
      request: buildAgentRequest(),
      userId: 'user_1',
    })

    await sendAgentSessionMessage({
      sessionId: created.session.id,
      message: '继续给出当前分析建议',
    })

    expect(mcpAddMock).toHaveBeenCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({
          headers: expect.objectContaining({
            'x-workflow-mcp-auth-token': 'test-mcp-token',
          }),
        }),
      }),
    )
  })

  it('runs agentic-run through the agent kernel and waits for data when context is missing', async () => {
    const created = await createAgentSession({
      request: {
        ...buildAgentRequest(),
        contextHints: undefined,
        dataSources: [],
      },
      userId: 'user_1',
    })
    const events: Array<{ type: string; [key: string]: unknown }> = []

    const result = await runAgenticAnalysisSession(
      {
        sessionId: created.session.id,
        message: '请自动分析销量影响因素',
      },
      (event) => events.push(event as any),
    )

    expect(result.projection.execution.latestAction).toBe('等待补充数据源或字段摘要')
    expect(result.projection.analysis.summary).toBe('需要先提供可分析的数据源或字段摘要。')
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'agentic.stage.updated',
          run: expect.objectContaining({
            runId: `kernel_${created.session.id}`,
            stage: 'waiting_user',
            message: '需要先提供可分析的数据源或字段摘要',
          }),
        }),
      ]),
    )
  })

  it('clears stale projection errors when agentic-run reaches a safe waiting state', async () => {
    const created = await createAgentSession({
      request: {
        ...buildAgentRequest(),
        contextHints: undefined,
        dataSources: [],
      },
      userId: 'user_1',
    })

    sessionPromptAsyncMock.mockRejectedValueOnce(new Error('Opencode 未返回可解析的助手消息'))
    await expect(
      sendAgentSessionMessage({
        sessionId: created.session.id,
        message: '先走一次普通消息',
      }),
    ).rejects.toThrow('Opencode 未返回可解析的助手消息')

    const failedSnapshot = getAgentSession(created.session.id)
    expect(failedSnapshot?.projection.error?.message).toBe('Opencode 未返回可解析的助手消息')

    const result = await runAgenticAnalysisSession({
      sessionId: created.session.id,
      message: '请自动分析销量影响因素',
    })

    expect(result.projection.execution).toMatchObject({
      status: 'completed',
      latestAction: '等待补充数据源或字段摘要',
    })
    expect(result.projection.execution.lastFailure).toBeUndefined()
    expect(result.projection.error).toBeNull()
  })

  it('runs agentic-run through the agent kernel opencode adapter when data context exists', async () => {
    const created = await createAgentSession({
      request: buildAgentRequest(),
      userId: 'user_1',
    })

    const result = await runAgenticAnalysisSession({
      sessionId: created.session.id,
      message: '请自动分析销量影响因素并生成报告',
    })

    expect(sessionPromptMock).toHaveBeenCalledTimes(3)
    expect(sessionPromptMock).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionID: 'opencode_session_1',
        system: expect.stringContaining('数据分析领域的 Agentic 分析代理'),
        parts: [
          {
            type: 'text',
            text: expect.stringContaining('请自动分析销量影响因素并生成报告'),
          },
        ],
      }),
    )
    expect(result.session.status).toBe('failed')
    expect(result.projection.execution).toMatchObject({
      status: 'failed',
      latestAction: 'Agent Kernel 执行失败',
    })
    expect(result.projection.analysis.summary).toBe('Agent Kernel 执行失败，请查看错误详情。')
  })

  it('completes agentic-run when opencode messages contain execution and evidence observations', async () => {
    let releaseIdle: (() => void) | null = null
    eventSubscribeMock.mockResolvedValueOnce({
      stream: {
        async *[Symbol.asyncIterator]() {
          await new Promise<void>((resolve) => {
            releaseIdle = resolve
          })
          yield {
            type: 'session.idle',
            properties: {
              sessionID: 'opencode_session_1',
            },
          }
        },
      },
    })
    sessionPromptAsyncMock.mockImplementationOnce(async () => {
      releaseIdle?.()
      return { data: { id: 'run_1' } }
    })
    sessionPromptMock.mockResolvedValueOnce({
      data: {
        info: {
          id: 'msg_assistant_agentic_1',
          role: 'assistant',
          parentID: 'msg_user_1',
          time: {
            completed: Date.now(),
          },
        },
        parts: [
          {
            type: 'text',
            text: '已完成销量影响因素分析，并抽取证据。',
          },
          {
            type: 'tool',
            tool: 'workflow_test_workflow',
            state: {
              status: 'completed',
              output: {
                ok: true,
                executionId: 'exec_1',
                status: 'success',
              },
            },
          },
          {
            type: 'tool',
            tool: 'workflow_extract_result_evidence',
            state: {
              status: 'completed',
              output: {
                evidence: [{ evidenceId: 'exec_1:node_pearson_1' }],
              },
            },
          },
        ],
      },
    })

    const created = await createAgentSession({
      request: buildAgentRequest(),
      userId: 'user_1',
    })

    const result = await runAgenticAnalysisSession({
      sessionId: created.session.id,
      message: '请自动分析销量影响因素并生成报告',
    })

    expect(result.session.status).toBe('completed')
    expect(result.projection.execution).toMatchObject({
      status: 'completed',
      latestAction: 'Agent Kernel 分析完成',
    })
    expect(result.projection.analysis.summary).toBe('Agent Kernel 已完成本轮分析闭环。')
  })

  it('parses JSON string tool outputs as agentic observations', async () => {
    sessionPromptMock.mockResolvedValueOnce({
      data: {
        info: {
          id: 'msg_assistant_agentic_json_tool',
          role: 'assistant',
          time: {
            completed: Date.now(),
          },
        },
        parts: [
          {
            type: 'tool',
            tool: 'workflow_test_workflow',
            state: {
              status: 'completed',
              output: JSON.stringify({
                ok: true,
                executionId: 'exec_1',
                status: 'success',
              }),
            },
          },
          {
            type: 'tool',
            tool: 'workflow_extract_result_evidence',
            state: {
              status: 'completed',
              output: JSON.stringify({
                evidence: [{ evidenceId: 'exec_1:node_pearson_1' }],
              }),
            },
          },
        ],
      },
    })

    const created = await createAgentSession({
      request: buildAgentRequest(),
      userId: 'user_1',
    })

    const result = await runAgenticAnalysisSession({
      sessionId: created.session.id,
      message: '请自动分析销量影响因素并生成报告',
    })

    expect(result.projection.execution).toMatchObject({
      status: 'completed',
      latestAction: 'Agent Kernel 分析完成',
    })
  })
})
