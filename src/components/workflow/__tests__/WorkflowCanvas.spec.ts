import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent } from 'vue'
import WorkflowCanvas from '../WorkflowCanvas.vue'
import { useWorkflowStore } from '@/stores/workflowStore'

vi.mock('../MonacoEditor.vue', () => ({ default: { template: '<div />' } }))

const addEdges = vi.fn()
const findNode = vi.fn()
const fitView = vi.fn()
const onConnect = vi.fn()
const project = vi.fn((position) => position)
const runtimeInputModalStub = defineComponent({
  name: 'RuntimeInputModal',
  emits: ['confirm'],
  template: '<div class="runtime-input-modal-stub"></div>',
})

vi.mock('primevue/usetoast', () => ({
  useToast: () => ({
    add: vi.fn(),
  }),
}))

vi.mock('@vue-flow/core', () => ({
  VueFlow: {
    name: 'VueFlow',
    props: [
      'nodes',
      'edges',
      'defaultEdgeOptions',
      'nodesDraggable',
      'nodesConnectable',
      'elementsSelectable',
      'selectNodesOnDrag',
      'panOnDrag',
      'zoomOnScroll',
    ],
    template: '<div class="vue-flow-stub"><slot /></div>',
  },
  useVueFlow: () => ({
    onConnect,
    addEdges,
    project,
    findNode,
    fitView,
  }),
}))

describe('WorkflowCanvas', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    document.queryCommandSupported = vi.fn(() => true) as any
  })

  it('keeps nodes selectable in history mode so snapshots can still be opened', async () => {
    const store = useWorkflowStore()
    store.isHistoryMode = true

    const wrapper = mount(WorkflowCanvas, {
      global: {
        stubs: {
          Background: { template: '<div />' },
          Controls: { template: '<div />' },
          NodeSidebar: { template: '<div />' },
          WorkflowHeader: { template: '<div />' },
          BaseNode: { template: '<div />' },
          LogPanel: { template: '<div />' },
          NodeConfigModal: { template: '<div />' },
          RuntimeInputModal: runtimeInputModalStub,
          DataAnalysisModal: { template: '<div />' },
          WorkflowManagerModal: { template: '<div />' },
          ConfirmDialog: { template: '<div />' },
          Button: { template: '<button><slot /></button>' },
          N8nEdge: { template: '<div />' },
        },
        directives: {
          tooltip: () => undefined,
        },
      },
    })

    const vueFlow = wrapper.findComponent({ name: 'VueFlow' })
    expect(vueFlow.props('nodesDraggable')).toBe(false)
    expect(vueFlow.props('nodesConnectable')).toBe(false)
    expect(vueFlow.props('elementsSelectable')).toBe(true)
  })

  it('resumes the pending node execution after runtime input confirmation', async () => {
    const store = useWorkflowStore()
    const resumeSpy = vi.spyOn(store, 'resumePendingExecution').mockResolvedValue(null as any)
    store.pendingExecution = { nodeId: 'node_1', forceUpdate: true }
    store.nodes = [
      {
        id: 'node_1',
        type: 'custom',
        position: { x: 0, y: 0 },
        label: 'Trigger',
        data: {
          label: 'Trigger',
          type: 'file-import',
          category: 'trigger',
          status: 'idle',
          config: {},
          logs: [],
          useManualInput: false,
          manualInput: '',
          isPinned: false,
        },
      } as any,
    ]

    const wrapper = mount(WorkflowCanvas, {
      global: {
        stubs: {
          Background: { template: '<div />' },
          Controls: { template: '<div />' },
          NodeSidebar: { template: '<div />' },
          WorkflowHeader: { template: '<div />' },
          BaseNode: { template: '<div />' },
          LogPanel: { template: '<div />' },
          NodeConfigModal: { template: '<div />' },
          RuntimeInputModal: runtimeInputModalStub,
          DataAnalysisModal: { template: '<div />' },
          WorkflowManagerModal: { template: '<div />' },
          ConfirmDialog: { template: '<div />' },
          Button: { template: '<button><slot /></button>' },
          N8nEdge: { template: '<div />' },
        },
        directives: {
          tooltip: () => undefined,
        },
      },
    })

    wrapper.findComponent({ name: 'RuntimeInputModal' }).vm.$emit('confirm')
    await wrapper.vm.$nextTick()

    expect(resumeSpy).toHaveBeenCalledTimes(1)
  })

  it('prompts before browser unload when the workflow has unsaved changes', async () => {
    const store = useWorkflowStore()
    store.addAndConnectNode('file-import', '导入数据', { x: 0, y: 0 })

    mount(WorkflowCanvas, {
      global: {
        stubs: {
          Background: { template: '<div />' },
          Controls: { template: '<div />' },
          NodeSidebar: { template: '<div />' },
          WorkflowHeader: { template: '<div />' },
          BaseNode: { template: '<div />' },
          LogPanel: { template: '<div />' },
          NodeConfigModal: { template: '<div />' },
          RuntimeInputModal: runtimeInputModalStub,
          DataAnalysisModal: { template: '<div />' },
          WorkflowManagerModal: { template: '<div />' },
          UnsavedWorkflowDialog: { template: '<div />' },
          ConfirmDialog: { template: '<div />' },
          Toast: { template: '<div />' },
          Button: { template: '<button><slot /></button>' },
          N8nEdge: { template: '<div />' },
        },
        directives: {
          tooltip: () => undefined,
        },
      },
    })

    const event = new Event('beforeunload', { cancelable: true }) as BeforeUnloadEvent

    window.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
  })
})
