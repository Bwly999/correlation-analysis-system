import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('vue', async () => {
  const actual = await vi.importActual<typeof import('vue')>('vue')
  return {
    ...actual,
    defineAsyncComponent: (loader: any) => {
      void loader
      return {
        name: 'AsyncComponentStub',
        template: '<div data-testid="monaco-editor-stub" />',
      }
    },
  }
})

const loadProfilesMock = vi.fn()

vi.mock('@/stores/piAgentConfigStore', () => ({
  usePiAgentConfigStore: () => ({
    selectedProfile: { value: { id: 'profile-1' } },
    loadProfiles: loadProfilesMock,
  }),
}))

vi.mock('@/components/workflow/MonacoEditor.vue', () => ({
  default: {
    props: ['modelValue', 'height', 'language', 'declarations'],
    emits: ['update:modelValue'],
    template: '<div data-testid="monaco-editor-stub" />',
  },
}))

vi.mock('@/components/workflow/JsTransformAgentPanel.vue', () => ({
  default: {
    props: ['nodeId', 'code', 'context', 'profile', 'outputData', 'errorMessage', 'onApplyCode', 'onDebugNode'],
    template: '<div data-testid="js-transform-agent-panel-stub" />',
  },
}))

vi.mock('@/components/workflow/MonacoEditor.vue', () => ({
  default: {
    props: ['modelValue', 'height', 'language', 'declarations'],
    emits: ['update:modelValue'],
    template: '<div data-testid="monaco-editor-stub" />',
  },
}))

describe('PropertyFieldCodeEditorWithAgent', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    loadProfilesMock.mockReset()
  })

  it('uses a fixed-height dock so the assistant panel is not clipped', async () => {
    const { default: PropertyFieldCodeEditorWithAgent } = await import('../PropertyFieldCodeEditorWithAgent.vue')

    const wrapper = mount(PropertyFieldCodeEditorWithAgent, {
      props: {
        modelValue: 'return rows',
        nodeId: 'node-1',
        contextBuilder: () => ({
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
        }),
        outputData: null,
        errorMessage: '',
        onDebugNode: vi.fn().mockResolvedValue({
          ok: true,
          status: 'success',
          summary: 'ok',
          outputSample: [],
          errorMessage: '',
        }),
      },
      global: {
        directives: {
          tooltip: () => undefined,
        },
        stubs: {
          Teleport: true,
          MessageSquarePlus: true,
          X: true,
        },
      },
    })

    await wrapper.get('[data-testid="js-transform-agent-toggle"]').trigger('click')

    const dock = wrapper.get('[data-testid="js-transform-agent-dock"]')
    expect(dock.attributes('style')).toContain('height: 780px')
    expect(dock.attributes('style')).toContain('max-height: 780px')
  })
})
