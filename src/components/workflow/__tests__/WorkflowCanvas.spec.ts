import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent } from 'vue'
import WorkflowCanvas from '../WorkflowCanvas.vue'
import { useWorkflowStore } from '@/stores/workflowStore'
import { useWorkflowAiStore } from '@/stores/workflowAiStore'

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
const workflowAiPanelStub = defineComponent({
  name: 'WorkflowAiPanel',
  props: {
    visible: Boolean,
  },
  template: '<div class="workflow-ai-panel-stub" :data-visible="visible"></div>',
})

const agentWorkspaceStub = defineComponent({
  name: 'AgentWorkspace',
  props: {
    visible: Boolean,
  },
  template: '<div class="agent-workspace-stub" :data-visible="visible"></div>',
})

vi.mock('../WorkflowAiPanel.vue', () => ({
  default: {
    name: 'WorkflowAiPanel',
    props: ['visible'],
    template: '<div class="workflow-ai-panel-stub" :data-visible="visible"></div>',
  },
}))

vi.mock('../agent/AgentWorkspace.vue', () => ({
  default: {
    name: 'AgentWorkspace',
    props: ['visible'],
    template: '<div class="agent-workspace-stub" :data-visible="visible"></div>',
  },
}))

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
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0)
      return 1
    })
    fitView.mockResolvedValue(true)
    setViewport.mockResolvedValue(true)
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

    store.enterHistoryMode('exec_history_1')

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

  it('keeps the legacy single-canvas layout before the agent workspace is opened', async () => {
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

    const agentWorkspace = wrapper.findComponent({ name: 'AgentWorkspace' })
    expect(agentWorkspace.exists()).toBe(true)
    expect(agentWorkspace.attributes('data-visible')).toBe('false')
    expect(wrapper.find('.workflow-workspace').classes()).not.toContain('workflow-workspace--agent')
    expect(wrapper.find('.execution-canvas-shell__sidebar').exists()).toBe(true)
  })

  it('collapses the agent workspace from the header action entry', async () => {
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

    expect(wrapper.findComponent({ name: 'AgentWorkspace' }).attributes('data-visible')).toBe('false')

    await wrapper.find('[data-testid="workflow-header-ai-toggle"]').trigger('click')

    expect(wrapper.findComponent({ name: 'AgentWorkspace' }).attributes('data-visible')).toBe('true')
    expect(wrapper.text()).not.toContain('执行工作区')
    expect(wrapper.find('.workflow-workspace').classes()).toContain('workflow-workspace--agent')
    expect(wrapper.find('.execution-canvas-shell__sidebar').exists()).toBe(true)
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
          AgentWorkspace: agentWorkspaceStub,
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
    expect(wrapper.find('.execution-canvas-shell__sidebar').exists()).toBe(true)
  })

  it('shows an execution workspace banner while agent loop is running and after auto-apply completes', async () => {
    const aiStore = useWorkflowAiStore()
    aiStore.agentLoopRunning = true
    aiStore.streamHeadline = '正在执行节点：Pearson 相关系数'
    aiStore.agentLoopOutput = {
      iterations: [
        {
          iteration: 1,
          plan: {
            summary: '先做相关性分析',
            assumptions: [],
            warnings: [],
            questions: [],
            operations: [],
          },
          executionResults: [],
          interpretation: null,
        },
      ],
      conclusion: {
        summary: '价格和折扣对销量影响最明显',
        findings: [],
        recommendations: [],
        caveats: [],
      },
      totalDurationMs: 1800,
      totalIterations: 1,
    }
    aiStore.lastAppliedSnapshotId = 'snapshot_1'

    const wrapper = mount(WorkflowCanvas, {
      global: {
        stubs: {
          Background: { template: '<div />' },
          Controls: { template: '<div />' },
          NodeSidebar: { template: '<div />' },
          WorkflowHeader: { template: '<div />' },
          AgentWorkspace: agentWorkspaceStub,
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

    expect(wrapper.get('[data-testid="execution-workspace-banner"]').text()).toContain('正在执行节点：Pearson 相关系数')
    expect(wrapper.get('[data-testid="execution-workspace-banner"]').text()).toContain('已自动同步到画布')
  })
})




