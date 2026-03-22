import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { requestWorkflowAiPlan } from '../index'
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
        summary: '已生成',
        assumptions: [],
        warnings: [],
        questions: [],
        operations: [],
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

    await requestWorkflowAiPlan(request)

    expect(globalThis.fetch).toHaveBeenCalledWith('http://localhost:8000/workflow-ai/plan', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    })
  })
})
