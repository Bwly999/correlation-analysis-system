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
    createToolProgressHeartbeat: vi.fn(() => vi.fn()),
    recallPreviousInput: vi.fn(),
    recallNextInput: vi.fn(),
    cancelCurrentRun: vi.fn(),
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
    useJsTransformAgentMock.state.status.value = 'idle'
    useJsTransformAgentMock.state.inputText.value = ''
    useJsTransformAgentMock.state.recallPreviousInput.mockReset()
    useJsTransformAgentMock.state.recallNextInput.mockReset()
    useJsTransformAgentMock.state.cancelCurrentRun.mockReset()
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

  it('recalls previous input when ArrowUp is pressed on the first line', async () => {
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
      attachTo: document.body,
      global: {
        directives: {
          tooltip: () => undefined,
        },
      },
    })

    const textarea = wrapper.get('textarea')
    const element = textarea.element as HTMLTextAreaElement
    element.value = '第一行\n第二行'
    await textarea.setValue('第一行\n第二行')
    element.selectionStart = 0
    element.selectionEnd = 0

    await textarea.trigger('keydown', {
      key: 'ArrowUp',
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    })

    expect(useJsTransformAgentMock.state.recallPreviousInput).toHaveBeenCalledTimes(1)
  })

  it('does not recall history when ArrowUp is pressed away from the first line', async () => {
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
      attachTo: document.body,
      global: {
        directives: {
          tooltip: () => undefined,
        },
      },
    })

    const textarea = wrapper.get('textarea')
    const element = textarea.element as HTMLTextAreaElement
    await textarea.setValue('第一行\n第二行')
    element.selectionStart = 4
    element.selectionEnd = 4

    await textarea.trigger('keydown', {
      key: 'ArrowUp',
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    })

    expect(useJsTransformAgentMock.state.recallPreviousInput).not.toHaveBeenCalled()
  })

  it('cancels the current run when Escape is pressed', async () => {
    useJsTransformAgentMock.state.status.value = 'running'

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
      attachTo: document.body,
      global: {
        directives: {
          tooltip: () => undefined,
        },
      },
    })

    const textarea = wrapper.get('textarea')
    await textarea.trigger('keydown', {
      key: 'Escape',
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    })

    expect(useJsTransformAgentMock.state.cancelCurrentRun).toHaveBeenCalledTimes(1)
  })
})
