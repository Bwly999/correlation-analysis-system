import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import WorkflowAiPanel from '../WorkflowAiPanel.vue'
import { useWorkflowAiStore } from '@/stores/workflowAiStore'
import { useWorkflowStore } from '@/stores/workflowStore'

describe('WorkflowAiPanel', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  it('renders structured diagnostics for failed ai orchestration attempts', () => {
    const aiStore = useWorkflowAiStore()
    useWorkflowStore()

    aiStore.errorMessage = 'AI 计划校验失败'
    aiStore.generationDiagnostics = {
      status: 'failed',
      stage: 'validate',
      attempts: [
        { attempt: 1, trigger: 'initial', status: 'failed', stage: 'parse', message: '首次返回非 JSON' },
        { attempt: 2, trigger: 'repair', status: 'failed', stage: 'validate', message: '重试后仍不合法' },
      ],
      issues: [
        { stage: 'validate', operationId: 'op_1', message: '空计划缺少追问信息' },
      ],
      rawOutputExcerpt: '{"summary":"失败"}',
    }

    const wrapper = mount(WorkflowAiPanel, {
      props: {
        visible: true,
      },
      global: {
        stubs: {
          Button: { template: '<button @click="$emit(\'click\')"><slot /></button>' },
        },
      },
    })

    expect(wrapper.get('[data-testid="workflow-ai-diagnostics"]').text()).toContain('失败阶段')
    expect(wrapper.get('[data-testid="workflow-ai-diagnostics"]').text()).toContain('validate')
    expect(wrapper.get('[data-testid="workflow-ai-diagnostics"]').text()).toContain('自动修复重试')
    expect(wrapper.get('[data-testid="workflow-ai-diagnostics"]').text()).toContain('空计划缺少追问信息')
    expect(wrapper.get('[data-testid="workflow-ai-raw-output"]').text()).toContain('{"summary":"失败"}')
  })

  it('renders streaming progress from agent session and projection events', () => {
    const aiStore = useWorkflowAiStore()
    useWorkflowStore()

    aiStore.isGenerating = true
    aiStore.streamStatus = 'streaming'
    aiStore.streamHeadline = '正在执行销量与价格相关性分析'
    aiStore.streamEvents = [
      {
        type: 'session.status.updated',
        session: {
          id: 'agent_1',
          mode: 'edit',
          prompt: '分析销量与价格关系',
          status: 'running',
          profile: {
            id: 'profile_1',
            name: 'GLM',
            model: 'glm-4.7',
          },
          workflowId: 'wf_1',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      },
      {
        type: 'projection.execution.updated',
        projection: {
          status: 'running',
          latestAction: '正在执行 Pearson 相关性分析',
          toolCalls: [],
          pendingApprovals: [],
          latestToolSummary: '已读取销量数据',
        },
      },
    ]
    aiStore.streamingMessage = '正在生成业务结论...'

    const wrapper = mount(WorkflowAiPanel, {
      props: {
        visible: true,
      },
      global: {
        stubs: {
          Button: { template: '<button @click="$emit(\'click\')"><slot /></button>' },
        },
      },
    })

    expect(wrapper.get('[data-testid="workflow-ai-stream-progress"]').text()).toContain('实时进度')
    expect(wrapper.get('[data-testid="workflow-ai-stream-progress"]').text()).toContain('正在执行 Pearson 相关性分析')
    expect(wrapper.get('[data-testid="workflow-ai-stream-output"]').text()).toContain('正在生成业务结论')
  })

  it('renders app-internal context hints and tool trace for local tool-first orchestration', () => {
    const aiStore = useWorkflowAiStore()
    useWorkflowStore()

    aiStore.toolTrace = [
      {
        toolName: 'get_workflow_context',
        summary: '已读取当前工作流「测试工作流」，共 2 个节点、1 条连线',
        status: 'success',
      },
      {
        toolName: 'inspect_cached_schema',
        summary: '已读取 1 个节点缓存摘要',
        status: 'success',
      },
    ]
    aiStore.contextHints = {
      recipes: [
        {
          id: 'single-table-correlation',
          name: '单表相关性分析',
          reason: '命中关键词：相关、pearson',
          minimalPattern: ['manual-json-import', 'pearson'],
        },
      ],
      schemaSummaries: [
        {
          nodeId: 'node_import_1',
          nodeLabel: '手动输入数据',
          resultKind: 'table',
          rowCount: 2,
          numericColumns: ['feature', 'target'],
          categoricalColumns: ['group'],
          datetimeColumns: [],
          candidateTargetColumns: ['target'],
          candidateFeatureColumns: ['feature'],
          blockedReasons: [],
        },
      ],
    }

    const wrapper = mount(WorkflowAiPanel, {
      props: {
        visible: true,
      },
      global: {
        stubs: {
          Button: { template: '<button @click="$emit(\'click\')"><slot /></button>' },
        },
      },
    })

    expect(wrapper.get('[data-testid="workflow-ai-context"]').text()).toContain('应用内上下文')
    expect(wrapper.get('[data-testid="workflow-ai-context"]').text()).toContain('get_workflow_context')
    expect(wrapper.get('[data-testid="workflow-ai-context"]').text()).toContain('单表相关性分析')
    expect(wrapper.get('[data-testid="workflow-ai-context"]').text()).toContain('manual-json-import')
    expect(wrapper.get('[data-testid="workflow-ai-context"]').text()).toContain('候选目标字段')
    expect(wrapper.get('[data-testid="workflow-ai-context"]').text()).toContain('feature')
    expect(wrapper.get('[data-testid="workflow-ai-context"]').text()).toContain('target')
  })

  it('renders session strategy, draft structure and missing information in session mode', () => {
    const aiStore = useWorkflowAiStore()
    useWorkflowStore()

    aiStore.sessionState = {
      sessionId: 'session_1',
      mode: 'edit',
      status: 'waiting_user',
      prompt: '修改现有流程，继续做 Pearson 相关分析。',
      selectedRecipe: {
        id: 'single-table-correlation',
        name: '单表相关性分析',
        reason: '命中关键词：相关、pearson',
      },
      draft: {
        summary: '先复用现有数据输入，再补相关分析节点',
        assumptions: [],
        warnings: ['当前目标字段仍未最终确认'],
        questions: ['请确认目标字段'],
        nodes: [
          {
            ref: 'existing:node_import_1',
            source: 'existing',
            nodeType: 'manual-json-import',
            label: '手动输入数据',
            config: {},
            status: 'clean',
          },
          {
            ref: 'draft:node_pearson_1',
            source: 'draft',
            nodeType: 'pearson',
            label: 'Pearson 相关系数',
            config: {},
            status: 'added',
          },
        ],
        edges: [
          {
            ref: 'draft:edge_1',
            sourceRef: 'existing:node_import_1',
            targetRef: 'draft:node_pearson_1',
            status: 'added',
          },
        ],
      },
      trace: [],
      diagnostics: {
        issues: [],
      },
      missingInfo: [
        {
          key: 'question_1',
          label: '待确认项 1',
          reason: '请确认目标字段',
          blocking: true,
        },
      ],
    }

    const wrapper = mount(WorkflowAiPanel, {
      props: {
        visible: true,
      },
      global: {
        stubs: {
          Button: { template: '<button @click="$emit(\'click\')"><slot /></button>' },
        },
      },
    })

    expect(wrapper.get('[data-testid="workflow-ai-session-strategy"]').text()).toContain('单表相关性分析')
    expect(wrapper.get('[data-testid="workflow-ai-session-strategy"]').text()).toContain('待补充信息')
    expect(wrapper.get('[data-testid="workflow-ai-session-draft"]').text()).toContain('Pearson 相关系数')
    expect(wrapper.get('[data-testid="workflow-ai-session-draft"]').text()).toContain('新增')
    expect(wrapper.get('[data-testid="workflow-ai-session-draft"]').text()).toContain('当前草稿共 2 个节点')
    expect(wrapper.get('[data-testid="workflow-ai-missing-info"]').text()).toContain('请确认目标字段')
  })

  it('collects missing info answers and continues the ai session from the panel', async () => {
    const aiStore = useWorkflowAiStore()
    useWorkflowStore()

    const continueSessionMock = vi.fn().mockResolvedValue(undefined)
    ;(aiStore as any).continueSession = continueSessionMock

    aiStore.sessionState = {
      sessionId: 'session_1',
      mode: 'edit',
      status: 'waiting_user',
      prompt: '继续做 Pearson 相关分析。',
      draft: {
        summary: '待补全草稿',
        assumptions: [],
        warnings: [],
        questions: ['请确认目标字段'],
        nodes: [],
        edges: [],
      },
      trace: [],
      diagnostics: {
        issues: [],
      },
      missingInfo: [
        {
          key: 'question_1',
          label: '待确认项 1',
          reason: '请确认目标字段',
          blocking: true,
        },
      ],
    }

    const wrapper = mount(WorkflowAiPanel, {
      props: {
        visible: true,
      },
      global: {
        stubs: {
          Button: { template: '<button @click="$emit(\'click\')"><slot /></button>' },
        },
      },
    })

    await wrapper.get('[data-testid="workflow-ai-missing-info-input-question_1"]').setValue('目标字段就是 target')
    await wrapper.get('[data-testid="workflow-ai-continue-session"]').trigger('click')

    expect(continueSessionMock).toHaveBeenCalledWith(expect.anything(), {
      question_1: '目标字段就是 target',
    })
  })

  it('renders chat-first analysis workspace sections with projection cards and workflow sync action', async () => {
    const aiStore = useWorkflowAiStore()
    const workflowStore = useWorkflowStore()

    const syncAnalysisCanvasMock = vi.fn()
    ;(aiStore as any).syncAnalysisCanvas = syncAnalysisCanvasMock

    aiStore.prompt = '帮我分析影响销量的关键因素'
    aiStore.activeSession = {
      id: 'session_1',
      mode: 'edit',
      status: 'completed',
      prompt: '帮我分析影响销量的关键因素',
      profile: {
        id: 'profile_1',
        name: 'GLM',
        model: 'glm-4.7',
      },
      workflowId: 'wf_sales',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    aiStore.projectionSnapshot = {
      workflow: {
        workflowId: 'wf_sales',
        workflowName: '销量分析',
        draftNodeCount: 3,
        draftEdgeCount: 2,
        draftSummary: '先清洗数据，再执行相关性和特征重要性分析',
        versionCount: 4,
        latestVersionId: 'version_4',
        proposedPlan: {
          summary: '价格和折扣对销量影响最明显',
          assumptions: ['默认以销量作为目标字段'],
          warnings: ['样本量偏小，建议补充更多周期数据'],
          questions: [],
          operations: [],
        },
      },
      analysis: {
        goal: '帮我分析影响销量的关键因素',
        summary: '价格和折扣对销量影响最明显',
        candidateTargets: ['销量'],
        candidateFactors: ['价格', '折扣'],
        methods: ['Pearson 相关性分析', '特征重要性分析'],
        findings: ['价格和折扣对销量影响最明显'],
        risks: ['样本量偏小，建议补充更多周期数据'],
        recommendations: ['继续按地区分层验证'],
      },
      execution: {
        status: 'completed',
        latestAction: '已生成分析草案与结论',
        toolCalls: [],
        pendingApprovals: [],
      },
      canvasSync: {
        status: 'idle',
        message: '当前还没有同步画布，可手动同步。',
      },
      error: null,
      updatedAt: Date.now(),
    }
    aiStore.sessionMessages = [
      {
        id: 'user_1',
        role: 'user',
        content: '帮我分析影响销量的关键因素',
        status: 'completed',
        createdAt: Date.now(),
      },
      {
        id: 'assistant_1',
        role: 'assistant',
        content: '我已经基于当前业务上下文整理出分析结论和工作流草案。',
        status: 'completed',
        createdAt: Date.now(),
      },
    ]

    workflowStore.workflowName = '销量分析'
    workflowStore.nodes = [
      {
        id: 'node_1',
        position: { x: 0, y: 0 },
        data: {
          label: '手动输入数据',
          type: 'manual-json-import',
          category: 'trigger',
          config: {},
          status: 'idle',
          output: null,
          logs: [],
        },
      },
    ] as any
    workflowStore.edges = [] as any

    const wrapper = mount(WorkflowAiPanel, {
      props: {
        visible: true,
      },
      global: {
        stubs: {
          Button: { template: '<button @click="$emit(\'click\')"><slot /></button>' },
        },
      },
    })

    expect(wrapper.get('[data-testid="analysis-agent-chat"]').text()).toContain('帮我分析影响销量的关键因素')
    expect(wrapper.get('[data-testid="analysis-agent-artifacts"]').text()).toContain('当前工作流草案')
    expect(wrapper.get('[data-testid="analysis-agent-artifacts"]').text()).toContain('当前分析状态')
    expect(wrapper.get('[data-testid="analysis-agent-artifacts"]').text()).toContain('价格和折扣对销量影响最明显')
    expect(wrapper.get('[data-testid="analysis-agent-artifacts"]').text()).toContain('样本量偏小')

    await wrapper.get('[data-testid="analysis-agent-sync-canvas"]').trigger('click')

    expect(syncAnalysisCanvasMock).toHaveBeenCalledWith(workflowStore)
  })
})
