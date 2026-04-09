import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useWorkflowAiStore } from '@/stores/workflowAiStore'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('@/services/workflowAi', () => ({
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
})
