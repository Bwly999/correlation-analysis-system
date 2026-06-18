import { beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import { afterEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent } from 'vue'
import WorkflowCanvas from '../WorkflowCanvas.vue'
import { useWorkflowStore } from '@/stores/workflowStore'
import { httpClient } from '@/services/httpClient'

vi.mock('../MonacoEditor.vue', () => ({ default: { template: '<div />' } }))

const addEdges = vi.fn()
const findNode = vi.fn()
const fitView = vi.fn()
const getViewport = vi.fn(() => ({ x: 500, y: 120, zoom: 1 }))
const setViewport = vi.fn()
const onConnect = vi.fn()
const project = vi.fn((position) => position)
const runtimeInputModalStub = defineComponent({
  name: 'RuntimeInputModal',
  emits: ['confirm', 'close'],
  template: '<div class="runtime-input-modal-stub"></div>',
})
const workflowManagerModalStub = defineComponent({
  name: 'WorkflowManagerModal',
  props: {
    visible: Boolean,
  },
  emits: ['close', 'load-workflow', 'create-workflow'],
  template: '<div class="workflow-manager-modal-stub" :data-visible="visible"></div>',
})
const workflowResultDashboardModalStub = defineComponent({
  name: 'WorkflowResultDashboardModal',
  props: {
    visible: Boolean,
    summary: Object,
  },
  template:
    '<div class="workflow-result-dashboard-modal-stub" :data-visible="visible">{{ summary?.workflowName }}</div>',
})
const toastStub = defineComponent({
  name: 'Toast',
  props: {
    group: String,
    position: String,
  },
  template:
    '<div class="toast-stub" :data-group="group ?? \'default\'" :data-position="position ?? \'top-right\'"></div>',
})

const dataAnalysisModalStub = defineComponent({
  name: 'DataAnalysisModal',
  props: {
    visible: Boolean,
    title: String,
    data: null,
    storageScopeKey: String,
  },
  emits: ['close'],
  template:
    '<div class="data-analysis-modal-stub" :data-visible="String(visible)" :data-storage-scope-key="storageScopeKey ?? \'\'">{{ title }}</div>',
})

const notebookFrameSwitchSessionMock = vi.fn()
const notebookFrameStub = defineComponent({
  name: 'NotebookFrame',
  props: ['sessionId', 'initialData', 'visible'],
  emits: ['close'],
  template: '<div class="notebook-frame-stub" :data-session-id="sessionId" :data-visible="String(visible)"></div>',
  setup(_props, { expose }) {
    expose({
      switchSession: notebookFrameSwitchSessionMock,
    })
    return {}
  },
})

const flushAsyncWork = async () => {
  await Promise.resolve()
  await Promise.resolve()
  await new Promise((resolve) => setTimeout(resolve, 0))
}

vi.mock('primevue/usetoast', () => ({
  useToast: () => ({
    add: vi.fn(),
  }),
}))

enableAutoUnmount(afterEach)

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
      'deleteKeyCode',
      'selectionKeyCode',
      'multiSelectionKeyCode',
      'zoomActivationKeyCode',
      'panActivationKeyCode',
    ],
    template: '<div class="vue-flow-stub"><slot /></div>',
  },
  useVueFlow: () => ({
    onConnect,
    addEdges,
    project,
    findNode,
    fitView,
    getViewport,
    setViewport,
  }),
}))

