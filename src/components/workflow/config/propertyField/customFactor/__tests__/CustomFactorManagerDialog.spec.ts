import { computed, defineComponent, h, onMounted } from 'vue'
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CustomFactorManagerDialog from '../CustomFactorManagerDialog.vue'

let gridReadyPayload: Record<string, unknown> | null = null
let selectedRowsRef: Array<Record<string, unknown>> = []

vi.mock('primevue/usetoast', () => ({
  useToast: () => ({
    add: vi.fn(),
  }),
}))

vi.mock('../../inputs/fileColumnTextImport', () => ({
  parseTabularTextFile: vi.fn(),
}))

const { parseTabularTextFile: parseTabularTextFileMock } = await import('../../inputs/fileColumnTextImport') as any

vi.mock('ag-grid-vue3', () => ({
  AgGridVue: defineComponent({
    name: 'AgGridVueStub',
    props: [
      'rowData',
      'columnDefs',
      'defaultColDef',
      'rowSelection',
      'singleClickEdit',
      'stopEditingWhenCellsLoseFocus',
    ],
    emits: ['gridReady', 'selectionChanged', 'cellValueChanged'],
    setup(props, { emit }) {
      const rowSummary = computed(() => JSON.stringify(props.rowData ?? []))

      onMounted(() => {
        const api = {
          getSelectedRows: () => selectedRowsRef,
        }
        gridReadyPayload = {
          defaultColDef: props.defaultColDef,
          rowSelection: props.rowSelection,
          singleClickEdit: props.singleClickEdit,
          stopEditingWhenCellsLoseFocus: props.stopEditingWhenCellsLoseFocus,
        }
        emit('gridReady', { api })
      })

      return () =>
        h('div', { 'data-testid': 'ag-grid-stub' }, [
          h('div', { 'data-testid': 'ag-grid-row-summary' }, rowSummary.value),
          h('button', {
            type: 'button',
            'data-testid': 'ag-grid-select-row',
            onClick: () => {
              selectedRowsRef = [
                {
                  uid: 'uid-1',
                  identityKey: 'id-1',
                  factorKey: 'TEMP_1',
                  factorName: '温度一',
                  materialType: '正极',
                  processName: '涂布',
                  r2Name: 'R2-1',
                },
              ]
              emit('selectionChanged', {
                api: {
                  getSelectedRows: () => selectedRowsRef,
                },
              })
            },
          }),
          h('button', {
            type: 'button',
            'data-testid': 'ag-grid-edit-row',
            onClick: () =>
              emit('cellValueChanged', {
                data: {
                  uid: 'uid-1',
                  identityKey: 'id-1',
                  factorKey: 'TEMP_1',
                  factorName: '温度一-已修改',
                  materialType: '正极',
                  processName: '涂布',
                  r2Name: 'R2-1',
                },
              }),
          }),
        ])
    },
  }),
}))

