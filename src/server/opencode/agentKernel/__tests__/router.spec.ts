import { describe, expect, it } from 'vitest'
import { routeAgentIntent } from '../router.js'
import type { WorkflowAiPlanRequest } from '../../../../ai/types.js'

const buildRequest = (overrides: Partial<WorkflowAiPlanRequest> = {}): WorkflowAiPlanRequest => ({
  mode: 'edit',
  prompt: '分析价格和销量关系',
  profile: {
    id: 'profile_1',
    name: '默认模型',
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-v4-flash',
    apiKey: 'test-key',
    enabled: true,
    source: 'custom',
  },
  nodeCatalog: [],
  ...overrides,
})

describe('agent kernel intent router', () => {
  it('keeps ordinary conversation in chat mode without forcing analysis skills', () => {
    const result = routeAgentIntent({
      message: '你好，先解释一下 Pearson 相关系数是什么',
      request: buildRequest(),
      autonomy: 'chat',
    })

    expect(result).toMatchObject({
      kind: 'chat',
      autonomy: 'chat',
      skillName: 'general-chat',
      requiresToolLoop: false,
    })
  })

  it('routes data analysis requests to the agentic data analysis skill', () => {
    const result = routeAgentIntent({
      message: '请自动分析价格、折扣与销量之间的关系，并生成报告',
      request: buildRequest(),
      autonomy: 'agentic',
    })

    expect(result).toMatchObject({
      kind: 'agentic_analysis',
      autonomy: 'agentic',
      skillName: 'agentic-data-analysis',
      requiresToolLoop: true,
    })
  })

  it('routes repair requests directly to workflow repair skill', () => {
    const result = routeAgentIntent({
      message: '刚才相关性节点执行失败了，帮我调试并修复',
      request: buildRequest(),
      autonomy: 'agentic',
    })

    expect(result).toMatchObject({
      kind: 'workflow_repair',
      skillName: 'workflow-repair',
      requiresToolLoop: true,
    })
  })
})
