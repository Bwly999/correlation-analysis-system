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

  const buildVersion = (id: string, createdAt: number, source: 'save' | 'rollback' = 'save') => ({
    id,
    workflowId: 'workflow_1',
    workflowName: '销量诊断流程',
    createdAt,
    workflowUpdatedAt: createdAt,
    source,
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
    const workflowStore = useWorkflowStore()
    aiStore.systemProfiles = [buildProfile()]
    aiStore.selectedProfileId = 'profile_1'
    aiStore.prompt = '帮我分析影响销量的关键因素'
    workflowStore.currentWorkflowId = 'workflow_1'
    workflowStore.workflowVersions = [
      buildVersion('version_2', Date.UTC(2026, 3, 14, 4, 30, 0), 'rollback'),
      buildVersion('version_1', Date.UTC(2026, 3, 14, 2, 0, 0)),
    ]
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
    expect(wrapper.find('.agent-workspace__rail').exists()).toBe(true)
    expect(wrapper.get('[data-testid="agent-runtime-panel"]').text()).toContain('当前运行态')
    expect(wrapper.get('[data-testid="agent-runtime-panel"]').text()).toContain('可运行')
    expect(wrapper.get('[data-testid="agent-version-panel"]').text()).toContain('版本历史')
    expect(wrapper.get('[data-testid="agent-version-panel"]').text()).toContain('回滚版本')
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

  it('loads workflow versions when the workspace is visible and a workflow is selected', async () => {
    const workflowStore = useWorkflowStore()
    workflowStore.currentWorkflowId = 'workflow_1'
    const loadWorkflowVersionsMock = vi.fn().mockResolvedValue([])
    ;(workflowStore as any).loadWorkflowVersions = loadWorkflowVersionsMock

    mount(AgentWorkspace, {
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

    await Promise.resolve()

    expect(loadWorkflowVersionsMock).toHaveBeenCalledTimes(1)
    expect(loadWorkflowVersionsMock).toHaveBeenCalledWith('workflow_1')
  })

  it('renders workflow version detail and supports rolling back from the side panel', async () => {
    const aiStore = useWorkflowAiStore()
    const workflowStore = useWorkflowStore()
    aiStore.systemProfiles = [buildProfile()]
    aiStore.selectedProfileId = 'profile_1'
    aiStore.prompt = '帮我分析影响销量的关键因素'
    aiStore.agentLoopRunning = true
    aiStore.streamHeadline = '正在执行节点：Pearson 相关系数'
    workflowStore.currentWorkflowId = 'workflow_1'
    workflowStore.workflowVersions = [
      buildVersion('version_2', Date.UTC(2026, 3, 14, 4, 30, 0), 'rollback'),
      buildVersion('version_1', Date.UTC(2026, 3, 14, 2, 0, 0)),
    ]

    const detail = {
      ...buildVersion('version_2', Date.UTC(2026, 3, 14, 4, 30, 0), 'rollback'),
      workflow: {
        id: 'workflow_1',
        name: '销量诊断流程',
        updatedAt: Date.UTC(2026, 3, 14, 4, 30, 0),
        nodes: [
          {
            id: 'node_1',
            position: { x: 0, y: 0 },
            data: {
              label: '导入数据',
              type: 'file-import',
              category: 'trigger',
              config: {},
              status: 'idle',
              logs: [],
            },
          },
          {
            id: 'node_2',
            position: { x: 280, y: 0 },
            data: {
              label: 'Pearson 相关系数',
              type: 'pearson',
              category: 'terminal',
              config: {},
              status: 'idle',
              logs: [],
            },
          },
        ],
        edges: [
          {
            id: 'edge_1',
            source: 'node_1',
            target: 'node_2',
          },
        ],
      },
    }
    const loadWorkflowVersionDetailMock = vi.fn().mockImplementation(async () => {
      workflowStore.selectedWorkflowVersionDetail = detail as any
      return detail
    })
    const rollbackWorkflowVersionMock = vi.fn().mockResolvedValue({
      workflow: detail.workflow,
      version: workflowStore.workflowVersions[0],
    })
    ;(workflowStore as any).loadWorkflowVersionDetail = loadWorkflowVersionDetailMock
    ;(workflowStore as any).rollbackWorkflowVersion = rollbackWorkflowVersionMock

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

    await wrapper.get('[data-testid="agent-version-item-version_2"]').trigger('click')
    await Promise.resolve()

    expect(loadWorkflowVersionDetailMock).toHaveBeenCalledWith('version_2', 'workflow_1')
    expect(wrapper.get('[data-testid="agent-version-detail"]').text()).toContain('Pearson 相关系数')
    expect(wrapper.get('[data-testid="agent-version-detail"]').text()).toContain('2 个节点')
    expect(wrapper.get('[data-testid="agent-version-detail"]').text()).toContain('1 条连线')

    await wrapper.get('[data-testid="agent-version-rollback"]').trigger('click')

    expect(rollbackWorkflowVersionMock).toHaveBeenCalledWith('version_2', 'workflow_1')
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
