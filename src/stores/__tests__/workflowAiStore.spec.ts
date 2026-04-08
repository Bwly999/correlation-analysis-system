import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useWorkflowAiStore } from '../workflowAiStore'
import { useWorkflowStore } from '../workflowStore'
import { createTableResult } from '@/nodes/result'

const {
  requestWorkflowAiPlanMock,
  streamWorkflowAiPlanMock,
  startWorkflowAiSessionMock,
  submitWorkflowAiSessionInputMock,
  runWorkflowAiSessionMock,
  getWorkflowAiSessionMock,
  fetchSystemModelProfilesMock,
  testWorkflowAiModelTestResultMock,
} =
  vi.hoisted(() => ({
    requestWorkflowAiPlanMock: vi.fn(),
    streamWorkflowAiPlanMock: vi.fn(),
    startWorkflowAiSessionMock: vi.fn(),
    submitWorkflowAiSessionInputMock: vi.fn(),
    runWorkflowAiSessionMock: vi.fn(),
    getWorkflowAiSessionMock: vi.fn(),
    fetchSystemModelProfilesMock: vi.fn(),
    testWorkflowAiModelTestResultMock: vi.fn(),
  }))

vi.mock('@/services/workflowAi', () => ({
  WorkflowAiRequestError: class WorkflowAiRequestError extends Error {
    diagnostics?: unknown
    statusCode?: number

    constructor(message: string, diagnostics?: unknown, statusCode?: number) {
      super(message)
      this.diagnostics = diagnostics
      this.statusCode = statusCode
    }
  },
  requestWorkflowAiPlan: requestWorkflowAiPlanMock,
  streamWorkflowAiPlan: streamWorkflowAiPlanMock,
  startWorkflowAiSession: startWorkflowAiSessionMock,
  submitWorkflowAiSessionInput: submitWorkflowAiSessionInputMock,
  runWorkflowAiSession: runWorkflowAiSessionMock,
  getWorkflowAiSession: getWorkflowAiSessionMock,
  fetchSystemModelProfiles: fetchSystemModelProfilesMock,
  testWorkflowAiModelProfile: testWorkflowAiModelTestResultMock,
}))

