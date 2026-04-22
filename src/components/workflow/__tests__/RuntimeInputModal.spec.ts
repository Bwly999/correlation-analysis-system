import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import RuntimeInputModal from '../RuntimeInputModal.vue'
import { useWorkflowStore } from '@/stores/workflowStore'

const dialogStub = {
  props: ['visible'],
  template: '<div><template v-if="visible"><slot name="header" /><slot /><slot name="footer" /></template></div>',
}
const tooltipDirectives = {
  tooltip: () => undefined,
}

describe('RuntimeInputModal', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('does not clamp a single runtime field into the resizable top pane', () => {
    const wrapper = mount(RuntimeInputModal, {
      props: {
        visible: true,
        node: {
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
      },
      global: {
        directives: tooltipDirectives,
        stubs: {
          Dialog: dialogStub,
          Button: true,
          PropertyField: {
            props: ['prop'],
            template: '<div class="property-field-stub">{{ prop.displayName }}</div>',
          },
        },
      },
    })

    expect(wrapper.find('[data-testid="runtime-input-first-pane"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="runtime-input-single-pane"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('选择数据文件')
  })

  it('adds bottom-safe scroll space when runtime inputs use the split layout', () => {
    const wrapper = mount(RuntimeInputModal, {
      props: {
        visible: true,
        node: {
          id: 'neighbor-system-node',
          type: 'custom',
          position: { x: 0, y: 0 },
          label: '看板数据对接',
          data: {
            label: '看板数据对接',
            type: 'neighbor-system',
            category: 'trigger',
            status: 'idle',
            config: {},
            logs: [],
            useManualInput: false,
            manualInput: '',
            isPinned: false,
          },
        } as any,
      },
      global: {
        directives: tooltipDirectives,
        stubs: {
          Dialog: dialogStub,
          Button: true,
          PropertyField: {
            props: ['prop'],
            template: '<div class="property-field-stub">{{ prop.displayName }}</div>',
          },
        },
      },
    })

    const scrollPane = wrapper.get('[data-testid="runtime-input-scroll-pane"]')

    expect(wrapper.find('[data-testid="runtime-input-first-pane"]').exists()).toBe(true)
    expect(scrollPane.classes()).toContain('pb-8')
  })

  it('shows the runtime input reuse toggle in a compact help layout', () => {
    const wrapper = mount(RuntimeInputModal, {
      props: {
        visible: true,
        node: {
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
            reuseLastRuntimeInputs: false,
          },
        } as any,
      },
      global: {
        directives: tooltipDirectives,
        stubs: {
          Dialog: dialogStub,
          Button: true,
          PropertyField: {
            props: ['prop'],
            template: '<div class="property-field-stub">{{ prop.displayName }}</div>',
          },
        },
      },
    })

    expect(wrapper.text()).toContain('沿用上次启动参数')
    expect(wrapper.text()).toContain('文件导入')
    expect(wrapper.text()).not.toContain('关闭后，每次启动都会要求重新输入本次运行参数')
  })

  it('does not reset current runtime values to defaults when toggling reuse-last-inputs', async () => {
    const wrapper = mount(RuntimeInputModal, {
      props: {
        visible: true,
        node: {
          id: 'neighbor-system-node',
          type: 'custom',
          position: { x: 0, y: 0 },
          label: '看板数据对接',
          data: {
            label: '看板数据对接',
            type: 'neighbor-system',
            category: 'trigger',
            status: 'idle',
            config: {
              fetchMode: 'scheme',
              productName: '电池A',
              schemeSelection: { checkedKeys: { '阶段A': true } },
              taskOrderType: '首件',
              selectedProcesses: ['涂布'],
            },
            logs: [],
            useManualInput: false,
            manualInput: '',
            isPinned: false,
            reuseLastRuntimeInputs: true,
          },
        } as any,
      },
      global: {
        directives: tooltipDirectives,
        stubs: {
          Dialog: dialogStub,
          Button: true,
          ToggleSwitch: {
            props: ['modelValue'],
            emits: ['update:modelValue'],
            template:
              '<button data-testid="reuse-toggle" @click="$emit(\'update:modelValue\', !modelValue)">{{ modelValue }}</button>',
          },
          PropertyField: {
            props: ['prop', 'modelValue'],
            template:
              '<div class="property-field-stub">{{ prop.name }}:{{ typeof modelValue === "string" ? modelValue : JSON.stringify(modelValue) }}</div>',
          },
        },
      },
    })

    expect(wrapper.text()).toContain('fetchMode:scheme')
    expect(wrapper.text()).toContain('schemeSelection:{"checkedKeys":{"阶段A":true}}')
    expect(wrapper.text()).toContain('taskOrderType:首件')
    expect(wrapper.text()).toContain('selectedProcesses:["涂布"]')

    await wrapper.get('[data-testid="reuse-toggle"]').trigger('click')

    expect(wrapper.text()).toContain('fetchMode:scheme')
    expect(wrapper.text()).toContain('schemeSelection:{"checkedKeys":{"阶段A":true}}')
    expect(wrapper.text()).toContain('taskOrderType:首件')
    expect(wrapper.text()).toContain('selectedProcesses:["涂布"]')
  })

  it('shows file import parsing progress when the current node is importing in background', () => {
    const store = useWorkflowStore()
    store.fileImportTasks = {
      'file-import-node': {
        phase: 'parsing',
        progress: 35,
        fileName: 'demo.csv',
        format: 'csv',
        canCancel: true,
        startedAt: Date.now(),
      },
    } as any

    const wrapper = mount(RuntimeInputModal, {
      props: {
        visible: true,
        node: {
          id: 'file-import-node',
          type: 'custom',
          position: { x: 0, y: 0 },
          label: '文件导入',
          data: {
            label: '文件导入',
            type: 'file-import',
            category: 'trigger',
            status: 'running',
            config: {},
            logs: [],
            useManualInput: false,
            manualInput: '',
            isPinned: false,
            reuseLastRuntimeInputs: false,
          },
        } as any,
      },
      global: {
        directives: tooltipDirectives,
        stubs: {
          Dialog: dialogStub,
          Button: true,
          PropertyField: {
            props: ['prop'],
            template: '<div class="property-field-stub">{{ prop.displayName }}</div>',
          },
        },
      },
    })

    expect(wrapper.text()).toContain('正在后台解析文件')
    expect(wrapper.text()).toContain('demo.csv')
    expect(wrapper.text()).toContain('正在解析文件内容')
  })
})