describe('WorkflowCanvas', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    document.queryCommandSupported = vi.fn(() => true) as any
    vi.stubGlobal('navigator', {
      ...navigator,
      clipboard: {
        readText: vi.fn().mockResolvedValue(''),
        writeText: vi.fn().mockResolvedValue(undefined),
      },
      platform: 'Win32',
    })
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0)
      return 1
    })
    fitView.mockResolvedValue(true)
    setViewport.mockResolvedValue(true)
    notebookFrameSwitchSessionMock.mockReset()
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
          WorkflowResultDashboardModal: { template: '<div />' },
          WorkflowManagerModal: workflowManagerModalStub,
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

  it('uses Ctrl as the selection modifier on non-mac platforms and disables bare delete', () => {
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
          WorkflowResultDashboardModal: { template: '<div />' },
          WorkflowManagerModal: workflowManagerModalStub,
          UnsavedWorkflowDialog: { template: '<div />' },
          HelpCenterModal: { template: '<div />' },
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

    const vueFlow = wrapper.findComponent({ name: 'VueFlow' })
    expect(vueFlow.props('selectionKeyCode')).toBe('Control')
    expect(vueFlow.props('multiSelectionKeyCode')).toBe('Control')
    expect(vueFlow.props('deleteKeyCode')).toBe(null)
  })

  it('disables canvas keyboard shortcuts while the node config modal is open', async () => {
    const store = useWorkflowStore()
    findNode.mockReturnValue({ id: 'node_1' })
    store.nodes = [
      {
        id: 'node_1',
        type: 'custom',
        position: { x: 0, y: 0 },
        label: '数据清洗',
        data: {
          label: '数据清洗',
          type: 'data-cleaning',
          category: 'action',
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
          WorkflowResultDashboardModal: { template: '<div />' },
          WorkflowManagerModal: workflowManagerModalStub,
          UnsavedWorkflowDialog: { template: '<div />' },
          HelpCenterModal: { template: '<div />' },
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

    store.activeConfigNodeId = 'node_1'
    await flushAsyncWork()

    const vueFlow = wrapper.findComponent({ name: 'VueFlow' })
    expect(vueFlow.props('deleteKeyCode')).toBe(null)
    expect(vueFlow.props('selectionKeyCode')).toBe(false)
    expect(vueFlow.props('multiSelectionKeyCode')).toBe(null)
    expect(vueFlow.props('zoomActivationKeyCode')).toBe(null)
    expect(vueFlow.props('panActivationKeyCode')).toBe(null)
  })

  it('saves the workflow when pressing Ctrl+S on the canvas', async () => {
    const store = useWorkflowStore()
    const saveSpy = vi.spyOn(store, 'saveWorkflow').mockResolvedValue(undefined as any)

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
          WorkflowResultDashboardModal: { template: '<div />' },
          WorkflowManagerModal: workflowManagerModalStub,
          UnsavedWorkflowDialog: { template: '<div />' },
          HelpCenterModal: { template: '<div />' },
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

    const event = new KeyboardEvent('keydown', {
      key: 's',
      ctrlKey: true,
      cancelable: true,
    })

    window.dispatchEvent(event)
    await flushAsyncWork()

    expect(event.defaultPrevented).toBe(true)
    expect(saveSpy).toHaveBeenCalledTimes(1)
  })

  it('routes Ctrl+Delete to batch node removal on the canvas', async () => {
    const store = useWorkflowStore()
    const removeSpy = vi.spyOn(store, 'removeSelectedNodes').mockImplementation(() => [])

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
          WorkflowResultDashboardModal: { template: '<div />' },
          WorkflowManagerModal: workflowManagerModalStub,
          UnsavedWorkflowDialog: { template: '<div />' },
          HelpCenterModal: { template: '<div />' },
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

    const event = new KeyboardEvent('keydown', {
      key: 'Del',
      code: 'Delete',
      ctrlKey: true,
      cancelable: true,
    })

    window.dispatchEvent(event)
    await flushAsyncWork()

    expect(event.defaultPrevented).toBe(true)
    expect(removeSpy).toHaveBeenCalledTimes(1)
  })

  it('routes Ctrl+C to immediate selected-node duplication on the canvas', async () => {
    const store = useWorkflowStore()
    const duplicateSpy = vi.spyOn(store, 'duplicateSelectedNodes').mockImplementation(() => [])

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
          WorkflowResultDashboardModal: { template: '<div />' },
          WorkflowManagerModal: workflowManagerModalStub,
          UnsavedWorkflowDialog: { template: '<div />' },
          HelpCenterModal: { template: '<div />' },
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

    const event = new KeyboardEvent('keydown', {
      key: 'c',
      code: 'KeyC',
      ctrlKey: true,
      cancelable: true,
    })

    window.dispatchEvent(event)
    await flushAsyncWork()

    expect(event.defaultPrevented).toBe(true)
    expect(duplicateSpy).toHaveBeenCalledTimes(1)
  })

  it('routes Ctrl+Z to canvas undo', async () => {
    const store = useWorkflowStore()
    const undoSpy = vi.spyOn(store, 'undoCanvasChange').mockReturnValue(true)

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
          WorkflowResultDashboardModal: { template: '<div />' },
          WorkflowManagerModal: workflowManagerModalStub,
          UnsavedWorkflowDialog: { template: '<div />' },
          HelpCenterModal: { template: '<div />' },
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

    const event = new KeyboardEvent('keydown', {
      key: 'z',
      code: 'KeyZ',
      ctrlKey: true,
      cancelable: true,
    })

    window.dispatchEvent(event)
    await flushAsyncWork()

    expect(event.defaultPrevented).toBe(true)
    expect(undoSpy).toHaveBeenCalledTimes(1)
  })

  it('routes Ctrl+Y to canvas redo', async () => {
    const store = useWorkflowStore()
    const redoSpy = vi.spyOn(store, 'redoCanvasChange').mockReturnValue(true)

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
          WorkflowResultDashboardModal: { template: '<div />' },
          WorkflowManagerModal: workflowManagerModalStub,
          UnsavedWorkflowDialog: { template: '<div />' },
          HelpCenterModal: { template: '<div />' },
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

    const event = new KeyboardEvent('keydown', {
      key: 'y',
      code: 'KeyY',
      ctrlKey: true,
      cancelable: true,
    })

    window.dispatchEvent(event)
    await flushAsyncWork()

    expect(event.defaultPrevented).toBe(true)
    expect(redoSpy).toHaveBeenCalledTimes(1)
  })

  it('does not route canvas shortcuts when the pi agent panel handles the key event', async () => {
    const store = useWorkflowStore()
    const duplicateSpy = vi.spyOn(store, 'duplicateSelectedNodes').mockImplementation(() => [])

    const workflowHeaderStub = defineComponent({
      name: 'WorkflowHeader',
      emits: ['toggle-ai'],
      template:
        '<button data-testid="workflow-header-ai-toggle" @click="$emit(\'toggle-ai\')">分析代理</button>',
    })

    const wrapper = mount(WorkflowCanvas, {
      global: {
        stubs: {
          Background: { template: '<div />' },
          Controls: { template: '<div />' },
          NodeSidebar: { template: '<div />' },
          WorkflowHeader: workflowHeaderStub,
          BaseNode: { template: '<div />' },
          LogPanel: { template: '<div />' },
          NodeConfigModal: { template: '<div />' },
          RuntimeInputModal: runtimeInputModalStub,
          WorkflowResultDashboardModal: { template: '<div />' },
          WorkflowManagerModal: workflowManagerModalStub,
          UnsavedWorkflowDialog: { template: '<div />' },
          HelpCenterModal: { template: '<div />' },
          ConfirmDialog: { template: '<div />' },
          Toast: { template: '<div />' },
          Button: { template: '<button><slot /></button>' },
          N8nEdge: { template: '<div />' },
          PiAgentPanel: defineComponent({
            name: 'PiAgentPanel',
            template:
              '<div class="pi-agent-panel-stub" tabindex="0"><textarea class="agent-input" @keydown.stop></textarea></div>',
          }),
        },
        directives: {
          tooltip: () => undefined,
        },
      },
    })

    await wrapper.get('[data-testid="workflow-header-ai-toggle"]').trigger('click')

    const textarea = wrapper.get('.agent-input')
    await textarea.trigger('keydown', {
      key: 'c',
      code: 'KeyC',
      ctrlKey: true,
    })

    await flushAsyncWork()

    expect(duplicateSpy).not.toHaveBeenCalled()
  })

  it('does not route Ctrl+C to canvas duplication when the event comes from the pi agent panel', async () => {
    const store = useWorkflowStore()
    const duplicateSpy = vi.spyOn(store, 'duplicateSelectedNodes').mockImplementation(() => [])

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
          WorkflowResultDashboardModal: { template: '<div />' },
          WorkflowManagerModal: workflowManagerModalStub,
          UnsavedWorkflowDialog: { template: '<div />' },
          HelpCenterModal: { template: '<div />' },
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

    const piAgentPanel = document.createElement('div')
    piAgentPanel.className = 'pi-agent-panel'
    const message = document.createElement('div')
    message.textContent = 'Agent 消息'
    piAgentPanel.appendChild(message)
    document.body.appendChild(piAgentPanel)

    try {
      const event = new KeyboardEvent('keydown', {
        key: 'c',
        code: 'KeyC',
        ctrlKey: true,
        cancelable: true,
      })

      Object.defineProperty(event, 'target', {
        configurable: true,
        value: message,
      })

      window.dispatchEvent(event)
      await flushAsyncWork()

      expect(event.defaultPrevented).toBe(false)
      expect(duplicateSpy).not.toHaveBeenCalled()
    } finally {
      piAgentPanel.remove()
    }
  })

  it('keeps native copy behavior when text is selected', async () => {
    const store = useWorkflowStore()
    const duplicateSpy = vi.spyOn(store, 'duplicateSelectedNodes').mockImplementation(() => [])

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
          WorkflowResultDashboardModal: { template: '<div />' },
          WorkflowManagerModal: workflowManagerModalStub,
          UnsavedWorkflowDialog: { template: '<div />' },
          HelpCenterModal: { template: '<div />' },
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

    const selectionSpy = vi.spyOn(window, 'getSelection').mockReturnValue({
      isCollapsed: false,
      rangeCount: 1,
      toString: () => '已选中文本',
    } as Selection)

    try {
      const event = new KeyboardEvent('keydown', {
        key: 'c',
        code: 'KeyC',
        ctrlKey: true,
        cancelable: true,
      })

      window.dispatchEvent(event)
      await flushAsyncWork()

      expect(event.defaultPrevented).toBe(false)
      expect(duplicateSpy).not.toHaveBeenCalled()
    } finally {
      selectionSpy.mockRestore()
    }
  })

  it('does not save the workflow from the canvas when node config is open', async () => {
    const store = useWorkflowStore()
    const saveSpy = vi.spyOn(store, 'saveWorkflow').mockResolvedValue(undefined as any)
    findNode.mockReturnValue({ id: 'node_1' })
    store.nodes = [
      {
        id: 'node_1',
        type: 'custom',
        position: { x: 0, y: 0 },
        label: '数据清洗',
        data: {
          label: '数据清洗',
          type: 'data-cleaning',
          category: 'action',
          status: 'idle',
          config: {},
          logs: [],
          useManualInput: false,
          manualInput: '',
          isPinned: false,
        },
      } as any,
    ]

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
          WorkflowResultDashboardModal: { template: '<div />' },
          WorkflowManagerModal: workflowManagerModalStub,
          UnsavedWorkflowDialog: { template: '<div />' },
          HelpCenterModal: { template: '<div />' },
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

    store.activeConfigNodeId = 'node_1'
    await flushAsyncWork()

    const event = new KeyboardEvent('keydown', {
      key: 's',
      ctrlKey: true,
      cancelable: true,
    })

    window.dispatchEvent(event)
    await flushAsyncWork()

    expect(event.defaultPrevented).toBe(false)
    expect(saveSpy).not.toHaveBeenCalled()
  })

  it('does not route Ctrl+Z to canvas undo when node config is open', async () => {
    const store = useWorkflowStore()
    const undoSpy = vi.spyOn(store, 'undoCanvasChange').mockReturnValue(true)
    findNode.mockReturnValue({ id: 'node_1' })
    store.nodes = [
      {
        id: 'node_1',
        type: 'custom',
        position: { x: 0, y: 0 },
        label: '数据清洗',
        data: {
          label: '数据清洗',
          type: 'data-cleaning',
          category: 'action',
          status: 'idle',
          config: {},
          logs: [],
          useManualInput: false,
          manualInput: '',
          isPinned: false,
        },
      } as any,
    ]

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
          WorkflowResultDashboardModal: { template: '<div />' },
          WorkflowManagerModal: workflowManagerModalStub,
          UnsavedWorkflowDialog: { template: '<div />' },
          HelpCenterModal: { template: '<div />' },
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

    store.activeConfigNodeId = 'node_1'
    await flushAsyncWork()

    const event = new KeyboardEvent('keydown', {
      key: 'z',
      code: 'KeyZ',
      ctrlKey: true,
      cancelable: true,
    })

    window.dispatchEvent(event)
    await flushAsyncWork()

    expect(event.defaultPrevented).toBe(false)
    expect(undoSpy).not.toHaveBeenCalled()
  })

  it('renders readable chinese copy in history mode', () => {
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
          WorkflowResultDashboardModal: { template: '<div />' },
          WorkflowManagerModal: workflowManagerModalStub,
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

    const text = wrapper.text()
    expect(text).toContain('历史记录查看模式')
    expect(text).toContain('返回编辑模式')
    expect(text).not.toContain('鍘')
    expect(text).not.toContain('杩')
  })

  it('renders compact shortcut help copy in the canvas corner', () => {
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
          WorkflowResultDashboardModal: { template: '<div />' },
          WorkflowManagerModal: workflowManagerModalStub,
          UnsavedWorkflowDialog: { template: '<div />' },
          HelpCenterModal: { template: '<div />' },
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

    const text = wrapper.text()
    expect(text).toContain('Ctrl+单击')
    expect(text).toContain('Ctrl+拖拽')
    expect(text).toContain('Ctrl+C')
    expect(text).toContain('Ctrl+D')
    expect(text).toContain('Ctrl+Z')
    expect(text).toContain('Ctrl+Y')
    expect(text).toContain('Ctrl+Del')
    expect(text).toContain('双击节点')
    expect(wrapper.get('[data-testid="canvas-shortcuts-card"]').attributes('style')).toContain('364px')
  })

  it('collapses the shortcut help card into a single icon button', async () => {
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
          WorkflowResultDashboardModal: { template: '<div />' },
          WorkflowManagerModal: workflowManagerModalStub,
          UnsavedWorkflowDialog: { template: '<div />' },
          HelpCenterModal: { template: '<div />' },
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

    await wrapper.get('[data-testid="canvas-shortcuts-collapse"]').trigger('click')

    expect(wrapper.find('[data-testid="canvas-shortcuts-collapse"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="canvas-shortcuts-toggle"]').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('Ctrl+单击')
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
          WorkflowResultDashboardModal: { template: '<div />' },
          WorkflowManagerModal: workflowManagerModalStub,
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

  it('cancels pending execution after runtime input modal close', async () => {
    const store = useWorkflowStore()
    const cancelSpy = vi.spyOn(store, 'cancelPendingExecution').mockImplementation(() => undefined)
    store.pendingExecution = { nodeId: 'node_1', forceUpdate: true, executionScope: 'global' }
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
          WorkflowResultDashboardModal: { template: '<div />' },
          WorkflowManagerModal: workflowManagerModalStub,
          UnsavedWorkflowDialog: { template: '<div />' },
          HelpCenterModal: { template: '<div />' },
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

    wrapper.findComponent({ name: 'RuntimeInputModal' }).vm.$emit('close')
    await wrapper.vm.$nextTick()

    expect(cancelSpy).toHaveBeenCalledTimes(1)
  })

  it('shows a standalone result preview dialog for the active preview node', async () => {
    const store = useWorkflowStore()
    store.nodes = [
      {
        id: 'node_1',
        type: 'custom',
        position: { x: 0, y: 0 },
        label: 'Pearson 分析',
        data: {
          label: 'Pearson 分析',
          type: 'pearson',
          category: 'terminal',
          status: 'success',
          config: {},
          logs: [],
          useManualInput: false,
          manualInput: '',
          isPinned: false,
          output: {
            kind: 'report',
            payload: {
              summary: '完成',
              sections: [],
            },
          },
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
          DataAnalysisModal: dataAnalysisModalStub,
          RuntimeInputModal: runtimeInputModalStub,
          WorkflowResultDashboardModal: { template: '<div />' },
          WorkflowManagerModal: workflowManagerModalStub,
          UnsavedWorkflowDialog: { template: '<div />' },
          HelpCenterModal: { template: '<div />' },
          ConfirmDialog: { template: '<div />' },
          Toast: toastStub,
          Button: { template: '<button><slot /></button>' },
          N8nEdge: { template: '<div />' },
        },
        directives: {
          tooltip: () => undefined,
        },
      },
    })

    store.activePreviewNodeId = 'node_1'
    await flushAsyncWork()

    const modal = wrapper.get('.data-analysis-modal-stub')
    expect(modal.attributes('data-visible')).toBe('true')
    expect(modal.attributes('data-storage-scope-key')).toBe('node_1')
    expect(modal.text()).toContain('Pearson 分析')
  })

  it('opens the result dashboard when a run dashboard summary is published', async () => {
    const store = useWorkflowStore()
    store.nodes = [
      {
        id: 'terminal_1',
        type: 'custom',
        position: { x: 0, y: 0 },
        label: '相关性分析',
        data: {
          label: '相关性分析',
          type: 'pearson',
          category: 'terminal',
          status: 'success',
          config: {},
          logs: [],
          output: {
            kind: 'report',
            payload: { title: '相关性结果', sections: [] },
            preview: { viewer: 'report-viewer' },
          },
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
          WorkflowResultDashboardModal: workflowResultDashboardModalStub,
          WorkflowManagerModal: workflowManagerModalStub,
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

    store.lastRunDashboard = {
      id: 'run_1',
      workflowName: '测试工作流',
      status: 'success',
      startTime: Date.now(),
      duration: 1000,
      executionTargetIds: ['terminal_1'],
      executionScopeNodeIds: ['terminal_1'],
      terminalNodeIds: ['terminal_1'],
    }

    await flushAsyncWork()

    const dashboardModal = wrapper.findComponent(workflowResultDashboardModalStub)
    expect(dashboardModal.exists()).toBe(true)
    expect(dashboardModal.attributes('data-visible')).toBe('true')
    expect(dashboardModal.text()).toContain('测试工作流')
  })

  it('does not open the result dashboard when no run dashboard summary is published after cancelling input', async () => {
    const store = useWorkflowStore()
    store.pendingExecution = { nodeId: 'node_1', forceUpdate: true, executionScope: 'global' }
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
          WorkflowResultDashboardModal: workflowResultDashboardModalStub,
          WorkflowManagerModal: workflowManagerModalStub,
          UnsavedWorkflowDialog: { template: '<div />' },
          HelpCenterModal: { template: '<div />' },
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

    wrapper.findComponent({ name: 'RuntimeInputModal' }).vm.$emit('close')
    await flushAsyncWork()

    const dashboardModal = wrapper.findComponent(workflowResultDashboardModalStub)
    expect(dashboardModal.attributes('data-visible')).toBe('false')
  })

  it('再次开始 AI 分析时复用已有 notebook runtime', async () => {
    const store = useWorkflowStore()
    const httpPostSpy = vi.spyOn(httpClient, 'post')
    httpPostSpy
      .mockResolvedValueOnce({
        status: 200,
        data: { sessionId: 'sess-1' },
      } as never)
      .mockResolvedValueOnce({
        status: 200,
        data: { sessionId: 'sess-2' },
      } as never)

    store.nodes = [
      {
        id: 'node_1',
        type: 'custom',
        position: { x: 0, y: 0 },
        label: '清洗结果',
        data: {
          label: '清洗结果',
          type: 'data-cleaning',
          category: 'action',
          status: 'success',
          config: {},
          logs: [],
          useManualInput: false,
          manualInput: '',
          isPinned: false,
          output: {
            kind: 'table',
            payload: [{ a: 1, b: 2 }],
          },
        },
      } as any,
    ]

    const workflowHeaderStub = defineComponent({
      name: 'WorkflowHeader',
      emits: ['start-notebook'],
      template:
        '<div><button data-testid="start-notebook" @click="$emit(\'start-notebook\', { id: \'node_1\', kind: \'canvas-node\', label: \'清洗结果\', rowCount: 1, columnCount: 2 })">start</button></div>',
    })

    const wrapper = mount(WorkflowCanvas, {
      global: {
        stubs: {
          Background: { template: '<div />' },
          Controls: { template: '<div />' },
          NodeSidebar: { template: '<div />' },
          WorkflowHeader: workflowHeaderStub,
          NotebookFrame: notebookFrameStub,
          BaseNode: { template: '<div />' },
          LogPanel: { template: '<div />' },
          NodeConfigModal: { template: '<div />' },
          RuntimeInputModal: runtimeInputModalStub,
          WorkflowResultDashboardModal: workflowResultDashboardModalStub,
          WorkflowManagerModal: workflowManagerModalStub,
          UnsavedWorkflowDialog: { template: '<div />' },
          HelpCenterModal: { template: '<div />' },
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

    await wrapper.get('[data-testid="start-notebook"]').trigger('click')
    await flushAsyncWork()
    expect(wrapper.find('.notebook-frame-stub').attributes('data-session-id')).toBe('sess-1')

    await wrapper.get('[data-testid="start-notebook"]').trigger('click')
    await flushAsyncWork()

    expect(notebookFrameSwitchSessionMock).toHaveBeenCalledWith('sess-2', expect.any(Object))
    expect(wrapper.find('.notebook-frame-stub').attributes('data-session-id')).toBe('sess-2')
  })

  it('clears the result dashboard summary after switching to a new workflow without running it', async () => {
    const store = useWorkflowStore()
    store.nodes = [
      {
        id: 'terminal_1',
        type: 'custom',
        position: { x: 0, y: 0 },
        label: '相关性分析',
        data: {
          label: '相关性分析',
          type: 'pearson',
          category: 'terminal',
          status: 'success',
          config: {},
          logs: [],
          output: {
            kind: 'report',
            payload: { title: '相关性结果', sections: [] },
            preview: { viewer: 'report-viewer' },
          },
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
          WorkflowResultDashboardModal: workflowResultDashboardModalStub,
          WorkflowManagerModal: workflowManagerModalStub,
          WorkflowFloatingControls: {
            props: ['hasResultDashboard'],
            template: '<div class="floating-controls-stub" :data-has-result-dashboard="hasResultDashboard"></div>',
          },
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

    store.lastRunDashboard = {
      id: 'run_1',
      workflowName: '测试工作流',
      status: 'success',
      startTime: Date.now(),
      duration: 1000,
      executionTargetIds: ['terminal_1'],
      executionScopeNodeIds: ['terminal_1'],
      terminalNodeIds: ['terminal_1'],
    }

    await flushAsyncWork()

    expect(wrapper.find('.floating-controls-stub').attributes('data-has-result-dashboard')).toBe('true')

    store.createNewWorkflow()
    await flushAsyncWork()

    expect(wrapper.find('.floating-controls-stub').attributes('data-has-result-dashboard')).toBe('false')
    const dashboardModal = wrapper.findComponent(workflowResultDashboardModalStub)
    expect(dashboardModal.attributes('data-visible')).toBe('false')
    expect(dashboardModal.text()).not.toContain('测试工作流')
  })

  it('shows result dashboard entry and summary in history mode', async () => {
    const store = useWorkflowStore()
    store.nodes = [
      {
        id: 'terminal_1',
        type: 'custom',
        position: { x: 0, y: 0 },
        label: '相关性分析',
        data: {
          label: '相关性分析',
          type: 'pearson',
          category: 'terminal',
          status: 'success',
          config: {},
          logs: [],
          output: {
            kind: 'report',
            payload: { title: '历史相关性结果', sections: [] },
            preview: { viewer: 'report-viewer' },
          },
        },
      } as any,
    ]

    store.executionHistory = [
      {
        id: 'exec_history_1',
        workflowId: 'wf_1',
        workflowName: '历史工作流',
        startTime: Date.now(),
        duration: 800,
        status: 'success',
        nodes: [
          {
            id: 'terminal_1',
            type: 'custom',
            position: { x: 0, y: 0 },
            label: '相关性分析',
            data: {
              label: '相关性分析',
              type: 'pearson',
              category: 'terminal',
              status: 'success',
              config: {},
              logs: [],
              output: {
                kind: 'report',
                payload: { title: '历史相关性结果', sections: [] },
                preview: { viewer: 'report-viewer' },
              },
              useManualInput: false,
              manualInput: '',
              isPinned: false,
            },
          },
        ],
        edges: [],
      },
    ] as any

    await store.enterHistoryMode('exec_history_1')

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
          WorkflowResultDashboardModal: workflowResultDashboardModalStub,
          WorkflowManagerModal: workflowManagerModalStub,
          WorkflowFloatingControls: {
            props: ['visible', 'hasResultDashboard'],
            template:
              '<div class="floating-controls-stub" :data-visible="visible" :data-has-result-dashboard="hasResultDashboard"></div>',
          },
          UnsavedWorkflowDialog: { template: '<div />' },
          HelpCenterModal: { template: '<div />' },
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

    await flushAsyncWork()

    expect(wrapper.find('.floating-controls-stub').attributes('data-visible')).toBe('true')
    expect(wrapper.find('.floating-controls-stub').attributes('data-has-result-dashboard')).toBe('true')

    const dashboardModal = wrapper.findComponent(workflowResultDashboardModalStub)
    expect(dashboardModal.attributes('data-visible')).toBe('true')
    expect(dashboardModal.text()).toContain('历史工作流')
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
          WorkflowResultDashboardModal: { template: '<div />' },
          WorkflowManagerModal: workflowManagerModalStub,
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

  it('renders the global run button with a title and helper copy', () => {
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
          WorkflowResultDashboardModal: { template: '<div />' },
          WorkflowManagerModal: workflowManagerModalStub,
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

    const text = wrapper.text()
    expect(text).toContain('开始运行工作流')
    expect(text).toContain('从触发节点启动整条工作流链路')
  })

  it('uses native buttons for the run bar and keeps the idle state visually neutral', () => {
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
          WorkflowResultDashboardModal: { template: '<div />' },
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

    const runShell = wrapper.find('.workflow-run-shell')
    const runButton = wrapper.find('button.workflow-run-bar')

    expect(runShell.exists()).toBe(true)
    expect(runButton.exists()).toBe(true)
    expect(runShell.classes()).toContain('workflow-run-shell--idle')
    expect(runButton.classes()).toContain('workflow-run-bar--idle')
  })

  it('keeps the execution record full-width while reserving space internally for the visible node sidebar', () => {
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
          WorkflowResultDashboardModal: { template: '<div />' },
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

    const footer = wrapper.find('footer')
    const header = wrapper.get('[data-testid="execution-record-header"]')

    expect(footer.exists()).toBe(true)
    expect(footer.attributes('style')).toContain('right: 0px;')
    expect(footer.classes()).toContain('z-[80]')
    expect(header.attributes('style')).toContain('padding-right: 364px;')
  })

  it('shifts the fitted viewport left by half the sidebar width after workflow load', async () => {
    const store = useWorkflowStore()
    store.addAndConnectNode('manual-json-import', '手动输入数据', { x: 0, y: 0 })

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
          WorkflowResultDashboardModal: { template: '<div />' },
          WorkflowManagerModal: workflowManagerModalStub,
          UnsavedWorkflowDialog: { template: '<div />' },
          HelpCenterModal: { template: '<div />' },
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

    await flushAsyncWork()
    await flushAsyncWork()

    expect(fitView).toHaveBeenCalled()
    expect(fitView).toHaveBeenCalledWith({ padding: 0.2, duration: 0 })
    expect(setViewport).toHaveBeenNthCalledWith(
      1,
      {
        x: 500,
        y: 120,
        zoom: 1,
      },
      { duration: 0 },
    )
    expect(setViewport).toHaveBeenCalledWith(
      {
        x: 330,
        y: 120,
        zoom: 1,
      },
      { duration: 800 },
    )
  })

  it('loads the first workflow from the manager and resets the viewport once after the modal closes', async () => {
    const store = useWorkflowStore()
    store.addAndConnectNode('manual-json-import', '手动输入数据', { x: 0, y: 0 })
    const saved = await store.saveWorkflow('首次打开复位')
    store.createNewWorkflow()

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
          WorkflowResultDashboardModal: { template: '<div />' },
          WorkflowManagerModal: workflowManagerModalStub,
          UnsavedWorkflowDialog: { template: '<div />' },
          HelpCenterModal: { template: '<div />' },
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

    await flushAsyncWork()
    await flushAsyncWork()

    expect(fitView).not.toHaveBeenCalled()

    wrapper.findComponent(workflowManagerModalStub).vm.$emit('load-workflow', saved.id)
    await flushAsyncWork()
    await flushAsyncWork()
    await flushAsyncWork()

    expect(fitView).toHaveBeenCalledTimes(1)
    expect(setViewport).toHaveBeenCalledTimes(2)
    expect(setViewport).toHaveBeenNthCalledWith(
      1,
      {
        x: 500,
        y: 120,
        zoom: 1,
      },
      { duration: 0 },
    )
    expect(setViewport).toHaveBeenNthCalledWith(
      2,
      {
        x: 330,
        y: 120,
        zoom: 1,
      },
      { duration: 800 },
    )
  })

  it('keeps the single-canvas layout before the pi agent panel is opened', async () => {
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
          WorkflowResultDashboardModal: { template: '<div />' },
          WorkflowManagerModal: workflowManagerModalStub,
          UnsavedWorkflowDialog: { template: '<div />' },
          HelpCenterModal: { template: '<div />' },
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

    const piAgentPanel = wrapper.findComponent({ name: 'PiAgentPanel' })
    expect(piAgentPanel.exists()).toBe(false)
    expect(wrapper.find('.workflow-workspace').classes()).not.toContain('workflow-workspace--agent')
    expect(wrapper.find('.workflow-page-sidebar').exists()).toBe(true)
  })

  it('opens the pi agent panel from the header action entry', async () => {
    const workflowHeaderStub = defineComponent({
      name: 'WorkflowHeader',
      emits: ['toggle-ai'],
      template:
        '<button data-testid="workflow-header-ai-toggle" @click="$emit(\'toggle-ai\')">分析代理</button>',
    })

    const wrapper = mount(WorkflowCanvas, {
      global: {
        stubs: {
          Background: { template: '<div />' },
          Controls: { template: '<div />' },
          NodeSidebar: { template: '<div />' },
          WorkflowHeader: workflowHeaderStub,
          BaseNode: { template: '<div />' },
          LogPanel: { template: '<div />' },
          NodeConfigModal: { template: '<div />' },
          RuntimeInputModal: runtimeInputModalStub,
          WorkflowResultDashboardModal: { template: '<div />' },
          WorkflowManagerModal: workflowManagerModalStub,
          UnsavedWorkflowDialog: { template: '<div />' },
          HelpCenterModal: { template: '<div />' },
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

    expect(wrapper.findComponent({ name: 'PiAgentPanel' }).exists()).toBe(false)

    await wrapper.find('[data-testid="workflow-header-ai-toggle"]').trigger('click')

    expect(wrapper.findComponent({ name: 'PiAgentPanel' }).exists()).toBe(true)
    expect(wrapper.text()).not.toContain('执行工作区')
    expect(wrapper.find('.workflow-workspace').classes()).toContain('workflow-workspace--agent')
    expect(wrapper.find('.workflow-page-sidebar').exists()).toBe(true)
  })

  it('supports dragging the pi agent divider to resize the desktop panel width', async () => {
    const originalInnerWidth = window.innerWidth
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      writable: true,
      value: 1600,
    })

    const workflowHeaderStub = defineComponent({
      name: 'WorkflowHeader',
      emits: ['toggle-ai'],
      template:
        '<button data-testid="workflow-header-ai-toggle" @click="$emit(\'toggle-ai\')">分析代理</button>',
    })

    const wrapper = mount(WorkflowCanvas, {
      global: {
        stubs: {
          Background: { template: '<div />' },
          Controls: { template: '<div />' },
          NodeSidebar: { template: '<div />' },
          WorkflowHeader: workflowHeaderStub,
          BaseNode: { template: '<div />' },
          LogPanel: { template: '<div />' },
          NodeConfigModal: { template: '<div />' },
          RuntimeInputModal: runtimeInputModalStub,
          WorkflowResultDashboardModal: { template: '<div />' },
          WorkflowManagerModal: workflowManagerModalStub,
          UnsavedWorkflowDialog: { template: '<div />' },
          HelpCenterModal: { template: '<div />' },
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

    try {
      await wrapper.get('[data-testid="workflow-header-ai-toggle"]').trigger('click')

      const workspace = wrapper.get('.workflow-workspace')
      const resizeHandle = wrapper.get('[data-testid="pi-agent-resize-handle"]')

      expect(workspace.attributes('style')).toContain('grid-template-columns: 480px 12px minmax(0, 1fr);')

      await resizeHandle.trigger('mousedown', { clientX: 200 })
      document.dispatchEvent(new MouseEvent('mousemove', { clientX: 320 }))
      document.dispatchEvent(new MouseEvent('mouseup'))
      await flushAsyncWork()

      expect(workspace.attributes('style')).toContain('grid-template-columns: 600px 12px minmax(0, 1fr);')
    } finally {
      Object.defineProperty(window, 'innerWidth', {
        configurable: true,
        writable: true,
        value: originalInnerWidth,
      })
    }
  })

  it('keeps the canvas-only right workspace after opening the agent panel', async () => {
    const workflowHeaderStub = defineComponent({
      name: 'WorkflowHeader',
      emits: ['toggle-ai'],
      template:
        '<button data-testid="workflow-header-ai-toggle" @click="$emit(\'toggle-ai\')">分析代理</button>',
    })

    const wrapper = mount(WorkflowCanvas, {
      global: {
        stubs: {
          Background: { template: '<div />' },
          Controls: { template: '<div />' },
          NodeSidebar: { template: '<div />' },
          WorkflowHeader: workflowHeaderStub,
          BaseNode: { template: '<div />' },
          LogPanel: { template: '<div />' },
          NodeConfigModal: { template: '<div />' },
          RuntimeInputModal: runtimeInputModalStub,
          WorkflowResultDashboardModal: workflowResultDashboardModalStub,
          WorkflowManagerModal: workflowManagerModalStub,
          UnsavedWorkflowDialog: { template: '<div />' },
          HelpCenterModal: { template: '<div />' },
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

    await wrapper.get('[data-testid="workflow-header-ai-toggle"]').trigger('click')

    expect(wrapper.text()).not.toContain('执行工作区')
    expect(wrapper.find('.execution-workspace__header').exists()).toBe(false)
    expect(wrapper.findComponent({ name: 'VueFlow' }).exists()).toBe(true)
    expect(wrapper.find('.workflow-page-sidebar').exists()).toBe(true)
  })

  it('mounts a dedicated bottom-left toast for node config feedback', () => {
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
          WorkflowResultDashboardModal: workflowResultDashboardModalStub,
          WorkflowManagerModal: workflowManagerModalStub,
          UnsavedWorkflowDialog: { template: '<div />' },
          HelpCenterModal: { template: '<div />' },
          ConfirmDialog: { template: '<div />' },
          Toast: toastStub,
          Button: { template: '<button><slot /></button>' },
          N8nEdge: { template: '<div />' },
        },
        directives: {
          tooltip: () => undefined,
        },
      },
    })

    const toasts = wrapper.findAll('.toast-stub')

    expect(toasts).toHaveLength(2)
    expect(toasts[0]?.attributes('data-group')).toBe('default')
    expect(toasts[0]?.attributes('data-position')).toBe('top-right')
    expect(toasts[1]?.attributes('data-group')).toBe('node-config')
    expect(toasts[1]?.attributes('data-position')).toBe('bottom-left')
  })

  it('defers unsaved recalculation during dragging and refreshes it after drag stop', async () => {
    const store = useWorkflowStore()
    store.nodes = [
      {
        id: 'node_1',
        type: 'custom',
        position: { x: 0, y: 0 },
        label: '导入数据',
        data: {
          label: '导入数据',
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

    const nodeChangeSpy = vi.spyOn(store, 'handleNodeChangesForUnsavedState')
    const dragStopSpy = vi.spyOn(store, 'handleNodeDragStopForUnsavedState')

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
          WorkflowResultDashboardModal: { template: '<div />' },
          WorkflowManagerModal: workflowManagerModalStub,
          UnsavedWorkflowDialog: { template: '<div />' },
          HelpCenterModal: { template: '<div />' },
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

    const vueFlow = wrapper.findComponent({ name: 'VueFlow' })

    await vueFlow.vm.$emit('nodesChange', [
      {
        id: 'node_1',
        type: 'position',
        position: { x: 120, y: 48 },
        from: { x: 0, y: 0 },
        dragging: true,
      },
    ])
    await vueFlow.vm.$emit('nodeDragStop', {
      node: { id: 'node_1' },
    })

    expect(nodeChangeSpy).toHaveBeenCalledWith([
      expect.objectContaining({
        id: 'node_1',
        type: 'position',
        dragging: true,
      }),
    ])
    expect(dragStopSpy).toHaveBeenCalledWith('node_1')
  })
})