describe('workflowAiStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    vi.clearAllMocks()
  })

  it('tracks streaming progress, raw model output and the completed plan during generation', async () => {
    startWorkflowAiSessionMock.mockResolvedValueOnce({
      session: {
        sessionId: 'session_1',
        mode: 'create',
        status: 'idle',
        prompt: '导入数据后做 Pearson 分析',
        draft: {
          summary: '',
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
      },
    })
    runWorkflowAiSessionMock.mockImplementationOnce(async (_sessionId, { onEvent }) => {
      onEvent?.({ type: 'started', sessionId: 'session_1', message: 'AI 编排会话已开始' })
      onEvent?.({ type: 'attempt_started', attempt: 1, trigger: 'initial', message: '开始首次生成' })
      onEvent?.({ type: 'stage_changed', stage: 'model_request', attempt: 1, message: '正在请求模型输出' })
      onEvent?.({ type: 'text_delta', attempt: 1, delta: '{"summary":"流式输出"}' })
      onEvent?.({
        type: 'recipe_selected',
        recipeId: 'single-table-correlation',
        recipeName: '单表相关性分析',
        reason: '命中关键词：相关、pearson',
      })
      const result = {
        plan: {
          summary: '流式输出',
          assumptions: [],
          warnings: [],
          questions: [],
          operations: [],
        },
        diagnostics: {
          status: 'success',
          stage: 'validate',
          attempts: [{ attempt: 1, trigger: 'initial', status: 'success', stage: 'validate' }],
          issues: [],
          rawOutputExcerpt: '{"summary":"流式输出"}',
        },
        draft: {
          summary: '流式输出',
          assumptions: [],
          warnings: [],
          questions: [],
          nodes: [],
          edges: [],
        },
      }
      onEvent?.({ type: 'completed', ...result })
      return result
    })

    const workflowStore = useWorkflowStore()
    const aiStore = useWorkflowAiStore()

    aiStore.selectedProfileId = 'custom-profile'
    aiStore.systemProfiles = []
    aiStore.customProfiles = [
      {
        id: 'custom-profile',
        name: '本地模型',
        baseUrl: 'http://localhost:1234/v1',
        model: 'test-model',
        apiKey: 'secret',
        enabled: true,
        source: 'custom',
      },
    ]
    aiStore.prompt = '导入数据后做 Pearson 分析'

    await aiStore.generatePlan(workflowStore as any)

    expect(aiStore.streamStatus).toBe('completed')
    expect(aiStore.streamEvents.map((event) => event.type)).toEqual([
      'started',
      'attempt_started',
      'stage_changed',
      'text_delta',
      'recipe_selected',
      'completed',
    ])
    expect(aiStore.streamOutputs).toEqual([
      {
        attempt: 1,
        trigger: 'initial',
        text: '{"summary":"流式输出"}',
      },
    ])
    expect(aiStore.plan?.summary).toBe('流式输出')
    expect(aiStore.sessionState?.selectedRecipe?.id).toBe('single-table-correlation')
  })

  it('stores plan diagnostics and writes success logs after generation', async () => {
    startWorkflowAiSessionMock.mockResolvedValueOnce({
      session: {
        sessionId: 'session_1',
        mode: 'create',
        status: 'idle',
        prompt: '导入数据后做 Pearson 分析',
        draft: {
          summary: '',
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
      },
    })
    runWorkflowAiSessionMock.mockImplementationOnce(async (_sessionId, { onEvent }) => {
      onEvent?.({ type: 'attempt_started', attempt: 1, trigger: 'initial', message: '首次生成' })
      onEvent?.({
        type: 'diagnostic',
        diagnostics: {
          status: 'failed',
          stage: 'parse',
          attempts: [
            { attempt: 1, trigger: 'initial', status: 'failed', stage: 'parse', message: '首次解析失败' },
          ],
          issues: [{ stage: 'parse', operationId: 'plan', message: '首次解析失败' }],
          rawOutputExcerpt: '不是 JSON',
        },
        message: '首轮解析失败，准备自动修复',
      })
      onEvent?.({ type: 'attempt_started', attempt: 2, trigger: 'repair', message: '重试开始' })
      const result = {
        plan: {
          summary: '已生成最小可行流程',
          assumptions: [],
          warnings: [],
          questions: [],
          operations: [],
        },
        diagnostics: {
          status: 'success',
          stage: 'validate',
          attempts: [
            { attempt: 1, trigger: 'initial', status: 'failed', stage: 'parse', message: '首次解析失败' },
            { attempt: 2, trigger: 'repair', status: 'success', stage: 'validate', message: '重试成功' },
          ],
          issues: [],
          rawOutputExcerpt: '{"summary":"已生成最小可行流程"}',
        },
        draft: {
          summary: '已生成最小可行流程',
          assumptions: [],
          warnings: [],
          questions: [],
          nodes: [],
          edges: [],
        },
      }
      onEvent?.({ type: 'completed', ...result })
      return result
    })

    const workflowStore = useWorkflowStore()
    const aiStore = useWorkflowAiStore()

    aiStore.selectedProfileId = 'custom-profile'
    aiStore.systemProfiles = []
    aiStore.customProfiles = [
      {
        id: 'custom-profile',
        name: '本地模型',
        baseUrl: 'http://localhost:1234/v1',
        model: 'test-model',
        apiKey: 'secret',
        enabled: true,
        source: 'custom',
      },
    ]
    aiStore.prompt = '导入数据后做 Pearson 分析'

    await aiStore.generatePlan(workflowStore as any)

    expect(aiStore.plan?.summary).toBe('已生成最小可行流程')
    expect(aiStore.generationDiagnostics?.attempts).toHaveLength(2)
    expect(workflowStore.logs.some((log) => log.message.includes('AI编排生成成功'))).toBe(true)
    expect(workflowStore.logs.some((log) => log.message.includes('自动修复重试'))).toBe(true)
  })

  it('preserves diagnostics when generation fails', async () => {
    startWorkflowAiSessionMock.mockResolvedValueOnce({
      session: {
        sessionId: 'session_1',
        mode: 'create',
        status: 'idle',
        prompt: '创建工作流',
        draft: {
          summary: '',
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
      },
    })
    runWorkflowAiSessionMock.mockRejectedValueOnce(
      Object.assign(new Error('AI 计划校验失败'), {
        status: 'failed',
        stage: 'validate',
        attempts: [{ attempt: 1, trigger: 'initial', status: 'failed', stage: 'validate', message: '校验失败' }],
        issues: [{ stage: 'validate', operationId: 'op_1', message: '空计划缺少追问信息' }],
        rawOutputExcerpt: '{"summary":"失败"}',
        diagnostics: {
          status: 'failed',
          stage: 'validate',
          attempts: [
            { attempt: 1, trigger: 'initial', status: 'failed', stage: 'validate', message: '校验失败' },
          ],
          issues: [{ stage: 'validate', operationId: 'op_1', message: '空计划缺少追问信息' }],
          rawOutputExcerpt: '{"summary":"失败"}',
        },
      }),
    )

    const workflowStore = useWorkflowStore()
    const aiStore = useWorkflowAiStore()

    aiStore.selectedProfileId = 'custom-profile'
    aiStore.customProfiles = [
      {
        id: 'custom-profile',
        name: '本地模型',
        baseUrl: 'http://localhost:1234/v1',
        model: 'test-model',
        apiKey: 'secret',
        enabled: true,
        source: 'custom',
      },
    ]
    aiStore.prompt = '创建工作流'

    await expect(aiStore.generatePlan(workflowStore as any)).rejects.toThrow('AI 计划校验失败')

    expect(aiStore.errorMessage).toBe('AI 计划校验失败')
    expect(aiStore.generationDiagnostics?.stage).toBe('validate')
    expect(aiStore.generationDiagnostics?.issues).toEqual([
      { stage: 'validate', operationId: 'op_1', message: '空计划缺少追问信息' },
    ])
    expect(workflowStore.logs.some((log) => log.message.includes('AI编排生成失败'))).toBe(true)
  })

  it('builds local tool context hints before sending the workflow ai request', async () => {
    startWorkflowAiSessionMock.mockResolvedValueOnce({
      session: {
        sessionId: 'session_1',
        mode: 'edit',
        status: 'idle',
        prompt: '导入一份 JSON 表格，快速演示 Pearson 相关分析，给我最小可运行流程。',
        draft: {
          summary: '',
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
      },
    })
    runWorkflowAiSessionMock.mockResolvedValueOnce({
      plan: {
        summary: '已生成',
        assumptions: [],
        warnings: [],
        questions: [],
        operations: [],
      },
      diagnostics: {
        status: 'success',
        stage: 'validate',
        attempts: [{ attempt: 1, trigger: 'initial', status: 'success', stage: 'validate' }],
        issues: [],
      },
      draft: {
        summary: '已生成',
        assumptions: [],
        warnings: [],
        questions: [],
        nodes: [],
        edges: [],
      },
    })

    const aiStore = useWorkflowAiStore()
    aiStore.selectedProfileId = 'custom-profile'
    aiStore.customProfiles = [
      {
        id: 'custom-profile',
        name: '本地模型',
        baseUrl: 'http://localhost:1234/v1',
        model: 'test-model',
        apiKey: 'secret',
        enabled: true,
        source: 'custom',
      },
    ]
    aiStore.mode = 'edit'
    aiStore.prompt = '导入一份 JSON 表格，快速演示 Pearson 相关分析，给我最小可运行流程。'

    const workflowStore = {
      workflowName: '测试工作流',
      nodes: [
        {
          id: 'node_import_1',
          position: { x: 0, y: 0 },
          data: {
            label: '手动输入数据',
            type: 'manual-json-import',
            category: 'trigger',
            config: {},
            status: 'success',
            output: createTableResult([
              { sn: 'SN-001', feature: 1, target: 2 },
              { sn: 'SN-002', feature: 2, target: 3 },
            ]),
            logs: [],
          },
        },
      ],
      edges: [],
      logs: [] as Array<{ level: string; message: string }>,
      addLog(message: string, level = 'info') {
        this.logs.push({ message, level })
      },
      applyWorkflowAiPlan() {
        return { snapshotId: 'snapshot_1' }
      },
      restoreEditableSnapshot() {
        return true
      },
    }

    await aiStore.generatePlan(workflowStore as any)

    const request = startWorkflowAiSessionMock.mock.calls[0]?.[0]
    expect(request.contextHints?.recipes?.[0]).toMatchObject({
      id: 'single-table-correlation',
    })
    expect(request.contextHints?.schemaSummaries?.[0]).toMatchObject({
      nodeId: 'node_import_1',
      resultKind: 'table',
    })
    expect(aiStore.toolTrace.map((item) => item.toolName)).toEqual([
      'get_workflow_context',
      'search_recipes',
      'inspect_cached_schema',
    ])
    expect(runWorkflowAiSessionMock).toHaveBeenCalledWith('session_1', expect.any(Object))
  })

  it('uses ephemeral inspection when no cached output is available for schema hints', async () => {
    startWorkflowAiSessionMock.mockResolvedValueOnce({
      session: {
        sessionId: 'session_1',
        mode: 'edit',
        status: 'idle',
        prompt: '继续做 Pearson 相关分析。',
        draft: {
          summary: '',
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
      },
    })
    runWorkflowAiSessionMock.mockResolvedValueOnce({
      plan: {
        summary: '已生成',
        assumptions: [],
        warnings: [],
        questions: [],
        operations: [],
      },
      diagnostics: {
        status: 'success',
        stage: 'validate',
        attempts: [{ attempt: 1, trigger: 'initial', status: 'success', stage: 'validate' }],
        issues: [],
      },
      draft: {
        summary: '已生成',
        assumptions: [],
        warnings: [],
        questions: [],
        nodes: [],
        edges: [],
      },
    })

    const aiStore = useWorkflowAiStore()
    aiStore.selectedProfileId = 'custom-profile'
    aiStore.customProfiles = [
      {
        id: 'custom-profile',
        name: '本地模型',
        baseUrl: 'http://localhost:1234/v1',
        model: 'test-model',
        apiKey: 'secret',
        enabled: true,
        source: 'custom',
      },
    ]
    aiStore.mode = 'edit'
    aiStore.prompt = '继续做 Pearson 相关分析。'

    const executeForAiInspection = vi.fn().mockResolvedValue(
      createTableResult([
        { feature: 1, target: 2 },
        { feature: 2, target: 3 },
      ]),
    )

    const workflowStore = {
      workflowName: '测试工作流',
      nodes: [
        {
          id: 'node_clean_1',
          position: { x: 0, y: 0 },
          data: {
            label: '数据清洗',
            type: 'data-cleaning',
            category: 'action',
            config: {},
            status: 'idle',
            output: null,
            logs: [],
          },
        },
      ],
      edges: [],
      logs: [] as Array<{ level: string; message: string }>,
      addLog(message: string, level = 'info') {
        this.logs.push({ message, level })
      },
      applyWorkflowAiPlan() {
        return { snapshotId: 'snapshot_1' }
      },
      restoreEditableSnapshot() {
        return true
      },
      executeForAiInspection,
    }

    await aiStore.generatePlan(workflowStore as any)

    const request = startWorkflowAiSessionMock.mock.calls[0]?.[0]
    expect(executeForAiInspection).toHaveBeenCalledWith('node_clean_1')
    expect(request.contextHints?.schemaSummaries?.[0]).toMatchObject({
      nodeId: 'node_clean_1',
      resultKind: 'table',
      candidateTargetColumns: ['target'],
      candidateFeatureColumns: ['feature'],
    })
    expect(aiStore.toolTrace.map((item) => item.toolName)).toContain('inspect_ephemeral_schema')
  })

  it('submits missing info answers and continues the current ai session', async () => {
    submitWorkflowAiSessionInputMock.mockResolvedValueOnce({
      session: {
        sessionId: 'session_1',
        mode: 'edit',
        status: 'idle',
        prompt: '继续完成相关分析',
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
        missingInfo: [],
        contextHints: {
          userAnswers: [
            {
              key: 'question_1',
              value: '目标字段就是 target',
            },
          ],
        },
      },
    })
    runWorkflowAiSessionMock.mockImplementationOnce(async (_sessionId, { onEvent }) => {
      const result = {
        plan: {
          summary: '已补齐目标字段并完成工作流',
          assumptions: ['目标字段使用 target'],
          warnings: [],
          questions: [],
          operations: [],
        },
        diagnostics: {
          status: 'success',
          stage: 'validate',
          attempts: [{ attempt: 1, trigger: 'initial', status: 'success', stage: 'validate' }],
          issues: [],
        },
        draft: {
          summary: '已补齐目标字段并完成工作流',
          assumptions: [],
          warnings: [],
          questions: [],
          nodes: [],
          edges: [],
        },
      }
      onEvent?.({ type: 'started', sessionId: 'session_1', message: 'AI 编排会话已开始' })
      onEvent?.({ type: 'completed', ...result })
      return result
    })

    const aiStore = useWorkflowAiStore()
    const workflowStore = useWorkflowStore()

    aiStore.sessionState = {
      sessionId: 'session_1',
      mode: 'edit',
      status: 'waiting_user',
      prompt: '继续完成相关分析',
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

    await (aiStore as any).continueSession(workflowStore as any, {
      question_1: '目标字段就是 target',
    })

    expect(submitWorkflowAiSessionInputMock).toHaveBeenCalledWith('session_1', {
      answers: {
        question_1: '目标字段就是 target',
      },
    })
    expect(runWorkflowAiSessionMock).toHaveBeenCalledWith('session_1', expect.any(Object))
    expect(aiStore.plan?.summary).toBe('已补齐目标字段并完成工作流')
    expect(aiStore.sessionState?.status).toBe('completed')
  })

  it('derives an analysis agent session with conversation, artifacts and approval requests', () => {
    const aiStore = useWorkflowAiStore()

    aiStore.prompt = '帮我找出影响销量的关键因素'
    aiStore.plan = {
      summary: '价格和折扣对销量影响最明显',
      assumptions: ['默认以销量作为目标字段'],
      warnings: ['样本量偏小，建议结合更多周期数据复核'],
      questions: [],
      operations: [],
    }
    aiStore.sessionState = {
      sessionId: 'session_1',
      mode: 'edit',
      status: 'waiting_user',
      prompt: '帮我找出影响销量的关键因素',
      draft: {
        summary: '先清洗数据，再执行相关性与特征重要性分析',
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
      missingInfo: [
        {
          key: 'question_1',
          label: '目标字段',
          reason: '请确认销量字段',
          blocking: true,
        },
      ],
    }

    expect(aiStore.analysisAgentSession).toMatchObject({
      sessionId: 'session_1',
      userGoal: '帮我找出影响销量的关键因素',
      phase: 'waiting_for_input',
      artifacts: [
        expect.objectContaining({
          type: 'conclusion_card',
          title: '分析结论',
        }),
      ],
      approvalRequests: [
        expect.objectContaining({
          key: 'question_1',
          label: '目标字段',
        }),
      ],
      conversation: [
        expect.objectContaining({
          role: 'user',
          content: '帮我找出影响销量的关键因素',
        }),
      ],
    })
  })

  it('syncs the current canvas into the analysis session summary', () => {
    const aiStore = useWorkflowAiStore()

    aiStore.sessionState = {
      sessionId: 'session_1',
      mode: 'edit',
      status: 'running',
      prompt: '继续分析',
      draft: {
        summary: '旧草稿',
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

    aiStore.syncAnalysisCanvas({
      workflowName: '测试工作流',
      nodes: [{ id: 'node_1' }, { id: 'node_2' }],
      edges: [{ id: 'edge_1' }],
    } as any)

    expect(aiStore.analysisAgentSession?.conversation[aiStore.analysisAgentSession.conversation.length - 1]).toMatchObject({
      role: 'assistant',
      content: '已同步当前画布，共 2 个节点、1 条连线。',
    })
    expect(aiStore.analysisAgentSession?.workflowSummary).toBe('当前画布共 2 个节点、1 条连线')
  })
})
