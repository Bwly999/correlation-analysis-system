import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../ai/catalog.js', () => ({
  buildWorkflowAiNodeCatalog: vi.fn(() => []),
}))

vi.mock('../../workflowAi/profiles.js', () => ({
  resolveModelProfile: vi.fn((p) => ({ ...p, apiKey: 'test-key', enabled: true })),
  createProvider: vi.fn(() => ({
    chatModel: vi.fn(() => 'test-model'),
  })),
  streamWorkflowAiPlan: vi.fn(async (_req, emitEvent) => {
    emitEvent({ type: 'started', message: '测试开始' })
    emitEvent({
      type: 'completed',
      plan: {
        summary: '测试计划',
        assumptions: [],
        warnings: [],
        operations: [
          { id: 'n1', type: 'createNode', nodeType: 'manual-json-import', nodeLabel: '数据导入' },
        ],
      },
      diagnostics: { status: 'success', stage: 'validate', attempts: [], issues: [] },
    })
    return {
      plan: {
        summary: '测试计划',
        assumptions: [],
        warnings: [],
        operations: [
          { id: 'n1', type: 'createNode', nodeType: 'manual-json-import', nodeLabel: '数据导入' },
        ],
      },
      diagnostics: { status: 'success', stage: 'validate', attempts: [], issues: [] },
    }
  }),
}))

vi.mock('../nodeExecutor.js', () => ({
  executeNodesForAgent: vi.fn(async () => [
    {
      nodeId: 'n1',
      nodeLabel: '数据导入',
      nodeType: 'manual-json-import',
      success: true,
      resultKind: 'table',
      resultSummary: '表格数据，5 行',
      _rawResult: { kind: 'table', payload: [{ x: 1 }, { x: 2 }] },
    },
  ]),
}))

vi.mock('../conclusionGenerator.js', () => ({
  runConclusionPhase: vi.fn(async () => ({
    summary: '分析完成',
    findings: ['发现1'],
    recommendations: ['建议1'],
    caveats: [],
  })),
}))

vi.mock('ai', () => ({
  generateText: vi.fn(async () => ({
    text: JSON.stringify({ analysis_goal: '相关性分析' }),
  })),
  streamText: vi.fn(),
  stepCountIs: vi.fn((n) => n),
  tool: vi.fn((def) => def),
}))

vi.mock('../toolRegistry.js', () => ({
  agentLoopTools: {},
  concludeAnalysisTool: { execute: vi.fn(async (i) => i) },
  requestAdditionalAnalysisTool: { execute: vi.fn(async (i) => i) },
}))

import { runAgentLoop } from '../engine.js'

describe('runAgentLoop', () => {
  const mockRequest = {
    mode: 'create' as const,
    prompt: '测试分析',
    profile: {
      id: 'test-profile',
      name: 'Test',
      baseUrl: 'http://localhost',
      model: 'test-model',
      apiKey: 'test-key',
      enabled: true,
      source: 'custom' as const,
    },
    nodeCatalog: [],
  }

  it('单次迭代完成后自动停止', async () => {
    const events: any[] = []
    const output = await runAgentLoop(
      mockRequest,
      { maxIterations: 1, autoExecute: true, generateConclusion: true },
      (event) => events.push(event),
    )

    expect(output.totalIterations).toBe(1)
    expect(output.conclusion).not.toBeNull()
    expect(output.conclusion!.summary).toBe('分析完成')

    const loopStarted = events.find((e) => e.type === 'loop_started')
    expect(loopStarted).toBeDefined()
    expect(loopStarted.maxIterations).toBe(1)

    const loopCompleted = events.find((e) => e.type === 'loop_completed')
    expect(loopCompleted).toBeDefined()
  })

  it('autoExecute=false 时不执行节点', async () => {
    const output = await runAgentLoop(
      mockRequest,
      { maxIterations: 3, autoExecute: false, generateConclusion: false },
      () => {},
    )

    expect(output.totalIterations).toBe(1)
    expect(output.iterations[0].executionResults).toHaveLength(0)
  })

  it('generateConclusion=false 时不生成结论', async () => {
    const output = await runAgentLoop(
      mockRequest,
      { maxIterations: 1, autoExecute: true, generateConclusion: false },
      () => {},
    )

    expect(output.conclusion).toBeNull()
  })

  it('发送正确的流式事件序列', async () => {
    const events: any[] = []
    await runAgentLoop(mockRequest, { maxIterations: 1, autoExecute: true, generateConclusion: false }, (e) => events.push(e))

    const types = events.map((e) => e.type)
    expect(types).toContain('loop_started')
    expect(types).toContain('loop_iteration_started')
    expect(types).toContain('loop_completed')
  })
})
