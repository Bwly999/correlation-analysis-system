import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createAgentSession,
  getAgentProjection,
  getWorkflowAiSession,
  requestWorkflowAiPlan,
  runAgenticAnalysisSession,
  runWorkflowAiSession,
  sendAgentSessionMessage,
  startWorkflowAiSession,
  streamAgentSessionEvents,
  streamWorkflowAiPlan,
  syncAgentCanvas,
} from '../index'
import * as workflowAiService from '../index'
import type { WorkflowAiPlanRequest } from '@/ai/types'

describe('workflowAi service', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    globalThis.fetch = vi.fn()
    delete (globalThis as typeof globalThis & { __WORKFLOW_API_AUTH_TOKEN__?: string }).__WORKFLOW_API_AUTH_TOKEN__
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.restoreAllMocks()
  })

  it('posts plan requests to the ts backend endpoint', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
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
          attempts: [],
          issues: [],
        },
      }),
    } as Response)

    const request: WorkflowAiPlanRequest = {
      mode: 'create',
      prompt: '创建一个工作流',
      profile: {
        id: 'system-default-zhipu-glm-4-7',
        name: '默认智谱 GLM-4.7',
        baseUrl: 'https://open.bigmodel.cn/api/coding/paas/v4',
        model: 'glm-4.7',
        enabled: true,
        source: 'system',
      },
      nodeCatalog: [
        {
          name: 'file-import',
          displayName: '导入数据',
          category: 'trigger',
          description: '导入本地文件',
          inputMode: 'single',
          minInputs: 0,
          maxInputs: 1,
          allowedNextCategories: ['action', 'terminal'],
          properties: [],
          help: null,
          assistantHints: null,
        },
      ],
    }

    const response = await requestWorkflowAiPlan(request)

    expect(response.plan.summary).toBe('已生成')
    expect(response.diagnostics.status).toBe('success')

    expect(globalThis.fetch).toHaveBeenCalledWith('/api/workflow-ai/plan', {
      method: 'POST',
      headers: expect.objectContaining({
        'Content-Type': 'application/json',
        'x-workflow-user-id': expect.any(String),
        'x-workflow-user-name': expect.any(String),
      }),
      body: JSON.stringify(request),
    })
  })

  it('surfaces diagnostics on failed plan requests', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: false,
      json: async () => ({
        message: 'AI 计划校验失败',
        diagnostics: {
          status: 'failed',
          stage: 'validate',
          attempts: [{ attempt: 1, trigger: 'initial', status: 'failed', stage: 'validate' }],
          issues: [{ stage: 'validate', operationId: 'op_1', message: '空计划缺少追问信息' }],
        },
      }),
    } as Response)

    const request: WorkflowAiPlanRequest = {
      mode: 'create',
      prompt: '创建一个工作流',
      profile: {
        id: 'system-default-zhipu-glm-4-7',
        name: '默认智谱 GLM-4.7',
        baseUrl: 'https://open.bigmodel.cn/api/coding/paas/v4',
        model: 'glm-4.7',
        enabled: true,
        source: 'system',
      },
      nodeCatalog: [],
    }

    await expect(requestWorkflowAiPlan(request)).rejects.toMatchObject({
      message: 'AI 计划校验失败',
      diagnostics: expect.objectContaining({
        stage: 'validate',
      }),
    })
  })

  it('parses ndjson workflow ai stream events and resolves with the completed plan', async () => {
    const encoder = new TextEncoder()
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            [
              JSON.stringify({ type: 'started', message: 'AI 编排已开始' }),
              JSON.stringify({ type: 'attempt_started', attempt: 1, trigger: 'initial', message: '开始首次生成' }),
              JSON.stringify({ type: 'text_delta', attempt: 1, delta: '{"summary":"流式输出"}' }),
              JSON.stringify({
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
              }),
            ].join('\n'),
          ),
        )
        controller.close()
      },
    })

    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      body: stream,
    } as Response)

    const request: WorkflowAiPlanRequest = {
      mode: 'create',
      prompt: '创建一个工作流',
      profile: {
        id: 'system-default-zhipu-glm-4-7',
        name: '默认智谱 GLM-4.7',
        baseUrl: 'https://open.bigmodel.cn/api/coding/paas/v4',
        model: 'glm-4.7',
        enabled: true,
        source: 'system',
      },
      nodeCatalog: [],
    }

    const receivedEvents: string[] = []
    const response = await streamWorkflowAiPlan(request, {
      onEvent(event) {
        receivedEvents.push(event.type)
      },
    })

    expect(receivedEvents).toEqual(['started', 'attempt_started', 'text_delta', 'completed'])
    expect(response.plan.summary).toBe('流式输出')
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/workflow-ai/plan/stream',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'x-workflow-user-id': expect.any(String),
          'x-workflow-user-name': expect.any(String),
        }),
      }),
    )
  })

  it('starts a workflow ai session through the session endpoint', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        session: {
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
        },
      }),
    } as Response)

    const request: WorkflowAiPlanRequest = {
      mode: 'create',
      prompt: '创建一个工作流',
      profile: {
        id: 'system-default-zhipu-glm-4-7',
        name: '默认智谱 GLM-4.7',
        baseUrl: 'https://open.bigmodel.cn/api/coding/paas/v4',
        model: 'glm-4.7',
        enabled: true,
        source: 'system',
      },
      nodeCatalog: [],
    }

    const response = await startWorkflowAiSession(request)

    expect(response.session.sessionId).toBe('session_1')
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/workflow-ai/session/start',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'x-workflow-user-id': expect.any(String),
          'x-workflow-user-name': expect.any(String),
        }),
      }),
    )
  })

  it('streams session orchestration events and resolves with the completed draft result', async () => {
    const encoder = new TextEncoder()
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            [
              JSON.stringify({ type: 'started', sessionId: 'session_1', message: 'AI 编排会话已开始' }),
              JSON.stringify({
                type: 'recipe_selected',
                recipeId: 'quick-json-demo',
                recipeName: 'JSON 快速演示',
                reason: '命中关键词：JSON、快速',
              }),
              JSON.stringify({
                type: 'draft_updated',
                draft: {
                  summary: '最小草稿',
                  assumptions: [],
                  warnings: [],
                  questions: [],
                  nodes: [
                    {
                      ref: 'node_import',
                      source: 'draft',
                      nodeType: 'manual-json-import',
                      label: '手动输入数据',
                      config: {},
                      status: 'added',
                    },
                  ],
                  edges: [],
                },
              }),
              JSON.stringify({
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
                  nodes: [
                    {
                      ref: 'node_import',
                      source: 'draft',
                      nodeType: 'manual-json-import',
                      label: '手动输入数据',
                      config: {},
                      status: 'added',
                    },
                  ],
                  edges: [],
                },
                diagnostics: {
                  status: 'success',
                  stage: 'validate',
                  attempts: [{ attempt: 1, trigger: 'initial', status: 'success', stage: 'validate' }],
                  issues: [],
                },
              }),
            ].join('\n'),
          ),
        )
        controller.close()
      },
    })

    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      body: stream,
    } as Response)

    const receivedEvents: string[] = []
    const response = await runWorkflowAiSession('session_1', {
      onEvent(event) {
        receivedEvents.push(event.type)
      },
    })

    expect(receivedEvents).toEqual(['started', 'recipe_selected', 'draft_updated', 'completed'])
    expect(response.plan.summary).toBe('流式输出')
    expect(response.draft.nodes).toHaveLength(1)
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/workflow-ai/session/session_1/run',
      expect.objectContaining({
        method: 'POST',
      }),
    )
  })

  it('loads the current workflow ai session snapshot', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        session: {
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
        },
      }),
    } as Response)

    const response = await getWorkflowAiSession('session_1')

    expect(response.session.status).toBe('running')
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/workflow-ai/session/session_1',
      expect.objectContaining({
        headers: expect.objectContaining({
          'x-workflow-user-id': expect.any(String),
          'x-workflow-user-name': expect.any(String),
        }),
      }),
    )
  })

  it('submits user answers to the workflow ai session input endpoint', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        session: {
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
          contextHints: {
            userAnswers: [
              {
                key: 'question_1',
                value: '目标字段就是 target',
              },
            ],
          },
        },
      }),
    } as Response)

    const response = await (workflowAiService as any).submitWorkflowAiSessionInput('session_1', {
      answers: {
        question_1: '目标字段就是 target',
      },
    })

    expect(response.session.sessionId).toBe('session_1')
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/workflow-ai/session/session_1/input',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'x-workflow-user-id': expect.any(String),
          'x-workflow-user-name': expect.any(String),
        }),
        body: JSON.stringify({
          answers: {
            question_1: '目标字段就是 target',
          },
        }),
      }),
    )
  })

  it('does not expose removed legacy analysis-agent helpers', () => {
    expect('startAnalysisAgentSession' in workflowAiService).toBe(false)
    expect('getAnalysisAgentSession' in workflowAiService).toBe(false)
    expect('runAnalysisAgentLoop' in workflowAiService).toBe(false)
  })

  it('attaches the workflow API bearer token when available', async () => {
    ;(globalThis as typeof globalThis & { __WORKFLOW_API_AUTH_TOKEN__?: string }).__WORKFLOW_API_AUTH_TOKEN__ =
      'jwt-from-host'
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
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
          attempts: [],
          issues: [],
        },
      }),
    } as Response)

    await requestWorkflowAiPlan({
      mode: 'create',
      prompt: '创建一个工作流',
      profile: {
        id: 'system-default-zhipu-glm-4-7',
        name: '默认智谱 GLM-4.7',
        baseUrl: 'https://open.bigmodel.cn/api/coding/paas/v4',
        model: 'glm-4.7',
        enabled: true,
        source: 'system',
      },
      nodeCatalog: [],
    })

    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/workflow-ai/plan',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer jwt-from-host',
          'x-workflow-user-id': expect.any(String),
          'x-workflow-user-name': expect.any(String),
        }),
      }),
    )
  })

  it('creates an agent session through the new session endpoint', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
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
            goal: '帮我分析价格和销量关系',
            summary: '系统已记录当前分析目标，等待模型开始处理。',
            candidateTargets: ['sales'],
            candidateFactors: ['price'],
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
      }),
    } as Response)

    const request: WorkflowAiPlanRequest = {
      mode: 'edit',
      prompt: '帮我分析价格和销量关系',
      profile: {
        id: 'profile_1',
        name: '默认模型',
        baseUrl: 'http://example.com',
        model: 'glm-4.7',
        apiKey: 'test-key',
        enabled: true,
        source: 'custom',
      },
      workflowSnapshot: {
        name: '销量诊断流程',
        nodes: [{ id: 'node_1' }, { id: 'node_2' }],
        edges: [{ id: 'edge_1', source: 'node_1', target: 'node_2' }],
      },
      nodeCatalog: [],
    }

    const response = await createAgentSession(request)

    expect(response.session.id).toBe('agent_1')
    expect(response.projection.workflow.workflowName).toBe('销量诊断流程')
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/agent/sessions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'x-workflow-user-id': expect.any(String),
          'x-workflow-user-name': expect.any(String),
        }),
      }),
    )
  })

  it('sends agent session messages and returns projection updates', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
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
            goal: '帮我分析价格和销量关系',
            summary: '系统已开始处理当前分析请求。',
            candidateTargets: ['sales'],
            candidateFactors: ['price'],
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
          canvasSync: {
            status: 'idle',
            message: '当前草案尚未同步到画布',
          },
          error: null,
          updatedAt: 2,
        },
      }),
    } as Response)

    const response = await sendAgentSessionMessage('agent_1', {
      content: '继续分析',
    })

    expect(response.session.status).toBe('running')
    expect(response.projection.execution.status).toBe('running')
    expect(response.projection.analysis.summary).toBe('系统已开始处理当前分析请求。')
    expect(response.assistantMessage).toBeUndefined()
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/agent/sessions/agent_1/messages', {
      method: 'POST',
      headers: expect.objectContaining({
        'Content-Type': 'application/json',
        'x-workflow-user-id': expect.any(String),
        'x-workflow-user-name': expect.any(String),
      }),
      body: JSON.stringify({
        content: '继续分析',
      }),
    })
  })

  it('starts an agentic analysis run through the dedicated session endpoint', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
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
            goal: '帮我分析价格和销量关系',
            summary: '系统已开始 agentic 分析。',
            candidateTargets: ['sales'],
            candidateFactors: ['price'],
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
      }),
    } as Response)

    const response = await runAgenticAnalysisSession('agent_1', {
      content: '开始 agentic 分析',
    })

    expect(response.session.status).toBe('running')
    expect(response.projection.execution.latestAction).toBe('Agentic 分析已启动')
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/agent/sessions/agent_1/agentic-run', {
      method: 'POST',
      headers: expect.objectContaining({
        'Content-Type': 'application/json',
        'x-workflow-user-id': expect.any(String),
        'x-workflow-user-name': expect.any(String),
      }),
      body: JSON.stringify({
        content: '开始 agentic 分析',
      }),
    })
  })

  it('streams agent session events from the dedicated events endpoint', async () => {
    const encoder = new TextEncoder()
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            [
              JSON.stringify({ type: 'projection.execution.updated', projection: { status: 'running', latestAction: '正在分析', toolCalls: [], pendingApprovals: [] } }),
              JSON.stringify({ type: 'message.delta', sessionId: 'agent_1', messageId: 'assistant_1', delta: '正在分析价格字段…' }),
              JSON.stringify({ type: 'message.completed', sessionId: 'agent_1', message: { id: 'assistant_1', role: 'assistant', content: '分析完成', status: 'completed', createdAt: 2 } }),
            ].join('\n'),
          ),
        )
        controller.close()
      },
    })

    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      body: stream,
    } as Response)

    const receivedEvents: string[] = []
    await streamAgentSessionEvents('agent_1', {
      onEvent(event) {
        receivedEvents.push(event.type)
      },
    })

    expect(receivedEvents).toEqual([
      'projection.execution.updated',
      'message.delta',
      'message.completed',
    ])
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/agent/sessions/agent_1/events',
      expect.objectContaining({
        headers: expect.objectContaining({
          'x-workflow-user-id': expect.any(String),
          'x-workflow-user-name': expect.any(String),
        }),
      }),
    )
  })

  it('loads projection snapshots and canvas sync results through the new endpoints', async () => {
    vi.mocked(globalThis.fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
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
              goal: '帮我分析价格和销量关系',
              summary: '价格是当前最值得优先验证的候选因子。',
              candidateTargets: ['sales'],
              candidateFactors: ['price'],
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
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          projection: {
            workflow: {
              workflowId: null,
              workflowName: '销量诊断流程',
              draftNodeCount: 3,
              draftEdgeCount: 2,
              draftSummary: '同步后草案已更新。',
              versionCount: 0,
              latestVersionId: null,
              proposedPlan: null,
            },
            analysis: {
              goal: '帮我分析价格和销量关系',
              summary: '价格是当前最值得优先验证的候选因子。',
              candidateTargets: ['sales'],
              candidateFactors: ['price'],
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
              status: 'synced',
              message: '已同步当前画布，共 3 个节点、2 条连线',
              syncedAt: 3,
            },
            error: null,
            updatedAt: 3,
          },
          syncSummary: '已同步当前画布，共 3 个节点、2 条连线',
        }),
      } as Response)

    const projection = await getAgentProjection('agent_1')
    const syncResult = await syncAgentCanvas('agent_1', {
      workflowSnapshot: {
        name: '销量诊断流程',
        nodes: [{ id: 'node_1' }, { id: 'node_2' }, { id: 'node_3' }],
        edges: [{ id: 'edge_1' }, { id: 'edge_2' }],
      },
    })

    expect(projection.workflow.workflowName).toBe('销量诊断流程')
    expect(syncResult.syncSummary).toBe('已同步当前画布，共 3 个节点、2 条连线')
    expect(globalThis.fetch).toHaveBeenNthCalledWith(
      1,
      '/api/agent/sessions/agent_1/projection',
      expect.objectContaining({
        headers: expect.objectContaining({
          'x-workflow-user-id': expect.any(String),
          'x-workflow-user-name': expect.any(String),
        }),
      }),
    )
    expect(globalThis.fetch).toHaveBeenNthCalledWith(
      2,
      '/api/agent/sessions/agent_1/canvas-sync',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'x-workflow-user-id': expect.any(String),
          'x-workflow-user-name': expect.any(String),
        }),
      }),
    )
  })
})
