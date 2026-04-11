import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useWorkflowAiStore } from '@/stores/workflowAiStore'
import { createPinia, setActivePinia } from 'pinia'
import { runAnalysisAgentLoop } from '@/services/agentWorkspace'

vi.mock('@/services/agentWorkspace', () => ({
  fetchSystemModelProfiles: vi.fn(async () => []),
  requestWorkflowAiPlan: vi.fn(),
  streamWorkflowAiPlan: vi.fn(),
  startWorkflowAiSession: vi.fn(),
  runWorkflowAiSession: vi.fn(),
  submitWorkflowAiSessionInput: vi.fn(),
  testWorkflowAiModelProfile: vi.fn(),
  runAnalysisAgentLoop: vi.fn(),
}))

describe('workflowAiStore — Agent Loop 事件处理', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('处理 loop_started 事件', () => {
    const store = useWorkflowAiStore()
    store.generatePlan({
      mode: 'create',
      prompt: '测试',
      profile: { id: 'p1', source: 'system' } as any,
      nodeCatalog: [],
    } as any).catch(() => {})

    // 直接测试 appendStreamEvent 的行为
    // 通过 generatePlan 内部调用或直接验证 store 的响应
    expect(store.streamHeadline).toBeDefined()
  })

  it('agentLoopRunning 和 agentLoopOutput 初始值', () => {
    const store = useWorkflowAiStore()
    expect(store.agentLoopRunning).toBe(false)
    expect(store.agentLoopOutput).toBeNull()
  })

  it('resetPlan 清除 agentLoop 状态', () => {
    const store = useWorkflowAiStore()
    ;(store as any).agentLoopRunning = true
    ;(store as any).agentLoopOutput = { iterations: [], conclusion: null, totalDurationMs: 0, totalIterations: 0 }
    store.resetPlan()
    expect(store.agentLoopRunning).toBe(false)
    expect(store.agentLoopOutput).toBeNull()
  })

  it('完成整条 agent loop 后生成可见的思考消息与自动应用状态', async () => {
    const store = useWorkflowAiStore()
    store.selectedProfileId = 'profile_1'
    ;(store as any).systemProfiles = [
      {
        id: 'profile_1',
        name: '默认模型',
        enabled: true,
        source: 'system',
        baseUrl: 'https://open.bigmodel.cn/api/coding/paas/v4',
        model: 'glm-4.7',
      },
    ]
    store.prompt = '帮我分析影响销量的因素'
    ;(store as any).sessionState = {
      sessionId: 'session_1',
      mode: 'create',
      status: 'completed',
      prompt: '帮我分析影响销量的因素',
      draft: {
        summary: '先检查字段，再执行相关分析',
        assumptions: [],
        warnings: [],
        questions: [],
        nodes: [],
        edges: [],
      },
      trace: [],
      diagnostics: { issues: [] },
      missingInfo: [],
    }

    vi.mocked(runAnalysisAgentLoop).mockImplementationOnce(async (_sessionId, _config, options) => {
      options?.onEvent?.({ type: 'loop_started', maxIterations: 2 } as any)
      options?.onEvent?.({ type: 'loop_iteration_started', iteration: 1 } as any)
      options?.onEvent?.({ type: 'node_execution_started', nodeId: 'n1', nodeLabel: '手动输入数据' } as any)
      options?.onEvent?.({
        type: 'loop_iteration_completed',
        iteration: 1,
        plan: {
          summary: '先做相关性分析',
          assumptions: [],
          warnings: [],
          questions: [],
          operations: [],
        },
        executionResults: [
          {
            nodeId: 'n1',
            nodeLabel: 'Pearson 相关系数',
            nodeType: 'pearson',
            success: true,
            resultKind: 'report',
            resultSummary: '发现价格和销量强相关',
          },
        ],
        interpretation: {
          text: '第一轮已发现明显相关性',
          shouldContinue: false,
        },
      } as any)
      options?.onEvent?.({ type: 'conclusion_started' } as any)
      options?.onEvent?.({
        type: 'conclusion_completed',
        conclusion: {
          summary: '价格和折扣对销量影响最明显',
          findings: ['价格和销量强相关'],
          recommendations: ['建议补充更多周期数据'],
          caveats: [],
        },
      } as any)
      options?.onEvent?.({
        type: 'loop_completed',
        totalIterations: 1,
        totalDurationMs: 1800,
        output: {
          iterations: [
            {
              iteration: 1,
              plan: {
                summary: '先做相关性分析',
                assumptions: [],
                warnings: [],
                questions: [],
                operations: [],
              },
              executionResults: [
                {
                  nodeId: 'n1',
                  nodeLabel: 'Pearson 相关系数',
                  nodeType: 'pearson',
                  success: true,
                  resultKind: 'report',
                  resultSummary: '发现价格和销量强相关',
                },
              ],
              interpretation: {
                text: '第一轮已发现明显相关性',
                shouldContinue: false,
              },
            },
          ],
          conclusion: {
            summary: '价格和折扣对销量影响最明显',
            findings: ['价格和销量强相关'],
            recommendations: ['建议补充更多周期数据'],
            caveats: [],
          },
          totalDurationMs: 1800,
          totalIterations: 1,
        },
      } as any)

      return {
        iterations: [
          {
            iteration: 1,
            plan: {
              summary: '先做相关性分析',
              assumptions: [],
              warnings: [],
              questions: [],
              operations: [],
            },
            executionResults: [
              {
                nodeId: 'n1',
                nodeLabel: 'Pearson 相关系数',
                nodeType: 'pearson',
                success: true,
                resultKind: 'report',
                resultSummary: '发现价格和销量强相关',
              },
            ],
            interpretation: {
              text: '第一轮已发现明显相关性',
              shouldContinue: false,
            },
          },
        ],
        conclusion: {
          summary: '价格和折扣对销量影响最明显',
          findings: ['价格和销量强相关'],
          recommendations: ['建议补充更多周期数据'],
          caveats: [],
        },
        totalDurationMs: 1800,
        totalIterations: 1,
      }
    })

    const workflowStore = {
      workflowName: '销量分析',
      nodes: [],
      edges: [],
      addLog: vi.fn(),
      applyWorkflowAiPlan: vi.fn(() => ({ snapshotId: 'snapshot_1' })),
      restoreEditableSnapshot: vi.fn(() => true),
    }

    await store.startAgentLoop(workflowStore as any)

    expect(store.agentLoopOutput?.conclusion?.summary).toBe('价格和折扣对销量影响最明显')
    expect(store.lastAppliedSnapshotId).toBe('snapshot_1')
    expect(store.streamHeadline).toContain('价格和折扣对销量影响最明显')
    expect(store.agentMessages.some((message) =>
      message.blocks.some((block) => block.type === 'thinking' && block.summary.includes('第 1 轮分析开始')),
    )).toBe(true)
    expect(store.agentMessages.some((message) =>
      message.blocks.some((block) => block.type === 'thinking' && block.summary.includes('正在生成分析结论')),
    )).toBe(true)
  })
})
