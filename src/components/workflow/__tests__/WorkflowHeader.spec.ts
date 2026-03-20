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

    expect(wrapper.emitted('new-workflow')).toBeTruthy()
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
})
