import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getWorkflowAiSession,
  requestWorkflowAiPlan,
  runWorkflowAiSession,
  startWorkflowAiSession,
  streamWorkflowAiPlan,
} from '../index'
import * as workflowAiService from '../index'
import type { WorkflowAiPlanRequest } from '@/ai/types'

describe('workflowAi service', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    globalThis.fetch = vi.fn()
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
        baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
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
      headers: {
        'Content-Type': 'application/json',
      },
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
        baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
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
        baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
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
        headers: {
          'Content-Type': 'application/json',
        },
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
        baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
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
        headers: {
          'Content-Type': 'application/json',
        },
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
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/workflow-ai/session/session_1')
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
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/workflow-ai/session/session_1/input', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        answers: {
          question_1: '目标字段就是 target',
        },
      }),
    })
  })
})
