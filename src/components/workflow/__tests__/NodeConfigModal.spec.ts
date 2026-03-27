vi.mock('../MonacoEditor.vue', () => ({ default: { template: '<div />' } }))

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import NodeConfigModal from '../NodeConfigModal.vue'
import { useWorkflowStore } from '@/stores/workflowStore'

describe('NodeConfigModal', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    document.queryCommandSupported = vi.fn(() => true) as any
  })

  const dialogStub = {
    props: ['visible'],
    template: '<div><template v-if="visible"><slot name="header" /><slot /></template></div>',
  }

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
          Dialog: dialogStub,
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
    expect(wrapper.find('[data-testid="runtime-inputs-panel-shell"]').exists()).toBe(true)
  })

  it('generates a standard table result template for single-input debugging', async () => {
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
          output: {
            kind: 'table',
            payload: [{ id: 1, city: '上海', score: 95 }],
          },
        },
      } as any,
      {
        id: 'data-cleaning-node',
        type: 'custom',
        position: { x: 300, y: 0 },
        label: '数据清洗',
        data: {
          label: '数据清洗',
          type: 'data-cleaning',
          category: 'action',
          status: 'idle',
          config: {},
          logs: [],
          useManualInput: true,
          manualInput: '',
          isPinned: false,
        },
      } as any,
    ]
    store.edges = [
      { id: 'e1', source: 'source-1', target: 'data-cleaning-node', type: 'n8n', animated: true },
    ] as any

    const wrapper = mount(NodeConfigModal, {
      props: { visible: true, nodeId: 'data-cleaning-node' },
      global: {
        stubs: {
          Dialog: dialogStub,
          DataDisplayPanel: {
            props: ['title', 'manualInputStr'],
            emits: ['generateMock'],
            template:
              '<div class="data-display-panel">{{ title }}::{{ manualInputStr }}<button class="generate-mock-btn" @click="$emit(\'generateMock\')">生成</button></div>',
          },
          DataAnalysisModal: true,
          ConfigHeader: { template: '<div />', props: ['nodeLabel', 'isPinned', 'nodeType'] },
          ConfigFooter: { template: '<div />' },
          ConfigForm: { template: '<div />', props: ['config', 'properties', 'upstreamFactors'] },
          RuntimeInputs: { template: '<div />', props: ['config', 'properties', 'upstreamFactors'] },
        },
      },
    })

    await wrapper.find('.generate-mock-btn').trigger('click')

    const inputPanel = wrapper.findAll('.data-display-panel')[0]!
    expect(inputPanel.text()).toContain('"kind": "table"')
    expect(inputPanel.text()).toContain('"payload"')
    expect(inputPanel.text()).not.toContain('"data":')
  })

  it('generates a multi-input execution template with standard results', async () => {
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
          output: {
            kind: 'table',
            payload: [{ id: 1, city: '上海' }],
          },
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
          output: {
            kind: 'table',
            payload: [{ id: 2, score: 88 }],
          },
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
          useManualInput: true,
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
          Dialog: dialogStub,
          DataDisplayPanel: {
            props: ['title', 'manualInputStr'],
            emits: ['generateMock'],
            template:
              '<div class="data-display-panel">{{ title }}::{{ manualInputStr }}<button class="generate-mock-btn" @click="$emit(\'generateMock\')">生成</button></div>',
          },
          DataAnalysisModal: true,
          ConfigHeader: { template: '<div />', props: ['nodeLabel', 'isPinned', 'nodeType'] },
          ConfigFooter: { template: '<div />' },
          ConfigForm: { template: '<div />', props: ['config', 'properties', 'upstreamFactors'] },
          RuntimeInputs: { template: '<div />', props: ['config', 'properties', 'upstreamFactors'] },
        },
      },
    })

    await wrapper.find('.generate-mock-btn').trigger('click')

    const inputPanel = wrapper.findAll('.data-display-panel')[0]!
    expect(inputPanel.text()).toContain('"inputs"')
    expect(inputPanel.text()).toContain('"result"')
    expect(inputPanel.text()).toContain('"kind": "table"')
    expect(inputPanel.text()).not.toContain('"data":')
  })

  it('renders a compact node summary and opens full help in a dialog', async () => {
    const store = useWorkflowStore()
    store.nodes = [
      {
        id: 'file-import-node',
        type: 'custom',
        position: { x: 0, y: 0 },
        label: '文件导入',
        data: {
          label: '文件导入',
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

    const wrapper = mount(NodeConfigModal, {
      props: { visible: true, nodeId: 'file-import-node' },
      global: {
        stubs: {
          Dialog: dialogStub,
          DataDisplayPanel: true,
          DataAnalysisModal: true,
          ConfigHeader: { template: '<div />', props: ['nodeLabel', 'isPinned', 'nodeType'] },
          ConfigFooter: { template: '<div />' },
          ConfigForm: { template: '<div />', props: ['config', 'properties', 'upstreamFactors'] },
          RuntimeInputs: { template: '<div />', props: ['config', 'properties', 'upstreamFactors'] },
        },
      },
    })

    expect(wrapper.text()).toContain('节点简介')
    expect(wrapper.text()).toContain('本地文件导入')
    expect(wrapper.text()).not.toContain('适用场景')

    const helpButton = wrapper.find('[data-testid="node-help-trigger"]')
    expect(helpButton.exists()).toBe(true)

    await helpButton.trigger('click')

    expect(wrapper.text()).toContain('适用场景')
    expect(wrapper.text()).toContain('输入要求')
  })

  it('shows a fallback help message when node help is unavailable', () => {
    const store = useWorkflowStore()
    store.nodes = [
      {
        id: 'unknown-node',
        type: 'custom',
        position: { x: 0, y: 0 },
        label: '未知节点',
        data: {
          label: '未知节点',
          type: 'unknown-node-type',
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

    const wrapper = mount(NodeConfigModal, {
      props: { visible: true, nodeId: 'unknown-node' },
      global: {
        stubs: {
          Dialog: dialogStub,
          DataDisplayPanel: true,
          DataAnalysisModal: true,
          ConfigHeader: { template: '<div />', props: ['nodeLabel', 'isPinned', 'nodeType'] },
          ConfigFooter: { template: '<div />' },
          ConfigForm: { template: '<div />', props: ['config', 'properties', 'upstreamFactors'] },
          RuntimeInputs: { template: '<div />', props: ['config', 'properties', 'upstreamFactors'] },
        },
      },
    })

    expect(wrapper.text()).toContain('未找到节点定义')
    expect(wrapper.text()).toContain('暂时无法展示帮助')
    expect(wrapper.find('[data-testid="node-help-trigger"]').exists()).toBe(false)
  })

  it('saves config without closing the modal when applying changes', async () => {
    const store = useWorkflowStore()
    store.nodes = [
      {
        id: 'data-cleaning-node',
        type: 'custom',
        position: { x: 300, y: 0 },
        label: '数据清洗',
        data: {
          label: '数据清洗',
          type: 'data-cleaning',
          category: 'action',
          status: 'idle',
          config: { scaling: 'none' },
          logs: [],
          useManualInput: false,
          manualInput: '',
          isPinned: false,
        },
      } as any,
    ]

    const wrapper = mount(NodeConfigModal, {
      props: { visible: true, nodeId: 'data-cleaning-node' },
      global: {
        stubs: {
          Dialog: dialogStub,
          DataDisplayPanel: true,
          DataAnalysisModal: true,
          ConfigHeader: { template: '<div />', props: ['nodeLabel', 'isPinned', 'nodeType'] },
          ConfigFooter: {
            template: '<button class="apply-btn" @click="$emit(\'save\')">应用</button>',
          },
          ConfigForm: {
            props: ['config', 'properties', 'upstreamFactors'],
            emits: ['update:config', 'save'],
            template:
              '<div><button class="change-config-btn" @click="$emit(\'update:config\', { ...config, scaling: \'minmax\' })">改配置</button></div>',
          },
          RuntimeInputs: { template: '<div />', props: ['config', 'properties', 'upstreamFactors'] },
        },
      },
    })

    const closeCountBeforeSave = wrapper.emitted('close')?.length ?? 0
    await wrapper.get('.change-config-btn').trigger('click')
    await wrapper.get('.apply-btn').trigger('click')

    expect(store.nodes[0]?.data.config.scaling).toBe('minmax')
    expect(wrapper.emitted('close')?.length ?? 0).toBe(closeCountBeforeSave)
  })

  it('cleans up document drag listeners when unmounted during resize', async () => {
    const store = useWorkflowStore()
    store.nodes = [
      {
        id: 'file-import-node',
        type: 'custom',
        position: { x: 0, y: 0 },
        label: '文件导入',
        data: {
          label: '文件导入',
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

    const addEventListenerSpy = vi.spyOn(document, 'addEventListener')
    const removeEventListenerSpy = vi.spyOn(document, 'removeEventListener')

    const wrapper = mount(NodeConfigModal, {
      props: { visible: true, nodeId: 'file-import-node' },
      global: {
        stubs: {
          Dialog: dialogStub,
          DataDisplayPanel: true,
          DataAnalysisModal: true,
          ConfigHeader: { template: '<div />', props: ['nodeLabel', 'isPinned', 'nodeType'] },
          ConfigFooter: { template: '<div />' },
          ConfigForm: { template: '<div />', props: ['config', 'properties', 'upstreamFactors'] },
          RuntimeInputs: { template: '<div />', props: ['config', 'properties', 'upstreamFactors'] },
        },
      },
    })

    await wrapper.find('.cursor-row-resize').trigger('mousedown', { clientY: 320 })
    wrapper.unmount()

    const mouseMoveHandler = addEventListenerSpy.mock.calls.find(([eventName]) => eventName === 'mousemove')?.[1]
    const mouseUpHandler = addEventListenerSpy.mock.calls.find(([eventName]) => eventName === 'mouseup')?.[1]

    expect(mouseMoveHandler).toBeTypeOf('function')
    expect(mouseUpHandler).toBeTypeOf('function')
    expect(removeEventListenerSpy).toHaveBeenCalledWith('mousemove', mouseMoveHandler)
    expect(removeEventListenerSpy).toHaveBeenCalledWith('mouseup', mouseUpHandler)
  })

  it('shows runtime settings for trigger nodes and allows resetting saved runtime inputs', async () => {
    const store = useWorkflowStore()
    const file = new File(['a,b\n1,2'], 'test.csv')
    store.nodes = [
      {
        id: 'file-import-node',
        type: 'custom',
        position: { x: 0, y: 0 },
        label: '文件导入',
        data: {
          label: '文件导入',
          type: 'file-import',
          category: 'trigger',
          status: 'idle',
          config: {
            fileData: file,
            format: 'csv',
          },
          logs: [],
          useManualInput: false,
          manualInput: '',
          isPinned: false,
          reuseLastRuntimeInputs: true,
        },
      } as any,
    ]

    const wrapper = mount(NodeConfigModal, {
      props: { visible: true, nodeId: 'file-import-node' },
      global: {
        stubs: {
          Dialog: dialogStub,
          DataDisplayPanel: true,
          DataAnalysisModal: true,
          ConfigHeader: { template: '<div />', props: ['nodeLabel', 'isPinned', 'nodeType'] },
          ConfigFooter: { template: '<div />' },
          ConfigForm: { template: '<div />', props: ['config', 'properties', 'upstreamFactors'] },
          RuntimeInputs: { template: '<div />', props: ['config', 'properties', 'upstreamFactors'] },
        },
      },
    })

    expect(wrapper.text()).toContain('运行设置')
    expect(wrapper.text()).not.toContain('系统选项')

    const runtimeSettingsTab = wrapper.findAll('button').find((button) => button.text() === '运行设置')
    expect(runtimeSettingsTab).toBeTruthy()

    await runtimeSettingsTab!.trigger('click')
    await nextTick()

    expect(wrapper.text()).toContain('沿用上次启动参数')
    expect(wrapper.text()).toContain('重置已保存启动参数')

    const resetButton = wrapper
      .findAll('button')
      .find((button) => button.text().includes('重置已保存启动参数'))
    expect(resetButton).toBeTruthy()

    await resetButton!.trigger('click')

    expect(store.nodes[0]?.data.reuseLastRuntimeInputs).toBe(false)
    expect(store.nodes[0]?.data.config.fileData).toBeNull()
    expect(store.nodes[0]?.data.config.format).toBe('csv')
  })
})
