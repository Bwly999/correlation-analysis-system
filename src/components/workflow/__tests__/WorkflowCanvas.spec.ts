import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import WorkflowCanvas from '../WorkflowCanvas.vue'
import { useWorkflowStore } from '@/stores/workflowStore'

vi.mock('../MonacoEditor.vue', () => ({ default: { template: '<div />' } }))

const addEdges = vi.fn()
const findNode = vi.fn()
const fitView = vi.fn()
const onConnect = vi.fn()
const project = vi.fn((position) => position)

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
          RuntimeInputModal: { template: '<div />' },
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
})
