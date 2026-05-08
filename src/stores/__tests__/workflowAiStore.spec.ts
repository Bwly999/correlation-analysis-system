import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useWorkflowAiStore } from '../workflowAiStore'

const {
  createAgentSessionMock,
  fetchSystemModelProfilesMock,
  getAgentProjectionMock,
  getAgentSessionMock,
  sendAgentSessionMessageMock,
  streamAgentSessionEventsMock,
  syncAgentCanvasMock,
  testWorkflowAiModelProfileMock,
} = vi.hoisted(() => ({
  createAgentSessionMock: vi.fn(),
  fetchSystemModelProfilesMock: vi.fn(),
  getAgentProjectionMock: vi.fn(),
  getAgentSessionMock: vi.fn(),
  sendAgentSessionMessageMock: vi.fn(),
  streamAgentSessionEventsMock: vi.fn(),
  syncAgentCanvasMock: vi.fn(),
  testWorkflowAiModelProfileMock: vi.fn(),
}))

vi.mock('@/services/agentWorkspace', () => ({
  WorkflowAiRequestError: class WorkflowAiRequestError extends Error {},
  createAgentSession: createAgentSessionMock,
  fetchSystemModelProfiles: fetchSystemModelProfilesMock,
  getAgentProjection: getAgentProjectionMock,
  getAgentSession: getAgentSessionMock,
  sendAgentSessionMessage: sendAgentSessionMessageMock,
  streamAgentSessionEvents: streamAgentSessionEventsMock,
  syncAgentCanvas: syncAgentCanvasMock,
  testWorkflowAiModelProfile: testWorkflowAiModelProfileMock,
}))

const buildProfile = () => ({
  id: 'profile_1',
  name: '默认模型',
  baseUrl: 'http://example.com',
  model: 'glm-4.7',
  apiKey: 'secret',
  enabled: true,
  source: 'custom' as const,
})

const buildProjection = (overrides: Record<string, any> = {}) => ({
  workflow: {
    workflowId: null,
    workflowName: '销量诊断流程',
    draftNodeCount: 2,
    draftEdgeCount: 1,
    draftSummary: '建议先保留导入、筛选和相关性分析三段主链。',
    versionCount: 0,
    latestVersionId: null,
    proposedPlan: {
      summary: '构建最小销量诊断流程',
      assumptions: [],
      warnings: [],
      questions: [],
      operations: [],
    },
  },
  analysis: {
    goal: '帮我分析价格和销量关系',
    summary: '价格是当前最值得优先验证的候选因子。',
    candidateTargets: ['sales'],
    candidateFactors: ['price', 'discount'],
    methods: ['相关性分析', '随机森林特征重要度'],
    findings: ['销量适合作为目标字段'],
    risks: ['当前样本量可能偏少'],
    recommendations: ['先校验缺失值和异常值'],
  },
  execution: {
    status: 'completed' as const,
    latestAction: '本轮分析已完成',
    toolCalls: [],
    pendingApprovals: [],
  },
  canvasSync: {
    status: 'idle' as const,
    message: '当前草案尚未同步到画布',
  },
  error: null,
  updatedAt: 1,
  ...overrides,
})

