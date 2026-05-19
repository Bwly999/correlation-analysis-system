import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import JsTransformAgentPanel from '../JsTransformAgentPanel.vue'

const useJsTransformAgentMock = vi.hoisted(() => ({
  state: {
    status: { value: 'idle' },
    mode: { value: 'ask' },
    messages: { value: [] as any[] },
    errorMessage: { value: '' },
    inputText: { value: '' },
    canSend: { value: false },
    externalEventHandler: { value: null },
  },
}))

vi.mock('@/stores/useJsTransformAgent', () => ({
  useJsTransformAgent: () => useJsTransformAgentMock.state,
}))

vi.mock('../piAgent/PiAgentThinkingBlock.vue', () => ({
  default: { template: '<div />' },
}))

vi.mock('../piAgent/PiAgentToolCallCard.vue', () => ({
  default: { template: '<div />' },
}))

vi.mock('../piAgent/PiAgentMarkdownRenderer.vue', () => ({
  default: { template: '<div />' },
}))

describe('JsTransformAgentPanel', () => {
  beforeEach(() => {
    useJsTransformAgentMock.state.messages.value = []
    useJsTransformAgentMock.state.errorMessage.value = ''
  })

  it('keeps the message area scrollable inside a full-height shell', () => {
    const wrapper = mount(JsTransformAgentPanel, {
      props: {
        nodeId: 'node-1',
        code: 'return rows',
        context: {
          node: {
            nodeId: 'node-1',
            nodeLabel: 'JS代码执行',
            nodeType: 'js-transform',
          },
          task: '',
          codeContext: {
            currentCode: 'return rows',
            language: 'javascript',
            declarations: '',
            constraints: [],
          },
          inputContext: {
            inputMode: 'single',
            rowCount: 1,
            sourceSummary: '',
            sampleRows: [],
            schemaSummary: { fields: [] },
          },
          latestDebugContext: {
            status: 'idle',
            summary: '',
            outputSample: [],
            errorMessage: '',
          },
          capabilities: {
            ask: [],
            agent: [],
          },
        },
        profile: {
          id: 'profile-1',
          name: '默认模型',
          baseUrl: 'http://example.com',
          model: 'glm-4.7',
          enabled: true,
          source: 'system',
        },
        outputData: null,
        errorMessage: '',
        onApplyCode: vi.fn(),
        onDebugNode: vi.fn(),
      },
      global: {
        directives: {
          tooltip: () => undefined,
        },
      },
    })

    expect(wrapper.get('[data-testid="js-transform-agent-panel"]').classes()).toContain('h-full')
    expect(wrapper.get('.custom-scrollbar').classes()).toContain('overflow-y-auto')
  })
})
