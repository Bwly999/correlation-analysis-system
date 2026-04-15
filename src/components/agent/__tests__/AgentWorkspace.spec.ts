import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import AgentWorkspace from '../AgentWorkspace.vue'
import { useWorkflowAiStore } from '@/stores/workflowAiStore'
import { useWorkflowStore } from '@/stores/workflowStore'

describe('AgentWorkspace', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  const dialogStub = {
    props: ['visible'],
    template: '<div v-if="visible" data-testid="dialog-stub"><slot name="header" /><slot /></div>',
  }

  const buildProfile = () => ({
    id: 'profile_1',
    name: '默认模型',
    enabled: true,
    source: 'system' as const,
    baseUrl: 'https://open.bigmodel.cn/api/coding/paas/v4',
    model: 'glm-4.7',
  })

  it('keeps the top progress strip compact before work starts', () => {
    const wrapper = mount(AgentWorkspace, {
      props: {
        visible: true,
      },
      global: {
        stubs: {
          Dialog: dialogStub,
          Button: { template: '<button @click="$emit(\'click\')"><slot /></button>' },
        },
      },
    })

    expect(wrapper.get('[data-testid="agent-progress-track"]').text()).toContain('输入目标')
    expect(wrapper.find('.agent-workspace__rail').exists()).toBe(false)
    expect(wrapper.find('[data-testid="agent-composer-preset-toggle"]').exists()).toBe(false)
  })

  it('renders workflow, analysis and execution business cards inline in the conversation flow', () => {
    const aiStore = useWorkflowAiStore()
    aiStore.systemProfiles = [buildProfile()]
    aiStore.selectedProfileId = 'profile_1'
    aiStore.activeSession = {
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
    aiStore.projectionSnapshot = {
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
    }
    aiStore.streamHeadline = '本轮分析已完成'

    const wrapper = mount(AgentWorkspace, {
      props: {
        visible: true,
      },
      global: {
        stubs: {
          Dialog: dialogStub,
          Button: { template: '<button @click="$emit(\'click\')"><slot /></button>' },
        },
      },
    })

    const flowText = wrapper.get('[data-testid="agent-workspace-messages"]').text()
    expect(flowText).toContain('当前工作流草案')
    expect(flowText).toContain('当前分析状态')
    expect(flowText).toContain('最近执行动作')
    expect(flowText).toContain('价格是当前最值得优先验证的候选因子。')
    expect(wrapper.find('.agent-workspace__rail').exists()).toBe(false)
  })

  it('submits user goals through the new session API flow', async () => {
    const aiStore = useWorkflowAiStore()
    const workflowStore = useWorkflowStore()
    aiStore.systemProfiles = [buildProfile()]
    aiStore.selectedProfileId = 'profile_1'

    const submitAgentMessageMock = vi.fn().mockResolvedValue(undefined)
    ;(aiStore as any).submitAgentMessage = submitAgentMessageMock

    const wrapper = mount(AgentWorkspace, {
      props: {
        visible: true,
      },
      global: {
        stubs: {
          Dialog: dialogStub,
          Button: { template: '<button @click="$emit(\'click\')"><slot /></button>' },
        },
      },
    })

    await wrapper.get('.agent-composer__input').setValue('帮我自动完成销量影响因素分析')
    await wrapper.get('.agent-composer__submit').trigger('click')

    expect(aiStore.prompt).toBe('帮我自动完成销量影响因素分析')
    expect(submitAgentMessageMock).toHaveBeenCalledTimes(1)
    expect(submitAgentMessageMock).toHaveBeenCalledWith(workflowStore, '帮我自动完成销量影响因素分析')
  })

  it('syncs the projected plan to canvas from the composer area', async () => {
    const aiStore = useWorkflowAiStore()
    aiStore.systemProfiles = [buildProfile()]
    aiStore.selectedProfileId = 'profile_1'
    aiStore.activeSession = {
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
    aiStore.projectionSnapshot = {
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
    }

    const syncCanvasMock = vi.fn().mockResolvedValue(undefined)
    ;(aiStore as any).syncCanvas = syncCanvasMock

    const wrapper = mount(AgentWorkspace, {
      props: {
        visible: true,
      },
      global: {
        stubs: {
          Dialog: dialogStub,
          Button: { template: '<button @click="$emit(\'click\')"><slot /></button>' },
        },
      },
    })

    await wrapper.get('[data-testid="agent-composer-sync"]').trigger('click')

    expect(syncCanvasMock).toHaveBeenCalledTimes(1)
  })
})
