import { computed, defineComponent, h } from 'vue'
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import TableViewer from '../viewers/TableViewer.vue'

vi.mock('ag-grid-vue3', () => ({
  AgGridVue: defineComponent({
    name: 'AgGridVueStub',
    props: [
      'rowData',
      'columnDefs',
      'defaultColDef',
      'animateRows',
      'rowBuffer',
      'suppressColumnVirtualisation',
      'suppressRowVirtualisation',
      'tooltipShowDelay',
    ],
    setup(props) {
      const rowCount = computed(() => props.rowData?.length ?? 0)
      const columnCount = computed(() => props.columnDefs?.length ?? 0)

      return () =>
        h('div', {
          'data-test': 'ag-grid-stub',
          'data-row-count': String(rowCount.value),
          'data-column-count': String(columnCount.value),
          'data-default-col-def': JSON.stringify(props.defaultColDef ?? {}),
          'data-animate-rows': String(Boolean(props.animateRows)),
          'data-row-buffer': String(props.rowBuffer ?? ''),
          'data-suppress-column-virtualisation': String(Boolean(props.suppressColumnVirtualisation)),
          'data-suppress-row-virtualisation': String(Boolean(props.suppressRowVirtualisation)),
          'data-tooltip-show-delay': String(props.tooltipShowDelay ?? ''),
        })
    },
  }),
}))

const createRows = (count: number) =>
  Array.from({ length: count }, (_, index) => ({
    id: index,
    name: `row-${index}`,
  }))

const createResult = (payload: Array<Record<string, unknown>>, schemaFields?: string[]) => ({
  kind: 'table',
  payload,
  schema: schemaFields
    ? {
        fields: schemaFields.map((field) => ({ name: field })),
      }
    : undefined,
})

describe('TableViewer', () => {
  it('没有表格行时显示空态', () => {
    const wrapper = mount(TableViewer, {
      props: {
        data: createResult([]),
      },
    })

    expect(wrapper.text()).toContain('暂无表格结果')
    expect(wrapper.find('[data-test="ag-grid-stub"]').exists()).toBe(false)
  })

  it('使用整表 rowData 渲染 AG Grid，不再显示分页栏', () => {
    const wrapper = mount(TableViewer, {
      props: {
        data: createResult(createRows(120)),
      },
    })

    const grid = wrapper.get('[data-test="ag-grid-stub"]')
    expect(grid.attributes('data-row-count')).toBe('120')
    expect(wrapper.find('[data-test="table-page-size"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="table-next-page"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('共 120 条')
  })

  it('优先使用 schema 字段生成列定义', () => {
    const wrapper = mount(TableViewer, {
      props: {
        data: createResult(
          [
            { id: 1, hidden: 'x', visible: 'A' },
            { id: 2, hidden: 'y', visible: 'B' },
          ],
          ['visible', 'id'],
        ),
      },
    })

    const gridVm = wrapper.getComponent({ name: 'AgGridVueStub' }).vm as {
      columnDefs: Array<{ field?: string; headerName?: string }>
    }

    expect(gridVm.columnDefs.map((column) => column.field)).toEqual(['visible', 'id'])
    expect(wrapper.get('[data-test="ag-grid-stub"]').attributes('data-column-count')).toBe('2')
  })

  it('配置高性能默认参数并保留列宽调整能力', () => {
    const wrapper = mount(TableViewer, {
      props: {
        data: createResult(createRows(5)),
      },
    })

    const grid = wrapper.get('[data-test="ag-grid-stub"]')
    const defaultColDef = JSON.parse(grid.attributes('data-default-col-def') ?? '{}')

    expect(defaultColDef.resizable).toBe(true)
    expect(defaultColDef.sortable).toBe(false)
    expect(defaultColDef.filter).toBe(false)
    expect(defaultColDef.suppressHeaderMenuButton).toBe(true)
    expect(grid.attributes('data-animate-rows')).toBe('false')
    expect(grid.attributes('data-row-buffer')).toBe('4')
    expect(grid.attributes('data-suppress-column-virtualisation')).toBe('false')
    expect(grid.attributes('data-suppress-row-virtualisation')).toBe('false')
    expect(grid.attributes('data-tooltip-show-delay')).toBe('200')
  })

  it('null 和 undefined 单元格值会格式化为短横线', () => {
    const wrapper = mount(TableViewer, {
      props: {
        data: createResult([
          { id: null, name: undefined },
        ]),
      },
    })

    const gridVm = wrapper.getComponent({ name: 'AgGridVueStub' }).vm as {
      columnDefs: Array<{ valueFormatter?: (params: { value: unknown }) => string }>
    }

    expect(gridVm.columnDefs[0]?.valueFormatter?.({ value: null })).toBe('-')
    expect(gridVm.columnDefs[1]?.valueFormatter?.({ value: undefined })).toBe('-')
    expect(gridVm.columnDefs[1]?.valueFormatter?.({ value: 'Alice' })).toBe('Alice')
  })
})
