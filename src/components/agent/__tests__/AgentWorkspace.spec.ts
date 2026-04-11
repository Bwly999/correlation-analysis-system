import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import AgentWorkspace from '../AgentWorkspace.vue'
import { useWorkflowAiStore } from '@/stores/workflowAiStore'

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
    expect(wrapper.get('[data-testid="agent-progress-bar"]').text()).not.toContain('先描述你想解决的分析问题')
    expect(wrapper.find('[data-testid="agent-progress-current"]').exists()).toBe(false)
  })

  it('renders compact progress, composer icon controls, tool calls and collapsible thinking blocks', async () => {
    const aiStore = useWorkflowAiStore()
    aiStore.systemProfiles = [buildProfile()]
    aiStore.selectedProfileId = 'profile_1'
    aiStore.prompt = '帮我分析影响销量的关键因素'
    aiStore.streamStatus = 'streaming'
    aiStore.streamOutputs = [
      {
        attempt: 1,
        trigger: 'initial',
        text: '正在检查字段与样本质量…',
      },
    ]
    aiStore.toolTrace = [
      {
        toolName: 'inspect_cached_schema',
        summary: '已读取字段摘要',
        status: 'success',
      },
    ]
    aiStore.streamEvents = [
      { type: 'started', message: '分析代理已开始' },
      { type: 'tool_started', toolName: 'inspect_upstream_schema', traceId: 'trace_1', summary: '读取字段摘要' },
      { type: 'tool_completed', toolName: 'inspect_upstream_schema', traceId: 'trace_1', summary: '字段摘要已就绪' },
      { type: 'stage_changed', stage: 'validate', attempt: 1, message: '正在校验分析路径' },
    ] as any
    aiStore.plan = {
      summary: '价格和折扣是当前最值得优先关注的因素',
      assumptions: ['默认以销量为目标字段'],
      warnings: ['样本量偏小'],
      questions: [],
      operations: [],
    }
    aiStore.sessionState = {
      sessionId: 'session_1',
      mode: 'edit',
      status: 'running',
      prompt: '帮我分析影响销量的关键因素',
      draft: {
        summary: '先做字段检查，再跑相关性与随机森林',
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
    }

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

    expect(wrapper.get('[data-testid="agent-workspace-messages"]').text()).toContain('价格和折扣是当前最值得优先关注的因素')
    expect(wrapper.get('[data-testid="agent-progress-track"]').text()).toContain('计划')
    expect(wrapper.get('[data-testid="agent-progress-current"]').text()).toContain('正在校验分析路径')
    expect(wrapper.get('[data-testid="agent-progress-bar"]').text()).not.toContain('实时进度')
    expect(wrapper.get('[data-testid="agent-workspace-tools"]').text()).toContain('inspect_upstream_schema')
    expect(wrapper.get('[data-testid="agent-workspace-stream"]').text()).toContain('正在检查字段与样本质量')
    expect(wrapper.get('[data-testid="agent-thinking-block"]').text()).toContain('分析思考')
    expect(wrapper.get('[data-testid="agent-step-group"]').text()).toContain('理解问题')
    expect(wrapper.find('.agent-workspace__rail').exists()).toBe(false)
    expect(wrapper.find('[data-testid="agent-workspace-flow"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="agent-composer-preset-toggle"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="agent-composer-model-toggle"]').exists()).toBe(true)

    await wrapper.get('[data-testid="agent-thinking-toggle"]').trigger('click')

    expect(wrapper.get('[data-testid="agent-thinking-body"]').text()).toContain('先做字段检查，再跑相关性与随机森林')

    await wrapper.get('[data-testid="agent-composer-preset-toggle"]').trigger('click')
    expect(wrapper.get('[data-testid="agent-preset-menu"]').text()).toContain('标准分析')

    await wrapper.get('[data-testid="agent-composer-model-toggle"]').trigger('click')
    expect(wrapper.get('[data-testid="agent-model-settings-dialog"]').text()).toContain('默认模型')
    expect(wrapper.get('[data-testid="agent-model-settings-dialog"]').text()).toContain('OpenAI 兼容')
  })

  it('renders the compact progress bar and keeps conclusion inside the message stream after agent loop finishes', async () => {
    const aiStore = useWorkflowAiStore()
    aiStore.systemProfiles = [buildProfile()]
    aiStore.selectedProfileId = 'profile_1'
    aiStore.prompt = '帮我分析影响销量的关键因素'
    aiStore.plan = {
      summary: '先生成最小相关性分析流程',
      assumptions: ['默认以销量为目标字段'],
      warnings: [],
      questions: [],
      operations: [],
    }
    aiStore.streamHeadline = '第 1 轮分析开始'
    aiStore.sessionState = {
      sessionId: 'session_1',
      mode: 'create',
      status: 'completed',
      prompt: '帮我分析影响销量的关键因素',
      draft: {
        summary: '先检查字段，再执行相关分析',
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
    }
    ;(aiStore as any).lastAppliedSnapshotId = 'snapshot_1'
    aiStore.agentLoopOutput = {
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

    expect(wrapper.get('[data-testid="agent-progress-track"]').text()).toContain('同步画布')
    expect(wrapper.get('[data-testid="agent-progress-current"]').text()).toContain('第 1 轮分析开始')
    expect(wrapper.get('[data-testid="agent-progress-bar"]').text()).not.toContain('实时进度')
    expect(wrapper.get('[data-testid="agent-workspace-messages"]').text()).toContain('自动分析结论')
    expect(wrapper.get('[data-testid="agent-workspace-messages"]').text()).toContain('价格和折扣对销量影响最明显')
    expect(wrapper.find('[data-testid="agent-conclusion-card"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="agent-auto-apply-feedback"]').text()).toContain('已自动同步到右侧画布')
  })

  it('submits the goal and automatically runs plan generation plus agent loop when a model is selected', async () => {
    const aiStore = useWorkflowAiStore()
    aiStore.systemProfiles = [buildProfile()]
    aiStore.selectedProfileId = 'profile_1'

    const generatePlanMock = vi.fn().mockImplementation(async () => {
      aiStore.plan = {
        summary: '先生成最小相关性分析流程',
        assumptions: [],
        warnings: [],
        questions: [],
        operations: [],
      }
      aiStore.sessionState = {
        sessionId: 'session_1',
        mode: 'create',
        status: 'completed',
        prompt: aiStore.prompt,
        draft: {
          summary: '先检查字段，再执行相关分析',
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
      }
    })
    const startAgentLoopMock = vi.fn().mockResolvedValue(undefined)

    ;(aiStore as any).generatePlan = generatePlanMock
    ;(aiStore as any).startAgentLoop = startAgentLoopMock

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
    expect(generatePlanMock).toHaveBeenCalledTimes(1)
    expect(startAgentLoopMock).toHaveBeenCalledTimes(1)
  })
})