describe('CustomFactorManagerDialog', () => {
  beforeEach(() => {
    localStorage.clear()
    gridReadyPayload = null
    selectedRowsRef = []
    parseTabularTextFileMock.mockReset()
    parseTabularTextFileMock.mockResolvedValue({
      columns: ['因子编码', '因子名称', '物料类型', '工序', 'R2 名称'],
      rows: [],
    })

    localStorage.setItem('workflow.customFactorGroups.v1', JSON.stringify([
      {
        id: 'group-1',
        name: '默认组',
        createdAt: '2026-05-25T10:00:00.000Z',
        updatedAt: '2026-05-25T10:00:00.000Z',
        factors: [
          {
            uid: 'uid-1',
            identityKey: 'id-1',
            factorKey: 'TEMP_1',
            factorName: '温度一',
            materialType: '正极',
            processName: '涂布',
            r2Name: 'R2-1',
          },
          {
            uid: 'uid-2',
            identityKey: 'id-2',
            factorKey: 'PRESS_1',
            factorName: '压力一',
            materialType: '正极',
            processName: '辊压',
            r2Name: 'R2-2',
          },
        ],
      },
    ]))
  })

  const createSelectStub = () =>
    defineComponent({
      name: 'SelectStub',
      props: ['modelValue', 'options', 'optionLabel', 'optionValue', 'placeholder'],
      emits: ['update:modelValue'],
      template: `
        <select
          :value="modelValue"
          @change="$emit('update:modelValue', $event.target.value)"
        >
          <option value="">{{ placeholder || '请选择' }}</option>
          <option
            v-for="option in options"
            :key="option[optionValue]"
            :value="option[optionValue]"
          >
            {{ option[optionLabel] }}
          </option>
        </select>
      `,
    })

  const createButtonStub = () =>
    defineComponent({
      name: 'ButtonStub',
      props: ['label', 'disabled'],
      emits: ['click'],
      template: `
        <button
          type="button"
          :disabled="disabled"
          :aria-label="$attrs['aria-label'] || label"
          v-bind="$attrs"
          @click="$emit('click', $event)"
        >
          <slot name="icon" />
          <span v-if="label">{{ label }}</span>
          <slot />
        </button>
      `,
    })

  const createDialogStub = () =>
    defineComponent({
      name: 'DialogStub',
      props: ['visible'],
      emits: ['update:visible'],
      template: '<div v-if="visible"><slot /><slot name="footer" /></div>',
    })

  const mountDialog = (selectedGroupId = 'group-1') =>
    mount(CustomFactorManagerDialog, {
      props: {
        visible: true,
        storageKey: 'workflow.customFactorGroups.v1',
        selectedGroupId,
      },
      global: {
        directives: {
          tooltip: () => {},
        },
        stubs: {
          Dialog: createDialogStub(),
          Select: createSelectStub(),
          Button: createButtonStub(),
          InputText: {
            props: ['modelValue', 'placeholder'],
            emits: ['update:modelValue'],
            template: `
              <input
                :value="modelValue"
                :placeholder="placeholder"
                @input="$emit('update:modelValue', $event.target.value)"
              />
            `,
          },
          Textarea: {
            props: ['modelValue', 'placeholder', 'rows'],
            emits: ['update:modelValue'],
            template: `
              <textarea
                :value="modelValue"
                :placeholder="placeholder"
                :rows="rows"
                @input="$emit('update:modelValue', $event.target.value)"
              />
            `,
          },
        },
      },
    })

  it('configures ag-grid native row selection, filtering and editing', async () => {
    mountDialog()

    expect(gridReadyPayload).toMatchObject({
      defaultColDef: expect.objectContaining({
        filter: true,
        floatingFilter: true,
        editable: true,
      }),
      rowSelection: expect.objectContaining({
        mode: 'multiRow',
        checkboxes: true,
        headerCheckbox: true,
      }),
      singleClickEdit: true,
      stopEditingWhenCellsLoseFocus: true,
    })
  })

  it('supports batch row deletion and cell editing updates', async () => {
    const wrapper = mountDialog()

    expect(wrapper.get('[data-testid="ag-grid-row-summary"]').text()).toContain('温度一')
    expect(wrapper.get('[data-testid="ag-grid-row-summary"]').text()).toContain('压力一')

    await wrapper.get('[data-testid="ag-grid-edit-row"]').trigger('click')
    expect(wrapper.get('[data-testid="ag-grid-row-summary"]').text()).toContain('温度一-已修改')

    await wrapper.get('[data-testid="ag-grid-select-row"]').trigger('click')
    const deleteButton = wrapper.findAll('button').find((button) => button.text().includes('删除选中'))
    expect(deleteButton).toBeTruthy()
    await deleteButton!.trigger('click')

    // Now it should show the confirmation dialog
    const confirmDeleteButton = wrapper.findAll('button').find((button) => button.text().includes('确认删除'))
    expect(confirmDeleteButton).toBeTruthy()
    await confirmDeleteButton!.trigger('click')

    expect(wrapper.get('[data-testid="ag-grid-row-summary"]').text()).not.toContain('温度一-已修改')
  })

  it('restores persisted group selection when prop is empty or invalid', async () => {
    localStorage.setItem('workflow.customFactorGroups.v1:selectedGroupId', 'group-1')

    const wrapper = mountDialog('')
    const select = wrapper.get('select')

    expect((select.element as HTMLSelectElement).value).toBe('group-1')
  })

  it('persists selection changes and deletion fallback to localStorage', async () => {
    localStorage.setItem('workflow.customFactorGroups.v1', JSON.stringify([
      {
        id: 'group-1',
        name: '默认组',
        createdAt: '2026-05-25T10:00:00.000Z',
        updatedAt: '2026-05-25T10:00:00.000Z',
        factors: [],
      },
      {
        id: 'group-2',
        name: '备选组',
        createdAt: '2026-05-25T10:00:00.000Z',
        updatedAt: '2026-05-25T10:00:00.000Z',
        factors: [],
      },
    ]))

    const wrapper = mountDialog('group-1')
    const select = wrapper.get('select')
    await select.setValue('group-2')

    expect(localStorage.getItem('workflow.customFactorGroups.v1:selectedGroupId')).toBe('group-2')

    await wrapper.get('button[aria-label="删除配置"]').trigger('click')
    await wrapper.get('button[aria-label="确认删除"]').trigger('click')

    expect(localStorage.getItem('workflow.customFactorGroups.v1:selectedGroupId')).toBe('group-1')
    const emitted = wrapper.emitted('update:selectedGroupId')
    expect(emitted?.[emitted.length - 1]).toEqual(['group-1'])
  })

  it('renders icon toolbar actions and keeps action entry points usable', async () => {
    const wrapper = mountDialog('group-1')

    expect(wrapper.get('button[aria-label="创建配置"]').text()).toBe('')
    expect(wrapper.get('button[aria-label="复制配置"]').text()).toBe('')
    expect(wrapper.get('button[aria-label="删除配置"]').text()).toBe('')
    expect(wrapper.get('button[aria-label="导入配置"]').text()).toBe('')
    expect(wrapper.get('button[aria-label="导出配置"]').text()).toBe('')

    await wrapper.get('button[aria-label="复制配置"]').trigger('click')

    const groups = JSON.parse(localStorage.getItem('workflow.customFactorGroups.v1') || '[]')
    expect(groups).toHaveLength(2)
    expect(groups[1].name).toContain('副本')
  })

  it('reuses the same parser flow for drag and drop uploads', async () => {
    const wrapper = mountDialog('group-1')
    await wrapper.get('button[aria-label="导出配置"]').trigger('click')
    await wrapper.get('button[aria-label="复制配置"]').trigger('click')
    await wrapper.get('button[aria-label="创建配置"]').trigger('click')
    await wrapper.get('button[aria-label="取消"]').trigger('click')
    await wrapper.findAll('button').find((button) => button.text().includes('Excel 智能导入'))?.trigger('click')
    const uploadBox = wrapper.get('.custom-factor-dialog__upload-box')
    const file = new File(['factorKey,factorName'], 'factors.csv', { type: 'text/csv' })

    await uploadBox.trigger('drop', {
      dataTransfer: {
        files: [file],
      },
      preventDefault() {},
    })

    expect(parseTabularTextFileMock).toHaveBeenCalledTimes(1)
    expect(parseTabularTextFileMock).toHaveBeenCalledWith(file)
  })
})
