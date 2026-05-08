import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useWorkflowAiStore } from '../workflowAiStore'
import * as agentWorkspace from '@/services/agentWorkspace'

vi.mock('@/services/agentWorkspace', () => ({
  WorkflowAiRequestError: class WorkflowAiRequestError extends Error {},
  createAgentSession: vi.fn(),
  fetchSystemModelProfiles: vi.fn(async () => []),
  getAgentProjection: vi.fn(),
  getAgentSession: vi.fn(),
  sendAgentSessionMessage: vi.fn(),
  streamAgentSessionEvents: vi.fn(async () => {}),
  syncAgentCanvas: vi.fn(),
  testWorkflowAiModelProfile: vi.fn(),
}))

describe('workflowAiStore legacy loop removal', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('does not expose legacy agent-loop preset state anymore', () => {
    const store = useWorkflowAiStore()

    expect('agentLoopPreset' in store).toBe(false)
    expect('agentLoopRunning' in store).toBe(false)
    expect('agentLoopOutput' in store).toBe(false)
    expect('startAgentLoop' in store).toBe(false)
    expect('runAnalysisAgentLoop' in agentWorkspace).toBe(false)
  })

  it('submits messages without calling the legacy agent-loop service', async () => {
    vi.mocked(agentWorkspace.createAgentSession).mockResolvedValueOnce({
      session: {
        id: 'agent_1',
        mode: 'create',
        prompt: '帮我分析销量',
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
          workflowName: '销量分析',
          draftNodeCount: 0,
          draftEdgeCount: 0,
          draftSummary: '等待开始分析。',
          versionCount: 0,
          latestVersionId: null,
          proposedPlan: null,
        },
        analysis: {
          goal: '帮我分析销量',
          summary: '等待模型开始处理。',
          candidateTargets: [],
          candidateFactors: [],
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
    })
    vi.mocked(agentWorkspace.sendAgentSessionMessage).mockResolvedValueOnce({
      session: {
        id: 'agent_1',
        mode: 'create',
        prompt: '帮我分析销量',
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
      projection: {
        workflow: {
          workflowId: null,
          workflowName: '销量分析',
          draftNodeCount: 0,
          draftEdgeCount: 0,
          draftSummary: '等待开始分析。',
          versionCount: 0,
          latestVersionId: null,
          proposedPlan: null,
        },
        analysis: {
          goal: '帮我分析销量',
          summary: '价格值得优先关注。',
          candidateTargets: [],
          candidateFactors: [],
          methods: [],
          findings: [],
          risks: [],
          recommendations: [],
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
      assistantMessage: {
        id: 'assistant_1',
        role: 'assistant',
        content: '价格值得优先关注。',
        status: 'completed',
        createdAt: 2,
      },
    })

    const store = useWorkflowAiStore()
    store.customProfiles = [
      {
        id: 'profile_1',
        name: '默认模型',
        baseUrl: 'http://example.com',
        model: 'glm-4.7',
        apiKey: 'secret',
        enabled: true,
        source: 'custom',
      },
    ]
    store.selectedProfileId = 'profile_1'
    store.prompt = '帮我分析销量'

    const workflowStore = {
      workflowName: '销量分析',
      nodes: [],
      edges: [],
      addLog: vi.fn(),
      applyWorkflowAiPlan: vi.fn(() => ({ snapshotId: 'snapshot_1' })),
      restoreEditableSnapshot: vi.fn(() => true),
    }

    await store.submitAgentMessage(workflowStore as any)
  })
})
