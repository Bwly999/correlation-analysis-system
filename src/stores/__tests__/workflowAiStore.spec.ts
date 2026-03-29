import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useWorkflowAiStore } from '../workflowAiStore'
import { useWorkflowStore } from '../workflowStore'

const { requestWorkflowAiPlanMock, streamWorkflowAiPlanMock, fetchSystemModelProfilesMock, testWorkflowAiModelTestResultMock } =
  vi.hoisted(() => ({
    requestWorkflowAiPlanMock: vi.fn(),
    streamWorkflowAiPlanMock: vi.fn(),
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
    streamWorkflowAiPlanMock.mockImplementationOnce(async (_request, { onEvent }) => {
      onEvent?.({ type: 'started', message: 'AI 编排已开始' })
      onEvent?.({ type: 'attempt_started', attempt: 1, trigger: 'initial', message: '开始首次生成' })
      onEvent?.({ type: 'stage_changed', stage: 'model_request', attempt: 1, message: '正在请求模型输出' })
      onEvent?.({ type: 'text_delta', attempt: 1, delta: '{"summary":"流式输出"}' })
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
  })

  it('stores plan diagnostics and writes success logs after generation', async () => {
    streamWorkflowAiPlanMock.mockImplementationOnce(async (_request, { onEvent }) => {
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
    streamWorkflowAiPlanMock.mockRejectedValueOnce(
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
})
