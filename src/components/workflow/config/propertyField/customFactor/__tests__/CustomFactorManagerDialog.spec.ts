import { computed, defineComponent, h, onMounted } from 'vue'
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CustomFactorManagerDialog from '../CustomFactorManagerDialog.vue'

let gridReadyPayload: Record<string, unknown> | null = null
let selectedRowsRef: Array<Record<string, unknown>> = []

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

  it('configures ag-grid native row selection, filtering and editing', async () => {
    mount(CustomFactorManagerDialog, {
      props: {
        visible: true,
        storageKey: 'workflow.customFactorGroups.v1',
        selectedGroupId: 'group-1',
      },
      global: {
        stubs: {
          Dialog: { template: '<div><slot /><slot name="footer" /></div>' },
          Select: { template: '<div><slot /></div>' },
          Button: {
            props: ['label'],
            template: '<button v-bind="$attrs"><slot name="icon" />{{ label }}<slot /></button>',
          },
          InputText: { template: '<input />' },
          Textarea: { template: '<textarea />' },
        },
      },
    })

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
    const wrapper = mount(CustomFactorManagerDialog, {
      props: {
        visible: true,
        storageKey: 'workflow.customFactorGroups.v1',
        selectedGroupId: 'group-1',
      },
      global: {
        stubs: {
          Dialog: { template: '<div><slot /><slot name="footer" /></div>' },
          Select: { template: '<div><slot /></div>' },
          Button: {
            props: ['label'],
            template: '<button v-bind="$attrs" @click="$emit(\'click\', $event)"><slot name="icon" />{{ label }}<slot /></button>',
          },
          InputText: { template: '<input />' },
          Textarea: { template: '<textarea />' },
        },
      },
    })

    expect(wrapper.get('[data-testid="ag-grid-row-summary"]').text()).toContain('温度一')
    expect(wrapper.get('[data-testid="ag-grid-row-summary"]').text()).toContain('压力一')

    await wrapper.get('[data-testid="ag-grid-edit-row"]').trigger('click')
    expect(wrapper.get('[data-testid="ag-grid-row-summary"]').text()).toContain('温度一-已修改')

    await wrapper.get('[data-testid="ag-grid-select-row"]').trigger('click')
    const deleteButton = wrapper.findAll('button').find((button) => button.text().includes('删除选中'))
    expect(deleteButton).toBeTruthy()
    await deleteButton!.trigger('click')
    expect(wrapper.get('[data-testid="ag-grid-row-summary"]').text()).not.toContain('温度一-已修改')
  })
})
