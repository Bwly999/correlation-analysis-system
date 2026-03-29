import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { requestWorkflowAiPlan, streamWorkflowAiPlan } from '../index'
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
})
