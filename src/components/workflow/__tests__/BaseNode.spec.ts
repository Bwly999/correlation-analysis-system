import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
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
})
