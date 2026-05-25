import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import WorkflowHeader from '../WorkflowHeader.vue'
import { useWorkflowStore } from '@/stores/workflowStore'

const toastAdd = vi.fn()

vi.mock('primevue/usetoast', () => ({
  useToast: () => ({
    add: toastAdd,
  }),
}))

describe('WorkflowHeader', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  it('renders the create button and emits new-workflow when clicked', async () => {
    const wrapper = mount(WorkflowHeader, {
      global: {
        stubs: {
          Button: { template: '<button @click="$emit(\'click\')"><slot /></button>' },
          Menu: { template: '<div />' },
          Popover: { template: '<div><slot /></div>' },
        },
      },
    })

    const createButton = wrapper.findAll('button').find((node) => node.text().includes('新建'))

    expect(createButton).toBeTruthy()

    await createButton!.trigger('click')

    expect(wrapper.emitted('newWorkflow')).toBeTruthy()
  })

  it('shows a success toast after saving the workflow', async () => {
    const store = useWorkflowStore()
    vi.spyOn(store, 'saveWorkflow').mockResolvedValue({
      id: 'wf_1',
      name: '测试工作流',
      nodes: [],
      edges: [],
      updatedAt: Date.now(),
    } as any)

    const wrapper = mount(WorkflowHeader, {
      global: {
        stubs: {
          Button: { template: '<button @click="$emit(\'click\')"><slot /></button>' },
          Menu: { template: '<div />' },
          Popover: { template: '<div><slot /></div>' },
        },
      },
    })

    const saveButton = wrapper.findAll('button').find((node) => node.text().includes('保存'))

    await saveButton!.trigger('click')
    await Promise.resolve()

    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: 'success',
        summary: '保存成功',
      }),
    )
  })

  it('shows an error toast when saving fails', async () => {
    const store = useWorkflowStore()
    vi.spyOn(store, 'saveWorkflow').mockRejectedValue(new Error('保存失败'))

    const wrapper = mount(WorkflowHeader, {
      global: {
        stubs: {
          Button: { template: '<button @click="$emit(\'click\')"><slot /></button>' },
          Menu: { template: '<div />' },
          Popover: { template: '<div><slot /></div>' },
        },
      },
    })

    const saveButton = wrapper.findAll('button').find((node) => node.text().includes('保存'))

    await saveButton!.trigger('click')
    await Promise.resolve()

    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: 'error',
        summary: '保存失败',
      }),
    )
  })

  it('shows an error toast when clearing history fails from the file menu', async () => {
    const store = useWorkflowStore()
    vi.spyOn(store, 'clearHistory').mockRejectedValue(new Error('清空失败'))

    let capturedMenuItems: any[] = []
    const menuStub = {
      props: ['model'],
      template: '<div class="menu-stub"></div>',
      mounted(this: { model: any[] }) {
        capturedMenuItems = this.model
      },
      methods: {
        toggle() {},
      },
    }

    mount(WorkflowHeader, {
      global: {
        stubs: {
          Button: { template: '<button @click="$emit(\'click\')"><slot /></button>' },
          Menu: menuStub,
          Popover: { template: '<div><slot /></div>' },
        },
      },
    })

    await capturedMenuItems[0].items[2].command()

    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: 'error',
        summary: '清空失败',
        detail: '清空失败',
      }),
    )
  })

  it('renders the help button and emits open-help when clicked', async () => {
    const wrapper = mount(WorkflowHeader, {
      global: {
        stubs: {
          Button: { template: '<button @click="$emit(\'click\')"><slot /></button>' },
          Menu: { template: '<div />' },
          Popover: { template: '<div><slot /></div>' },
        },
      },
    })

    const helpButton = wrapper.findAll('button').find((node) => node.text().includes('帮助'))

    expect(helpButton).toBeTruthy()

    await helpButton!.trigger('click')

    expect(wrapper.emitted('openHelp')).toBeTruthy()
  })

  it('renders the template button and emits open-template-library when clicked', async () => {
    const wrapper = mount(WorkflowHeader, {
      global: {
        stubs: {
          Button: { template: '<button @click="$emit(\'click\')"><slot /></button>' },
          Menu: { template: '<div />' },
          Popover: { template: '<div><slot /></div>' },
        },
      },
    })

    const templateButton = wrapper.findAll('button').find((node) => node.text().includes('模板'))

    expect(templateButton).toBeTruthy()

    await templateButton!.trigger('click')

    expect(wrapper.emitted('openTemplateLibrary')).toBeTruthy()
  })

  it('shows unsaved status beside the workflow name and highlights the save action', () => {
    const store = useWorkflowStore()
    store.workflowName = '测试工作流'
    store.markWorkflowAsExplicitlyUnsaved()

    const wrapper = mount(WorkflowHeader, {
      global: {
        stubs: {
          Button: { template: '<button @click="$emit(\'click\')"><slot /></button>' },
          Menu: { template: '<div />' },
          Popover: { template: '<div><slot /></div>' },
        },
      },
    })

    expect(wrapper.find('[data-testid="workflow-unsaved-indicator"]').text()).toContain('未保存')
    expect(wrapper.find('[data-testid="workflow-save-button"]').text()).toContain('保存更改')
    expect(wrapper.find('[data-testid="workflow-save-button"]').classes()).toContain('save-btn--unsaved')
  })

  it('loads history summaries when the history trigger is clicked', async () => {
    const store = useWorkflowStore()
    const loadHistorySpy = vi.spyOn(store, 'loadHistory').mockResolvedValue(undefined)

    const wrapper = mount(WorkflowHeader, {
      global: {
        stubs: {
          Button: { template: '<button @click="$emit(\'click\')"><slot /></button>' },
          Menu: { template: '<div />' },
          Popover: {
            template: '<div><slot /></div>',
            methods: { toggle() {}, hide() {} },
          },
        },
      },
    })

    const historyButton = wrapper.find('button[title="查看运行历史"]')
    await historyButton.trigger('click')

    expect(loadHistorySpy).toHaveBeenCalled()
  })
})
