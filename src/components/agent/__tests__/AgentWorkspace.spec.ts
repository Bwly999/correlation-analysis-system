import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import AgentWorkspace from '../AgentWorkspace.vue'
import { useWorkflowAiStore } from '@/stores/workflowAiStore'

describe('AgentWorkspace', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  it('renders timeline, tool calls, streaming text and collapsible thinking blocks', async () => {
    const aiStore = useWorkflowAiStore()
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
          Button: { template: '<button @click="$emit(\'click\')"><slot /></button>' },
        },
      },
    })

    expect(wrapper.get('[data-testid="agent-workspace-messages"]').text()).toContain('价格和折扣是当前最值得优先关注的因素')
    expect(wrapper.get('[data-testid="agent-workspace-timeline"]').text()).toContain('正在校验分析路径')
    expect(wrapper.get('[data-testid="agent-workspace-tools"]').text()).toContain('inspect_cached_schema')
    expect(wrapper.get('[data-testid="agent-workspace-stream"]').text()).toContain('正在检查字段与样本质量')
    expect(wrapper.get('[data-testid="agent-thinking-block"]').text()).toContain('分析思考')

    await wrapper.get('[data-testid="agent-thinking-toggle"]').trigger('click')

    expect(wrapper.get('[data-testid="agent-thinking-body"]').text()).toContain('先做字段检查，再跑相关性与随机森林')
  })
})