describe('workflowAiStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    vi.clearAllMocks()
  })

  it('loads available model profiles', async () => {
    fetchSystemModelProfilesMock.mockResolvedValueOnce([buildProfile()])

    const store = useWorkflowAiStore()
    await store.loadProfiles()

    expect(store.profiles).toHaveLength(1)
    expect(store.selectedProfile?.id).toBe('profile_1')
  })

  it('auto-selects an enabled custom profile restored from local storage', () => {
    localStorage.setItem(
      'workflow_ai_custom_profiles',
      JSON.stringify([buildProfile()]),
    )

    const store = useWorkflowAiStore()

    expect(store.selectedProfileId).toBe('profile_1')
    expect(store.selectedProfile?.id).toBe('profile_1')
  })

  it('does not auto-select an unavailable system profile', async () => {
    fetchSystemModelProfilesMock.mockResolvedValueOnce([
      {
        id: 'system_profile_1',
        name: '默认模型',
        baseUrl: 'http://example.com',
        model: 'glm-4.7',
        enabled: false,
        source: 'system' as const,
      },
    ])

    const store = useWorkflowAiStore()
    await store.loadProfiles()

    expect(store.selectedProfileId).toBe('')
    expect(store.selectedProfile).toBeNull()
  })

  it('creates an agent session, streams events and builds a single-column business message flow', async () => {
    createAgentSessionMock.mockResolvedValueOnce({
      session: {
        id: 'agent_1',
        mode: 'edit',
        prompt: '帮我分析价格和销量关系',
        status: 'idle',
        profile: {
          id: 'profile_1',
          name: '默认模型',
          model: 'glm-4.7',
        },
        workflowId: null,
        createdAt: 1,
        updatedAt: 1,
      },
      projection: buildProjection({
        analysis: {
          goal: '帮我分析价格和销量关系',
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
      }),
    })
    streamAgentSessionEventsMock.mockImplementationOnce(async (_sessionId, options) => {
      options?.onEvent?.({
        type: 'projection.execution.updated',
        projection: {
          status: 'running',
          latestAction: '正在分析价格字段',
          toolCalls: [],
          pendingApprovals: [],
        },
      })
      options?.onEvent?.({
        type: 'message.delta',
        sessionId: 'agent_1',
        messageId: 'assistant_1',
        delta: '正在分析价格字段…',
      })
      options?.onEvent?.({
        type: 'projection.analysis.updated',
        projection: {
          goal: '帮我分析价格和销量关系',
          summary: '价格是当前最值得优先验证的候选因子。',
          candidateTargets: ['sales'],
          candidateFactors: ['price', 'discount'],
          methods: ['相关性分析', '随机森林特征重要度'],
          findings: ['销量适合作为目标字段'],
          risks: ['当前样本量可能偏少'],
          recommendations: ['先校验缺失值和异常值'],
        },
      })
      options?.onEvent?.({
        type: 'projection.execution.updated',
        projection: {
          status: 'completed',
          latestAction: '本轮分析已完成',
          toolCalls: [],
          pendingApprovals: [],
        },
      })
      options?.onEvent?.({
        type: 'message.completed',
        sessionId: 'agent_1',
        message: {
          id: 'assistant_1',
          role: 'assistant',
          content: '价格是当前最值得优先验证的候选因子。',
          status: 'completed',
          createdAt: 2,
        },
      })
      options?.onEvent?.({
        type: 'session.status.updated',
        session: {
          id: 'agent_1',
          mode: 'edit',
          prompt: '帮我分析价格和销量关系',
          status: 'completed',
          profile: {
            id: 'profile_1',
            name: '默认模型',
            model: 'glm-4.7',
          },
          workflowId: null,
          createdAt: 1,
          updatedAt: 2,
        },
      })
    })
    sendAgentSessionMessageMock.mockResolvedValueOnce({
      session: {
        id: 'agent_1',
        mode: 'edit',
        prompt: '帮我分析价格和销量关系',
        status: 'running',
        profile: {
          id: 'profile_1',
          name: '默认模型',
          model: 'glm-4.7',
        },
        workflowId: null,
        createdAt: 1,
        updatedAt: 2,
      },
      projection: buildProjection({
        analysis: {
          goal: '帮我分析价格和销量关系',
          summary: '系统已开始处理当前分析请求。',
          candidateTargets: ['sales'],
          candidateFactors: ['price', 'discount'],
          methods: [],
          findings: [],
          risks: [],
          recommendations: [],
        },
        execution: {
          status: 'running',
          latestAction: '正在调用 opencode 分析当前业务问题',
          toolCalls: [],
          pendingApprovals: [],
        },
      }),
    })

    const store = useWorkflowAiStore()
    store.customProfiles = [buildProfile()]
    store.selectedProfileId = 'profile_1'
    store.prompt = '帮我分析价格和销量关系'

    const workflowStore = {
      workflowName: '销量诊断流程',
      nodes: [{ id: 'node_1' }, { id: 'node_2' }],
      edges: [{ id: 'edge_1', source: 'node_1', target: 'node_2' }],
      addLog: vi.fn(),
      applyWorkflowAiPlan: vi.fn(() => ({ snapshotId: 'snapshot_1' })),
      restoreEditableSnapshot: vi.fn(() => true),
    }

    await store.submitAgentMessage(workflowStore as any)

    expect(store.activeSession?.id).toBe('agent_1')
    expect(store.activeSession?.status).toBe('completed')
    expect(store.projectionSnapshot?.analysis.summary).toBe('价格是当前最值得优先验证的候选因子。')
    expect(store.projectionSnapshot?.execution.status).toBe('completed')
    expect(store.streamStatus).toBe('completed')
    expect(store.agentMessages.map((item) => item.kind)).toEqual([
      'user',
      'workflow_projection',
      'analysis_projection',
      'execution_projection',
      'assistant',
    ])
    expect(store.streamingMessage).toBe('')
  })

  it('applies projection events into the active snapshot and visible business messages', () => {
    const store = useWorkflowAiStore()
    store.activeSession = {
      id: 'agent_1',
      mode: 'edit',
      prompt: '帮我分析价格和销量关系',
      status: 'idle',
      profile: {
        id: 'profile_1',
        name: '默认模型',
        model: 'glm-4.7',
      },
      workflowId: null,
      createdAt: 1,
      updatedAt: 1,
    }
    store.projectionSnapshot = buildProjection({
      execution: {
        status: 'idle',
        latestAction: '等待用户发送分析指令',
        toolCalls: [],
        pendingApprovals: [],
      },
    }) as any

    store.applyAgentEvent({
      type: 'projection.execution.updated',
      projection: {
        status: 'running',
        latestAction: '正在分析价格字段',
        toolCalls: [],
        pendingApprovals: [],
      },
    })
    store.applyAgentEvent({
      type: 'message.delta',
      sessionId: 'agent_1',
      messageId: 'assistant_1',
      delta: '正在分析价格字段…',
    })

    expect(store.projectionSnapshot?.execution.latestAction).toBe('正在分析价格字段')
    expect(store.streamingMessage).toBe('正在分析价格字段…')
    expect(store.agentMessages.some((item) => item.kind === 'execution_projection')).toBe(true)
  })

  it('shows projected tool calls as visible agent messages', () => {
    const store = useWorkflowAiStore()
    store.activeSession = {
      id: 'agent_1',
      mode: 'edit',
      prompt: '帮我分析价格和销量关系',
      status: 'running',
      profile: {
        id: 'profile_1',
        name: '默认模型',
        model: 'glm-4.7',
      },
      workflowId: null,
      createdAt: 1,
      updatedAt: 1,
    }
    store.projectionSnapshot = buildProjection({
      execution: {
        status: 'running',
        latestAction: '正在读取分析上下文',
        toolCalls: [],
        pendingApprovals: [],
      },
    }) as any

    store.applyAgentEvent({
      type: 'projection.execution.updated',
      projection: {
        status: 'running',
        latestAction: '正在读取分析上下文',
        toolCalls: [
          {
            id: 'tool_call_1',
            toolName: 'workflow_get_session_context',
            displayName: '读取分析上下文',
            status: 'running',
            summary: '正在读取分析上下文',
          },
        ],
        pendingApprovals: [],
      },
    })

    expect(store.agentMessages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'tool_tool_call_1',
          kind: 'tool_call',
          title: '读取分析上下文',
          content: '正在读取分析上下文',
          status: 'streaming',
        }),
      ]),
    )
  })

  it('shows pending approvals as visible agent messages', () => {
    const store = useWorkflowAiStore()
    store.activeSession = {
      id: 'agent_1',
      mode: 'edit',
      prompt: '帮我分析价格和销量关系',
      status: 'running',
      profile: {
        id: 'profile_1',
        name: '默认模型',
        model: 'glm-4.7',
      },
      workflowId: null,
      createdAt: 1,
      updatedAt: 1,
    }
    store.projectionSnapshot = buildProjection({
      execution: {
        status: 'running',
        latestAction: '等待确认修复计划',
        toolCalls: [],
        pendingApprovals: [],
      },
    }) as any

    store.applyAgentEvent({
      type: 'projection.execution.updated',
      projection: {
        status: 'running',
        latestAction: '等待确认修复计划',
        toolCalls: [],
        pendingApprovals: [
          {
            key: 'repair_corr_1',
            label: '确认修复相关性节点配置',
            reason: '代理需要补齐目标字段后继续执行。',
            blocking: true,
          },
        ],
      },
    })

    expect(store.agentMessages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'approval_repair_corr_1',
          kind: 'approval',
          title: '确认修复相关性节点配置',
          content: '代理需要补齐目标字段后继续执行。',
          status: 'streaming',
        }),
      ]),
    )
  })

  it('shows projected evidence and report artifacts as visible agent messages', () => {
    const store = useWorkflowAiStore()
    store.activeSession = {
      id: 'agent_1',
      mode: 'edit',
      prompt: '帮我分析价格和销量关系',
      status: 'completed',
      profile: {
        id: 'profile_1',
        name: '默认模型',
        model: 'glm-4.7',
      },
      workflowId: null,
      createdAt: 1,
      updatedAt: 1,
    }
    store.projectionSnapshot = buildProjection({
      analysis: {
        goal: '帮我分析价格和销量关系',
        summary: '价格与销量存在较强正相关。',
        candidateTargets: ['sales'],
        candidateFactors: ['price', 'discount'],
        methods: ['Pearson 相关系数'],
        findings: ['价格与销量存在较强正相关'],
        risks: [],
        recommendations: ['扩大样本后复核'],
        evidence: [
          {
            evidenceId: 'exec_1:node_pearson_1',
            executionId: 'exec_1',
            nodeId: 'node_pearson_1',
            nodeLabel: 'Pearson 相关系数',
            statement: '3 个数值字段，120 行数据。发现 2 对强相关变量。',
          },
        ],
        report: {
          title: '销量相关性分析报告',
          summary: '价格与销量存在较强正相关，建议继续验证折扣影响。',
          recommendations: ['扩大样本后复核'],
          evidenceIds: ['exec_1:node_pearson_1'],
        },
      },
    }) as any

    expect(store.agentMessages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'evidence_exec_1_node_pearson_1',
          kind: 'evidence',
          title: '证据：Pearson 相关系数',
          content: '3 个数值字段，120 行数据。发现 2 对强相关变量。',
          details: expect.arrayContaining([
            '证据 ID：exec_1:node_pearson_1',
            '执行记录：exec_1',
            '节点 ID：node_pearson_1',
          ]),
        }),
        expect.objectContaining({
          id: 'analysis_report',
          kind: 'report',
          title: '销量相关性分析报告',
          content: '价格与销量存在较强正相关，建议继续验证折扣影响。',
          details: expect.arrayContaining([
            '建议：扩大样本后复核',
            '证据：exec_1:node_pearson_1',
          ]),
        }),
      ]),
    )
  })

  it('syncs the current projected plan to the workflow canvas and updates canvas status', async () => {
    syncAgentCanvasMock.mockResolvedValueOnce({
      projection: buildProjection({
        canvasSync: {
          status: 'synced',
          message: '已同步当前画布，共 2 个节点、1 条连线',
          syncedAt: 3,
        },
      }),
      syncSummary: '已同步当前画布，共 2 个节点、1 条连线',
    })

    const store = useWorkflowAiStore()
    store.activeSession = {
      id: 'agent_1',
      mode: 'edit',
      prompt: '帮我分析价格和销量关系',
      status: 'completed',
      profile: {
        id: 'profile_1',
        name: '默认模型',
        model: 'glm-4.7',
      },
      workflowId: null,
      createdAt: 1,
      updatedAt: 2,
    }
    store.projectionSnapshot = buildProjection() as any

    const workflowStore = {
      workflowName: '销量诊断流程',
      nodes: [{ id: 'node_1' }, { id: 'node_2' }],
      edges: [{ id: 'edge_1', source: 'node_1', target: 'node_2' }],
      addLog: vi.fn(),
      applyWorkflowAiPlan: vi.fn(() => ({ snapshotId: 'snapshot_1' })),
      restoreEditableSnapshot: vi.fn(() => true),
    }

    await store.syncCanvas(workflowStore as any)

    expect(workflowStore.applyWorkflowAiPlan).toHaveBeenCalledWith(
      expect.objectContaining({
        summary: '构建最小销量诊断流程',
      }),
    )
    expect(store.projectionSnapshot?.canvasSync.status).toBe('synced')
    expect(store.agentMessages.some((item) => item.kind === 'canvas_sync')).toBe(true)
  })
})
