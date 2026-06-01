import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import PrimeVue from 'primevue/config'
import { Position } from '@vue-flow/core'
import BaseNode from '../nodes/BaseNode.vue'
import { useWorkflowStore } from '@/stores/workflowStore'
import { nodeDefinitions } from '@/nodes/registry'

describe('BaseNode', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('shows a multiple-input badge for multi-input nodes', () => {
    const store = useWorkflowStore()
    store.nodes = [
      {
        id: 'data-merge-node',
        type: 'custom',
        position: { x: 0, y: 0 },
        label: '数据合并',
        data: {
          label: '数据合并',
          type: 'data-merge',
          category: 'action',
          status: 'idle',
          config: { mergeMode: 'append' },
          logs: [],
          useManualInput: false,
          manualInput: '',
          isPinned: false,
        },
      } as any,
    ]

    const wrapper = mount(BaseNode, {
      props: {
        id: 'data-merge-node',
        type: 'custom',
        selected: false,
        dragging: false,
        connectable: true,
        resizing: false,
        position: { x: 0, y: 0 },
        dimensions: { width: 110, height: 110 },
        isValidTargetPos: () => true,
        isValidSourcePos: () => true,
        zIndex: 1,
        targetPosition: Position.Left,
        sourcePosition: Position.Right,
        data: store.nodes[0]!.data,
        events: {} as any,
      } as any,
      global: {
        plugins: [PrimeVue],
        directives: { tooltip: () => undefined },
        stubs: {
          Handle: { template: '<div />' },
          NodeToolbar: { template: '<div><slot /></div>' },
          NodeIcon: { template: '<div>ICON</div>' },
        },
      },
    })

    expect(wrapper.text()).toContain('多输入')
  })

  it('shows separate debug actions for cache reuse and upstream rerun', () => {
    const store = useWorkflowStore()
    store.nodes = [
      {
        id: 'data-cleaning-node',
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

    const executeSpy = vi.spyOn(store, 'executeNode').mockResolvedValue(null as any)

    const wrapper = mount(BaseNode, {
      props: {
        id: 'data-cleaning-node',
        type: 'custom',
        selected: false,
        dragging: false,
        connectable: true,
        resizing: false,
        position: { x: 0, y: 0 },
        dimensions: { width: 110, height: 110 },
        isValidTargetPos: () => true,
        isValidSourcePos: () => true,
        zIndex: 1,
        targetPosition: Position.Left,
        sourcePosition: Position.Right,
        data: store.nodes[0]!.data,
        events: {} as any,
      } as any,
      global: {
        plugins: [PrimeVue],
        directives: { tooltip: () => undefined },
        stubs: {
          Handle: { template: '<div />' },
          NodeToolbar: { template: '<div><slot /></div>' },
          NodeIcon: { template: '<div>ICON</div>' },
        },
      },
    })

    wrapper.vm.$el.dispatchEvent(new MouseEvent('mouseenter'))

    const buttons = wrapper.findAll('button')
    const cacheDebugButton = buttons.find((button) => button.attributes('data-testid') === 'debug-node-button')
    const rerunDebugButton = buttons.find((button) => button.attributes('data-testid') === 'debug-node-rerun-button')

    expect(cacheDebugButton).toBeTruthy()
    expect(rerunDebugButton).toBeTruthy()

    cacheDebugButton!.trigger('click')
    rerunDebugButton!.trigger('click')

    expect(executeSpy).toHaveBeenNthCalledWith(1, 'data-cleaning-node', true, 'single', {
      rerunUpstream: false,
    })
    expect(executeSpy).toHaveBeenNthCalledWith(2, 'data-cleaning-node', true, 'single', {
      rerunUpstream: true,
    })
  })

  it('shows a stop action and disables debug buttons while the current node debug run is active', async () => {
    const store = useWorkflowStore()
    store.nodes = [
      {
        id: 'data-cleaning-node',
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
    store.isRunning = true
    ;(store as any).activeExecutionScope = 'single'
    ;(store as any).activeExecutionNodeId = 'data-cleaning-node'

    const stopSpy = vi.spyOn(store, 'stopExecution').mockImplementation(() => undefined)

    const wrapper = mount(BaseNode, {
      props: {
        id: 'data-cleaning-node',
        type: 'custom',
        selected: false,
        dragging: false,
        connectable: true,
        resizing: false,
        position: { x: 0, y: 0 },
        dimensions: { width: 110, height: 110 },
        isValidTargetPos: () => true,
        isValidSourcePos: () => true,
        zIndex: 1,
        targetPosition: Position.Left,
        sourcePosition: Position.Right,
        data: store.nodes[0]!.data,
        events: {} as any,
      } as any,
      global: {
        plugins: [PrimeVue],
        directives: { tooltip: () => undefined },
        stubs: {
          Handle: { template: '<div />' },
          NodeToolbar: { template: '<div><slot /></div>' },
          NodeIcon: { template: '<div>ICON</div>' },
        },
      },
    })

    wrapper.vm.$el.dispatchEvent(new MouseEvent('mouseenter'))

    const debugButton = wrapper.get('[data-testid="debug-node-button"]')
    const rerunButton = wrapper.get('[data-testid="debug-node-rerun-button"]')
    const stopButton = wrapper.get('[data-testid="debug-node-stop-button"]')

    expect(debugButton.attributes('disabled')).toBeDefined()
    expect(rerunButton.attributes('disabled')).toBeDefined()
    expect(stopButton).toBeTruthy()

    await stopButton.trigger('click')

    expect(stopSpy).toHaveBeenCalledTimes(1)
  })

  it('shows a loading debug state after clicking a synchronous node debug action', async () => {
    const syncNodeDefinition = {
      name: 'test-sync-debug-node',
      displayName: '同步调试节点',
      icon: 'zap',
      category: 'action' as const,
      description: 'test',
      properties: [],
      execute: () => ({ kind: 'json' as const, payload: { ok: true } }),
    }

    nodeDefinitions.push(syncNodeDefinition)

    const originalRequestAnimationFrame = globalThis.requestAnimationFrame
    const scheduledPaintCallbacks: Array<() => void> = []

    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn((callback: FrameRequestCallback) => {
        scheduledPaintCallbacks.push(() => callback(16))
        return 1
      }),
    )

    try {
      const store = useWorkflowStore()
      store.nodes = [
        {
          id: 'sync-debug-node',
          type: 'custom',
          position: { x: 0, y: 0 },
          label: '同步调试节点',
          data: {
            label: '同步调试节点',
            type: 'test-sync-debug-node',
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

      const wrapper = mount(BaseNode, {
        props: {
          id: 'sync-debug-node',
          type: 'custom',
          selected: false,
          dragging: false,
          connectable: true,
          resizing: false,
          position: { x: 0, y: 0 },
          dimensions: { width: 110, height: 110 },
          isValidTargetPos: () => true,
          isValidSourcePos: () => true,
          zIndex: 1,
          targetPosition: Position.Left,
          sourcePosition: Position.Right,
          data: store.nodes[0]!.data,
          events: {} as any,
        } as any,
        global: {
          plugins: [PrimeVue],
          directives: { tooltip: () => undefined },
          stubs: {
            Handle: { template: '<div />' },
            NodeToolbar: { template: '<div><slot /></div>' },
            NodeIcon: { template: '<div>ICON</div>' },
          },
        },
      })

      wrapper.vm.$el.dispatchEvent(new MouseEvent('mouseenter'))
      await wrapper.get('[data-testid="debug-node-button"]').trigger('click')
      await wrapper.vm.$nextTick()

      const debugButton = wrapper.get('[data-testid="debug-node-button"]')
      const rerunButton = wrapper.get('[data-testid="debug-node-rerun-button"]')

      expect(debugButton.attributes('disabled')).toBeDefined()
      expect(rerunButton.attributes('disabled')).toBeDefined()
      expect(wrapper.html()).toContain('animate-spin')

      scheduledPaintCallbacks[0]?.()
      await Promise.resolve()
      await wrapper.vm.$nextTick()
    } finally {
      const index = nodeDefinitions.findIndex((definition) => definition.name === 'test-sync-debug-node')
      if (index >= 0) nodeDefinitions.splice(index, 1)

      if (originalRequestAnimationFrame) {
        vi.stubGlobal('requestAnimationFrame', originalRequestAnimationFrame)
      } else {
        vi.unstubAllGlobals()
      }
    }
  })

  it('opens result preview from the hover toolbox when the node already has output', async () => {
    const store = useWorkflowStore()
    store.nodes = [
      {
        id: 'pearson-node',
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
        },
      } as any,
    ]
    store.setNodeRuntime('pearson-node', {
      output: {
        kind: 'report',
        payload: {
          summary: '分析完成',
          sections: [],
        },
      } as any,
    })

    const wrapper = mount(BaseNode, {
      props: {
        id: 'pearson-node',
        type: 'custom',
        selected: false,
        dragging: false,
        connectable: true,
        resizing: false,
        position: { x: 0, y: 0 },
        dimensions: { width: 110, height: 110 },
        isValidTargetPos: () => true,
        isValidSourcePos: () => true,
        zIndex: 1,
        targetPosition: Position.Left,
        sourcePosition: Position.Right,
        data: store.nodes[0]!.data,
        events: {} as any,
      } as any,
      global: {
        plugins: [PrimeVue],
        directives: { tooltip: () => undefined },
        stubs: {
          Handle: { template: '<div />' },
          NodeToolbar: { template: '<div><slot /></div>' },
          NodeIcon: { template: '<div>ICON</div>' },
        },
      },
    })

    wrapper.vm.$el.dispatchEvent(new MouseEvent('mouseenter'))

    await wrapper.get('[data-testid="preview-node-button"]').trigger('click')

    expect(store.activePreviewNodeId).toBe('pearson-node')
  })

  it('opens result preview when runtime output exists outside canvas node data', async () => {
    const store = useWorkflowStore()
    store.nodes = [
      {
        id: 'pearson-node',
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
        },
      } as any,
    ]
    ;(store as any).setNodeRuntime('pearson-node', {
      output: {
        kind: 'report',
        payload: {
          summary: '分析完成',
          sections: [],
        },
      },
    })

    const wrapper = mount(BaseNode, {
      props: {
        id: 'pearson-node',
        type: 'custom',
        selected: false,
        dragging: false,
        connectable: true,
        resizing: false,
        position: { x: 0, y: 0 },
        dimensions: { width: 110, height: 110 },
        isValidTargetPos: () => true,
        isValidSourcePos: () => true,
        zIndex: 1,
        targetPosition: Position.Left,
        sourcePosition: Position.Right,
        data: store.nodes[0]!.data,
        events: {} as any,
      } as any,
      global: {
        plugins: [PrimeVue],
        directives: { tooltip: () => undefined },
        stubs: {
          Handle: { template: '<div />' },
          NodeToolbar: { template: '<div><slot /></div>' },
          NodeIcon: { template: '<div>ICON</div>' },
        },
      },
    })

    wrapper.vm.$el.dispatchEvent(new MouseEvent('mouseenter'))

    await wrapper.get('[data-testid="preview-node-button"]').trigger('click')

    expect(store.activePreviewNodeId).toBe('pearson-node')
  })

  it('renders label and pin state directly from node props without requiring a store lookup', () => {
    const wrapper = mount(BaseNode, {
      props: {
        id: 'missing-in-store',
        type: 'custom',
        selected: false,
        dragging: false,
        connectable: true,
        resizing: false,
        position: { x: 0, y: 0 },
        dimensions: { width: 110, height: 110 },
        isValidTargetPos: () => true,
        isValidSourcePos: () => true,
        zIndex: 1,
        targetPosition: Position.Left,
        sourcePosition: Position.Right,
        data: {
          label: '仅来自 props 的节点',
          type: 'file-import',
          category: 'trigger',
          status: 'idle',
          config: {},
          logs: [],
          useManualInput: false,
          manualInput: '',
          isPinned: true,
          output: {
            kind: 'table',
            payload: [{ id: 1 }],
          },
        },
        events: {} as any,
      } as any,
      global: {
        plugins: [PrimeVue],
        directives: { tooltip: () => undefined },
        stubs: {
          Handle: { template: '<div />' },
          NodeToolbar: { template: '<div><slot /></div>' },
          NodeIcon: { template: '<div>ICON</div>' },
        },
      },
    })

    expect(wrapper.text()).toContain('仅来自 props 的节点')
    expect(wrapper.find('[data-testid="preview-node-button"]').attributes('disabled')).toBe('')
    expect(wrapper.html()).toContain('amber-100')
  })

  it('does not open node config on single click, but opens it on double click', async () => {
    const store = useWorkflowStore()
    const configSpy = vi.spyOn(store, 'setActiveConfigNodeId')

    const wrapper = mount(BaseNode, {
      props: {
        id: 'click-node',
        type: 'custom',
        selected: false,
        dragging: false,
        connectable: true,
        resizing: false,
        position: { x: 0, y: 0 },
        dimensions: { width: 110, height: 110 },
        isValidTargetPos: () => true,
        isValidSourcePos: () => true,
        zIndex: 1,
        targetPosition: Position.Left,
        sourcePosition: Position.Right,
        data: {
          label: '点击节点',
          type: 'data-cleaning',
          category: 'action',
          status: 'idle',
          config: {},
          logs: [],
          useManualInput: false,
          manualInput: '',
          isPinned: false,
        },
        events: {} as any,
      } as any,
      global: {
        plugins: [PrimeVue],
        directives: { tooltip: () => undefined },
        stubs: {
          Handle: { template: '<div />' },
          NodeToolbar: { template: '<div><slot /></div>' },
          NodeIcon: { template: '<div>ICON</div>' },
        },
      },
    })

    const body = wrapper.get('.n8n-node-body')

    await body.trigger('click')
    expect(configSpy).not.toHaveBeenCalled()

    await body.trigger('dblclick')
    expect(configSpy).toHaveBeenCalledWith('click-node')
  })
})
