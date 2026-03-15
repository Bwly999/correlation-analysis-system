vi.mock('../MonacoEditor.vue', () => ({ default: { template: '<div />' } }))

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import NodeConfigModal from '../NodeConfigModal.vue'
import { useWorkflowStore } from '@/stores/workflowStore'

describe('NodeConfigModal', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    document.queryCommandSupported = vi.fn(() => true) as any
  })

  it('passes a multi-input summary to the input display panel for multi-input nodes', () => {
    const store = useWorkflowStore()
    store.nodes = [
      {
        id: 'source-1',
        type: 'custom',
        position: { x: 0, y: 0 },
        label: '来源一',
        data: {
          label: '来源一',
          type: 'manual-json-import',
          category: 'trigger',
          status: 'success',
          config: {},
          logs: [],
          useManualInput: false,
          manualInput: '',
          isPinned: false,
          output: { data: [{ id: 1, city: '上海' }] },
        },
      } as any,
      {
        id: 'source-2',
        type: 'custom',
        position: { x: 0, y: 120 },
        label: '来源二',
        data: {
          label: '来源二',
          type: 'manual-json-import',
          category: 'trigger',
          status: 'success',
          config: {},
          logs: [],
          useManualInput: false,
          manualInput: '',
          isPinned: false,
          output: { data: [{ id: 2, score: 95 }] },
        },
      } as any,
      {
        id: 'data-merge-node',
        type: 'custom',
        position: { x: 300, y: 0 },
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
    store.edges = [
      { id: 'e1', source: 'source-1', target: 'data-merge-node', type: 'n8n', animated: true },
      { id: 'e2', source: 'source-2', target: 'data-merge-node', type: 'n8n', animated: true },
    ] as any

    const wrapper = mount(NodeConfigModal, {
      props: { visible: true, nodeId: 'data-merge-node' },
      global: {
        stubs: {
          Dialog: { template: '<div><slot name="header" /><slot /></div>' },
          DataDisplayPanel: {
            props: ['title', 'data'],
            template: '<div class="data-display-panel">{{ title }}::{{ JSON.stringify(data) }}</div>',
          },
          DataAnalysisModal: true,
          ConfigHeader: { template: '<div />', props: ['nodeLabel', 'isPinned', 'nodeType'] },
          ConfigFooter: { template: '<div />' },
          ConfigForm: { template: '<div />', props: ['config', 'properties', 'upstreamFactors'] },
          RuntimeInputs: { template: '<div />', props: ['config', 'properties', 'upstreamFactors'] },
        },
      },
    })

    const inputPanel = wrapper.findAll('.data-display-panel')[0]!
    expect(inputPanel.text()).toContain('inputs')
    expect(inputPanel.text()).toContain('来源一')
    expect(inputPanel.text()).toContain('来源二')
  })
})
