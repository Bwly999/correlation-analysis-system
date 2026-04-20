import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import PrimeVue from 'primevue/config'
import { Position } from '@vue-flow/core'
import BaseNode from '../nodes/BaseNode.vue'
import { useWorkflowStore } from '@/stores/workflowStore'

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
          output: {
            kind: 'report',
            payload: {
              summary: '分析完成',
              sections: [],
            },
          },
        },
      } as any,
    ]

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
})
