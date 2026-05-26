import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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
  disposeAllAgentRuntimes,
  getAgentSession,
  sendAgentSessionMessage,
  syncAgentCanvas,
} from '../workflowAgentGateway.js'
import { getAgentSessionRecord } from '../agentSessionStore.js'

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

  afterEach(async () => {
    await disposeAllAgentRuntimes()
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
    expect(result.session).toMatchObject({
      status: 'idle',
    })
    const record = getAgentSessionRecord(result.session.id)
    expect(record?.session.id).toBe(result.session.id)
    expect(record?.request.agentCapability).toBe('generic_read_write_lite')
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
        agent: 'general',
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
        system: expect.stringContaining('AI 工作助手'),
        format: undefined,
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

  it('explicitly disables non-workflow tools in generic prompt requests', async () => {
    toolIdsMock.mockResolvedValueOnce({
      data: [
        'workflow_get_session_context',
        'workflow_create_workflow',
        'chrome-devtools_list_pages',
        'websearch',
        'read',
      ],
    })

    const created = await createAgentSession({
      request: buildAgentRequest(),
      userId: 'user_1',
    })

    await sendAgentSessionMessage({
      sessionId: created.session.id,
      message: '你好，帮我随便创建一个工作流',
    })

    expect(sessionPromptAsyncMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tools: {
          workflow_get_session_context: true,
          workflow_create_workflow: true,
          'chrome-devtools_list_pages': false,
          websearch: false,
          read: false,
        },
      }),
    )
    expect(createOpencodeServerMock).toHaveBeenCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({
          mcp: {},
          tools: expect.objectContaining({
            '*': false,
            workflow_get_session_context: true,
            workflow_create_workflow: true,
            'workflow_*': true,
          }),
        }),
      }),
    )
  })

  it('rejects permission requests for non-workflow tools', async () => {
    let releaseIdle: (() => void) | null = null
    const idleGate = new Promise<void>((resolve) => {
      releaseIdle = resolve
    })
    eventSubscribeMock.mockResolvedValueOnce({
      stream: {
        async *[Symbol.asyncIterator]() {
          yield {
            type: 'permission.asked',
            properties: {
              id: 'perm_non_workflow_1',
              sessionID: 'opencode_session_1',
              permission: 'chrome-devtools_list_pages',
              patterns: ['*'],
              metadata: {},
              always: [],
              tool: {
                messageID: 'msg_user_1',
                callID: 'tool_call_chrome_1',
              },
            },
          }
          await idleGate
          yield {
            type: 'session.idle',
            properties: {
              sessionID: 'opencode_session_1',
            },
          }
        },
      },
      stop: vi.fn(),
    })
    sessionPromptAsyncMock.mockImplementationOnce(async () => {
      queueMicrotask(() => {
        releaseIdle?.()
      })
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
          },
          parts: [
            {
              type: 'text',
              text: '我先读取了当前上下文，但没有执行其它无关工具。',
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
      message: '你好，帮我随便创建一个工作流',
    })

    await Promise.resolve()
    await new Promise((resolve) => setTimeout(resolve, 0))
    const snapshot = getAgentSession(created.session.id)

    expect(permissionReplyMock).toHaveBeenCalledWith({
      requestID: 'perm_non_workflow_1',
      reply: 'reject',
    })
    expect(result.session.status).toBe('completed')
    expect(snapshot?.session.status).toBe('completed')
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

  it('completes /messages with plain text assistant replies without requiring analysis JSON schema', async () => {
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
            id: 'msg_assistant_plain_1',
            role: 'assistant',
            parentID: 'msg_user_1',
            time: {
              completed: Date.now(),
            },
          },
          parts: [
            {
              type: 'text',
              text: '我先读取了当前工作流上下文，接下来可以帮你检查节点结构或继续调 MCP 工具。',
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
      message: '先看看当前工作流情况',
    })

    await Promise.resolve()
    await new Promise((resolve) => setTimeout(resolve, 0))

    const snapshot = getAgentSession(created.session.id)
    expect(result.session.status).toBe('completed')
    expect(result.assistantMessage?.content).toContain('我先读取了当前工作流上下文')
    expect(snapshot?.session.status).toBe('completed')
    expect(snapshot?.projection.analysis.summary).toContain('我先读取了当前工作流上下文')
    expect(snapshot?.projection.error).toBeNull()
  })

  it('completes /messages when opencode only emits session.status idle in live-like runtimes', async () => {
    eventSubscribeMock.mockResolvedValueOnce({
      stream: {
        async *[Symbol.asyncIterator]() {
          yield {
            type: 'session.status',
            properties: {
              sessionID: 'opencode_session_1',
              status: {
                type: 'idle',
              },
            },
          }
        },
      },
      controller: {
        abort: eventAbortMock,
      },
    })
    sessionMessagesMock.mockResolvedValueOnce({
      data: [
        {
          info: {
            id: 'msg_assistant_plain_idle_1',
            role: 'assistant',
            parentID: 'msg_user_1',
            time: {
              completed: Date.now(),
            },
          },
          parts: [
            {
              type: 'text',
              text: '我已读取工具清单，现在可以继续帮你检查工作流结构。',
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
      message: '先读取工具清单',
    })

    await Promise.resolve()
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(result.session.status).toBe('completed')
    expect(result.assistantMessage?.content).toContain('我已读取工具清单')
    expect(getAgentSession(created.session.id)?.projection.execution.status).toBe('completed')
    expect(eventAbortMock).toHaveBeenCalled()
    expect(serverCloseMock).toHaveBeenCalled()
  })

  it('disposes opencode runtimes on explicit cleanup so smoke processes can exit cleanly', async () => {
    eventSubscribeMock.mockResolvedValueOnce({
      stream: {
        async *[Symbol.asyncIterator]() {},
      },
      controller: {
        abort: eventAbortMock,
      },
    })

    const created = await createAgentSession({
      request: buildAgentRequest(),
      userId: 'user_1',
    })

    await sendAgentSessionMessage({
      sessionId: created.session.id,
      message: '先读取工具清单',
    })

    await disposeAllAgentRuntimes()

    expect(eventAbortMock).toHaveBeenCalled()
    expect(serverCloseMock).toHaveBeenCalled()
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

  it('updates the session workflowSnapshot when agent canvas sync is requested', async () => {
    const created = await createAgentSession({
      request: buildAgentRequest(),
      userId: 'user_1',
    })

    const synced = await syncAgentCanvas({
      sessionId: created.session.id,
      workflowSnapshot: {
        name: '同步后画布',
        nodes: [{ id: 'node_synced', type: 'custom', label: '同步节点' }],
        edges: [],
      },
    })

    const record = getAgentSessionRecord(created.session.id)
    expect(record?.request.workflowSnapshot).toEqual({
      name: '同步后画布',
      nodes: [{ id: 'node_synced', type: 'custom', label: '同步节点' }],
      edges: [],
    })
    expect(record?.projection.workflow).toMatchObject({
      workflowName: '同步后画布',
      draftNodeCount: 1,
      draftEdgeCount: 0,
    })
    expect(record?.projection.canvasSync.status).toBe('synced')
    expect(synced.syncSummary).toContain('已同步当前画布')
  })
})
