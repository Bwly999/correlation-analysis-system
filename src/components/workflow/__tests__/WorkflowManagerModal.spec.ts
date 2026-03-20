import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import WorkflowManagerModal from '../WorkflowManagerModal.vue'
import { useWorkflowStore } from '@/stores/workflowStore'

vi.mock('primevue/useconfirm', () => ({
  useConfirm: () => ({
    require: vi.fn(),
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
})
