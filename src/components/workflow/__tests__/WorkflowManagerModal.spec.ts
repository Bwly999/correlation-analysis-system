import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import WorkflowManagerModal from '../WorkflowManagerModal.vue'
import { useWorkflowStore } from '@/stores/workflowStore'

const toastAdd = vi.fn()
const confirmRequire = vi.fn()

vi.mock('primevue/useconfirm', () => ({
  useConfirm: () => ({
    require: confirmRequire,
  }),
}))

vi.mock('primevue/usetoast', () => ({
  useToast: () => ({
    add: toastAdd,
  }),
}))

const dialogStub = {
  props: ['visible'],
  template:
    '<div><template v-if="visible"><slot name="header" /><slot /><slot name="footer" /></template></div>',
}

const inputTextStub = {
  props: ['modelValue', 'placeholder'],
  emits: ['update:modelValue'],
  template:
    '<input :value="modelValue" :placeholder="placeholder" @input="$emit(\'update:modelValue\', $event.target.value)" />',
}

describe('WorkflowManagerModal', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('shows history records from all workflows in workflow manager', async () => {
    const store = useWorkflowStore()
    store.currentWorkflowId = 'wf_current'
    store.executionHistory = [
      {
        id: 'history_1',
        workflowId: 'wf_other',
        workflowName: '其他工作流',
        startTime: Date.now(),
        duration: 1200,
        status: 'success',
        nodes: [],
        edges: [],
      },
    ] as any

    const wrapper = mount(WorkflowManagerModal, {
      props: {
        visible: true,
      },
      global: {
        stubs: {
          Dialog: dialogStub,
          Button: {
            props: ['label', 'disabled'],
            emits: ['click'],
            template:
              '<button :disabled="disabled" @click="$emit(\'click\')">{{ label }}<slot /></button>',
          },
          Tabs: { template: '<div><slot /></div>' },
          TabList: { template: '<div><slot /></div>' },
          Tab: { template: '<button><slot /></button>' },
          TabPanels: { template: '<div><slot /></div>' },
          TabPanel: { template: '<div><slot /></div>' },
          InputText: inputTextStub,
        },
        directives: {
          tooltip: {},
        },
      },
    })

    expect(wrapper.text()).toContain('所有工作流的历史记录')
    expect(wrapper.text()).toContain('其他工作流')
  })

  it('shows loading copy while the history list is being fetched', async () => {
    const store = useWorkflowStore()
    vi.spyOn(store, 'loadHistory').mockResolvedValue(undefined)
    store.isHistorySummariesLoading = true

    const wrapper = mount(WorkflowManagerModal, {
      props: {
        visible: true,
        initialTab: '1',
      },
      global: {
        stubs: {
          Dialog: dialogStub,
          Button: {
            props: ['label', 'disabled'],
            emits: ['click'],
            template:
              '<button :disabled="disabled" @click="$emit(\'click\')">{{ label }}<slot /></button>',
          },
          Tabs: { template: '<div><slot /></div>' },
          TabList: { template: '<div><slot /></div>' },
          Tab: { template: '<button><slot /></button>' },
          TabPanels: { template: '<div><slot /></div>' },
          TabPanel: { template: '<div><slot /></div>' },
          InputText: inputTextStub,
        },
        directives: {
          tooltip: {},
        },
      },
    })

    expect(wrapper.text()).toContain('正在加载运行历史...')
  })

  it('opens duplicate-name dialog with a default workflow name and confirms duplication', async () => {
    const store = useWorkflowStore()
    store.savedWorkflows = [
      {
        id: 'wf_1',
        name: '原始工作流',
        nodes: [],
        edges: [],
        updatedAt: Date.now(),
      },
    ] as any

    const duplicateWorkflow = vi
      .spyOn(store, 'duplicateWorkflow')
      .mockResolvedValue(store.savedWorkflows as any)

    const wrapper = mount(WorkflowManagerModal, {
      props: {
        visible: true,
      },
      global: {
        stubs: {
          Dialog: dialogStub,
          Button: {
            props: ['label', 'disabled'],
            emits: ['click'],
            template:
              '<button :disabled="disabled" @click="$emit(\'click\')">{{ label }}<slot /></button>',
          },
          Tabs: { template: '<div><slot /></div>' },
          TabList: { template: '<div><slot /></div>' },
          Tab: { template: '<button><slot /></button>' },
          TabPanels: { template: '<div><slot /></div>' },
          TabPanel: { template: '<div><slot /></div>' },
          InputText: inputTextStub,
        },
        directives: {
          tooltip: {},
        },
      },
    })

    const copyButton = wrapper.find('[data-testid="duplicate-workflow-button"]')

    expect(copyButton.exists()).toBe(true)

    await copyButton.trigger('click')
    await wrapper.vm.$nextTick()

    const nameInput = wrapper.find('input')
    expect(nameInput.exists()).toBe(true)
    expect((nameInput.element as HTMLInputElement).value).toBe('原始工作流 (副本)')

    await nameInput.setValue('自定义副本名称')

    const confirmButton = wrapper.find('[data-testid="confirm-duplicate-workflow-button"]')

    expect(confirmButton.exists()).toBe(true)

    await confirmButton.trigger('click')

    expect(duplicateWorkflow).toHaveBeenCalledWith('wf_1', '自定义副本名称')
  })

  it('shows an error toast when duplicating a workflow fails', async () => {
    const store = useWorkflowStore()
    store.savedWorkflows = [
      {
        id: 'wf_1',
        name: '原始工作流',
        nodes: [],
        edges: [],
        updatedAt: Date.now(),
      },
    ] as any
    vi.spyOn(store, 'duplicateWorkflow').mockRejectedValue(new Error('复制失败'))

    const wrapper = mount(WorkflowManagerModal, {
      props: {
        visible: true,
      },
      global: {
        stubs: {
          Dialog: dialogStub,
          Button: {
            props: ['label', 'disabled'],
            emits: ['click'],
            template:
              '<button :disabled="disabled" @click="$emit(\'click\')">{{ label }}<slot /></button>',
          },
          Tabs: { template: '<div><slot /></div>' },
          TabList: { template: '<div><slot /></div>' },
          Tab: { template: '<button><slot /></button>' },
          TabPanels: { template: '<div><slot /></div>' },
          TabPanel: { template: '<div><slot /></div>' },
          InputText: inputTextStub,
        },
        directives: {
          tooltip: {},
        },
      },
    })

    await wrapper.find('[data-testid="duplicate-workflow-button"]').trigger('click')
    await wrapper.find('input').setValue('自定义副本名称')
    await wrapper.find('[data-testid="confirm-duplicate-workflow-button"]').trigger('click')
    await Promise.resolve()

    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: 'error',
        summary: '复制失败',
        detail: '复制失败',
      }),
    )
  })

  it('shows an error toast when deleting a workflow fails', async () => {
    const store = useWorkflowStore()
    store.savedWorkflows = [
      {
        id: 'wf_1',
        name: '原始工作流',
        nodes: [],
        edges: [],
        updatedAt: Date.now(),
      },
    ] as any
    vi.spyOn(store, 'deleteWorkflow').mockRejectedValue(new Error('删除失败'))

    const wrapper = mount(WorkflowManagerModal, {
      props: {
        visible: true,
      },
      global: {
        stubs: {
          Dialog: dialogStub,
          Button: {
            props: ['label', 'disabled'],
            emits: ['click'],
            template:
              '<button :disabled="disabled" @click="$emit(\'click\')">{{ label }}<slot /></button>',
          },
          Tabs: { template: '<div><slot /></div>' },
          TabList: { template: '<div><slot /></div>' },
          Tab: { template: '<button><slot /></button>' },
          TabPanels: { template: '<div><slot /></div>' },
          TabPanel: { template: '<div><slot /></div>' },
          InputText: inputTextStub,
        },
        directives: {
          tooltip: {},
        },
      },
    })

    await wrapper.find('[data-testid="delete-workflow-button"]').trigger('click')
    await Promise.resolve()

    const accept = confirmRequire.mock.calls[0]?.[0]?.accept
    expect(typeof accept).toBe('function')

    await accept()

    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: 'error',
        summary: '删除失败',
        detail: '删除失败',
      }),
    )
  })

  it('shows a load error toast when workflows or history fail to load', async () => {
    const store = useWorkflowStore()
    vi.spyOn(store, 'getSavedWorkflows').mockRejectedValue(new Error('加载工作流失败'))
    vi.spyOn(store, 'loadHistory').mockResolvedValue(undefined)

    mount(WorkflowManagerModal, {
      props: {
        visible: true,
      },
      global: {
        stubs: {
          Dialog: dialogStub,
          Button: {
            props: ['label', 'disabled'],
            emits: ['click'],
            template:
              '<button :disabled="disabled" @click="$emit(\'click\')">{{ label }}<slot /></button>',
          },
          Tabs: { template: '<div><slot /></div>' },
          TabList: { template: '<div><slot /></div>' },
          Tab: { template: '<button><slot /></button>' },
          TabPanels: { template: '<div><slot /></div>' },
          TabPanel: { template: '<div><slot /></div>' },
          InputText: inputTextStub,
        },
        directives: {
          tooltip: {},
        },
      },
    })
    await Promise.resolve()
    await Promise.resolve()

    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: 'error',
        summary: '加载失败',
        detail: '加载工作流失败',
      }),
    )
  })

  it('shows template entries and emits create-workflow-from-template when selected', async () => {
    const wrapper = mount(WorkflowManagerModal, {
      props: {
        visible: true,
        initialTab: '2',
      },
      global: {
        stubs: {
          Dialog: dialogStub,
          Button: {
            props: ['label', 'disabled'],
            emits: ['click'],
            template:
              '<button :disabled="disabled" @click="$emit(\'click\')">{{ label }}<slot /></button>',
          },
          Tabs: { template: '<div><slot /></div>' },
          TabList: { template: '<div><slot /></div>' },
          Tab: { template: '<button><slot /></button>' },
          TabPanels: { template: '<div><slot /></div>' },
          TabPanel: { template: '<div><slot /></div>' },
          InputText: inputTextStub,
        },
        directives: {
          tooltip: {},
        },
      },
    })

    expect(wrapper.text()).toContain('分析模板')
    expect(wrapper.text()).toContain('相关性排查模板')
    expect(wrapper.text()).toContain('手动 JSON 输入可随时替换为文件导入或看板数据获取')

    await wrapper.find('[data-testid="workflow-template-create-correlation-analysis"]').trigger('click')

    expect(wrapper.emitted('create-workflow-from-template')).toEqual([['correlation-analysis']])
  })
})
