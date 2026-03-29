import { beforeEach, describe, expect, it } from 'vitest'
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

  it('renders streaming progress and live model output while ai orchestration is running', () => {
    const aiStore = useWorkflowAiStore()
    useWorkflowStore()

    aiStore.isGenerating = true
    aiStore.streamStatus = 'streaming'
    aiStore.streamEvents = [
      { type: 'started', message: 'AI 编排已开始' },
      { type: 'attempt_started', attempt: 1, trigger: 'initial', message: '开始首次生成' },
      { type: 'stage_changed', stage: 'model_request', attempt: 1, message: '正在请求模型输出' },
    ]
    aiStore.streamOutputs = [
      { attempt: 1, trigger: 'initial', text: '{"summary":"实时输出中"}' },
    ]

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
    expect(wrapper.get('[data-testid="workflow-ai-stream-progress"]').text()).toContain('正在请求模型输出')
    expect(wrapper.get('[data-testid="workflow-ai-stream-output"]').text()).toContain('实时输出中')
  })
})
