import { computed, defineComponent, h, nextTick, onMounted } from 'vue'
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import TableViewer from '../viewers/TableViewer.vue'
import { provideWorkflowOverlayHost } from '../workflowOverlayHost'

const gridApiCalls = vi.hoisted(() => ({
  setFilterModel: vi.fn(),
  applyColumnState: vi.fn(),
}))

const exportCalls = vi.hoisted(() => ({
  addToast: vi.fn(),
  exportTableResult: vi.fn(),
}))

vi.mock('primevue/button', () => ({
  default: defineComponent({
    name: 'PrimeButtonStub',
    inheritAttrs: false,
    props: ['label', 'disabled', 'severity', 'outlined', 'size', 'rounded', 'text'],
    emits: ['click'],
    setup(props, { attrs, emit, slots }) {
      return () =>
        h(
          'button',
          {
            ...attrs,
            type: 'button',
            disabled: props.disabled,
            onClick: (event: MouseEvent) => emit('click', event),
          },
          slots.default ? slots.default() : props.label,
        )
    },
  }),
}))

vi.mock('primevue/dialog', () => ({
  default: defineComponent({
    name: 'PrimeDialogStub',
    props: ['visible', 'header', 'modal', 'appendTo'],
    emits: ['update:visible', 'hide'],
    setup(props, { slots }) {
      return () =>
        props.visible
          ? h('div', { 'data-test': 'table-export-dialog' }, [
              h('div', { 'data-test': 'table-export-dialog-title' }, props.header ?? ''),
              slots.default?.(),
              slots.footer?.(),
            ])
          : null
    },
  }),
}))

vi.mock('primevue/inputtext', () => ({
  default: defineComponent({
    name: 'PrimeInputTextStub',
    inheritAttrs: false,
    props: ['modelValue', 'placeholder'],
    emits: ['update:modelValue'],
    setup(props, { attrs, emit }) {
      return () =>
        h('input', {
          ...attrs,
          value: props.modelValue ?? '',
          placeholder: props.placeholder,
          onInput: (event: Event) =>
            emit('update:modelValue', (event.target as HTMLInputElement).value),
        })
    },
  }),
}))

vi.mock('primevue/select', () => ({
  default: defineComponent({
    name: 'PrimeSelectStub',
    inheritAttrs: false,
    props: ['modelValue', 'options', 'optionLabel', 'optionValue', 'placeholder'],
    emits: ['update:modelValue'],
    setup(props, { attrs, emit }) {
      const resolveValue = (option: any) =>
        props.optionValue ? option?.[props.optionValue] : option?.value ?? option
      const resolveLabel = (option: any) =>
        props.optionLabel ? option?.[props.optionLabel] : option?.label ?? option

      return () =>
        h(
          'select',
          {
            ...attrs,
            value: props.modelValue ?? '',
            onChange: (event: Event) =>
              emit('update:modelValue', (event.target as HTMLSelectElement).value),
          },
          (props.options ?? []).map((option: any) =>
            h('option', { value: resolveValue(option) }, resolveLabel(option)),
          ),
        )
    },
  }),
}))

vi.mock('primevue/inputnumber', () => ({
  default: defineComponent({
    name: 'PrimeInputNumberStub',
    inheritAttrs: false,
    props: ['modelValue', 'inputId', 'min', 'step'],
    emits: ['update:modelValue'],
    setup(props, { attrs, emit }) {
      return () =>
        h('input', {
          ...attrs,
          id: props.inputId,
          type: 'number',
          min: props.min,
          step: props.step,
          value: props.modelValue ?? '',
          onInput: (event: Event) => {
            const rawValue = (event.target as HTMLInputElement).value
            emit('update:modelValue', rawValue === '' ? null : Number(rawValue))
          },
        })
    },
  }),
}))

vi.mock('primevue/multiselect', () => ({
  default: defineComponent({
    name: 'PrimeMultiSelectStub',
    inheritAttrs: false,
    props: ['modelValue', 'options', 'optionLabel', 'optionValue', 'appendTo'],
    emits: ['update:modelValue'],
    setup(props, { attrs, emit }) {
      const resolveValue = (option: any) =>
        props.optionValue ? option?.[props.optionValue] : option?.value ?? option
      const resolveLabel = (option: any) =>
        props.optionLabel ? option?.[props.optionLabel] : option?.label ?? option

      return () =>
        h(
          'select',
          {
            ...attrs,
            'data-append-to-type': props.appendTo && typeof props.appendTo === 'object' ? 'element' : String(props.appendTo ?? ''),
            multiple: true,
            value: props.modelValue,
            onChange: (event: Event) => {
              const selected = Array.from((event.target as HTMLSelectElement).selectedOptions).map(
                (option) => option.value,
              )
              emit('update:modelValue', selected)
            },
          },
          (props.options ?? []).map((option: any) =>
            h('option', { value: resolveValue(option) }, resolveLabel(option)),
          ),
        )
    },
  }),
}))

vi.mock('primevue/usetoast', () => ({
  useToast: () => ({
    add: exportCalls.addToast,
  }),
}))

vi.mock('@/utils/tableExport', () => ({
  exportTableResult: exportCalls.exportTableResult,
}))

vi.mock('ag-grid-vue3', () => ({
  AgGridVue: defineComponent({
    name: 'AgGridVueStub',
    props: [
      'rowData',
      'columnDefs',
      'defaultColDef',
      'theme',
      'quickFilterText',
      'rowHeight',
      'headerHeight',
      'animateRows',
      'rowBuffer',
      'suppressColumnVirtualisation',
      'suppressRowVirtualisation',
      'tooltipShowDelay',
      'enableCellTextSelection',
      'ensureDomOrder',
      'suppressFieldDotNotation',
    ],
    emits: ['columnResized', 'columnMoved', 'gridReady', 'sortChanged', 'filterChanged'],
    setup(props, { emit }) {
      const rowCount = computed(() => props.rowData?.length ?? 0)
      const columnCount = computed(() => props.columnDefs?.length ?? 0)

      onMounted(() => {
        emit('gridReady', {
          api: {
            setFilterModel: gridApiCalls.setFilterModel,
            applyColumnState: gridApiCalls.applyColumnState,
          },
        })
      })

      return () =>
        h('div', [
          h(
            'div',
            {
              'data-test': 'ag-grid-stub',
              'data-row-count': String(rowCount.value),
              'data-column-count': String(columnCount.value),
              'data-default-col-def': JSON.stringify(props.defaultColDef ?? {}),
              'data-theme': String(props.theme ?? ''),
              'data-quick-filter-text': String(props.quickFilterText ?? ''),
              'data-row-height': String(props.rowHeight ?? ''),
              'data-header-height': String(props.headerHeight ?? ''),
              'data-animate-rows': String(Boolean(props.animateRows)),
              'data-row-buffer': String(props.rowBuffer ?? ''),
              'data-suppress-column-virtualisation': String(Boolean(props.suppressColumnVirtualisation)),
              'data-suppress-row-virtualisation': String(Boolean(props.suppressRowVirtualisation)),
              'data-tooltip-show-delay': String(props.tooltipShowDelay ?? ''),
              'data-enable-cell-text-selection': String(Boolean(props.enableCellTextSelection)),
              'data-ensure-dom-order': String(Boolean(props.ensureDomOrder)),
              'data-suppress-field-dot-notation': String(Boolean(props.suppressFieldDotNotation)),
              onCustomColumnMove: () =>
                emit('columnMoved', {
                  finished: true,
                  api: {
                    getAllGridColumns: () => [
                      { getColId: () => 'name' },
                      { getColId: () => 'id' },
                    ],
                  },
                }),
            },
          ),
          h(
            'div',
            { 'data-test': 'ag-grid-header-actions' },
            (props.columnDefs ?? []).map((columnDef: any) => {
              const field = String(columnDef.field ?? '')
              return h(
                'button',
                {
                  type: 'button',
                  class: 'table-column-menu-trigger',
                  'data-test': `header-menu-trigger-${field}`,
                  'data-role': 'table-column-menu-trigger',
                  'data-field': field,
                },
                `menu-${field}`,
              )
            }),
          ),
        ])
    },
  }),
}))

const createRows = (count: number) =>
  Array.from({ length: count }, (_, index) => ({
    id: index,
    name: `row-${index}`,
    city: index % 2 === 0 ? 'Shanghai' : 'Beijing',
  }))

const createResult = (payload: Array<Record<string, unknown>>, schemaFields?: Array<{ name: string; type?: string }>) => ({
  kind: 'table',
  payload,
  schema: schemaFields ? { fields: schemaFields } : undefined,
})

const mountWithOverlayHost = (host: HTMLElement) =>
  mount(
    defineComponent({
      components: { TableViewer },
      setup() {
        provideWorkflowOverlayHost({
          overlayAppendTo: host,
          teleportTarget: host,
        })
        return {
          data: createResult(createRows(5)),
        }
      },
      template: '<TableViewer :data="data" />',
    }),
    { attachTo: document.body },
  )

describe('TableViewer', () => {
  it('没有表格行时显示空态', () => {
    const wrapper = mount(TableViewer, {
      props: {
        data: createResult([]),
      },
    })

    expect(wrapper.text()).toContain('暂无表格结果')
    expect(wrapper.find('[data-test="ag-grid-stub"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="table-export-trigger"]').exists()).toBe(false)
  })

  it('渲染完整工具栏、状态栏和整表 rowData', () => {
    const wrapper = mount(TableViewer, {
      props: {
        data: createResult(createRows(120)),
      },
    })

    expect(wrapper.get('[data-test="table-toolbar"]').text()).toContain('快速搜索')
    expect(wrapper.get('[data-test="table-status-bar"]').text()).toContain('总行数 120')
    expect(wrapper.get('[data-test="table-status-bar"]').text()).toContain('字段数 3')

    const grid = wrapper.get('[data-test="ag-grid-stub"]')
    expect(grid.attributes('data-row-count')).toBe('120')
    expect(wrapper.find('[data-test="table-export-trigger"]').exists()).toBe(true)
  })

  it('列名包含 "." 时按普通字段处理，不会被拆解为嵌套路径', () => {
    const rows = [
      { 'factor.code': 'A.1', 'metric.value': 0.5 },
      { 'factor.code': 'B.2', 'metric.value': 0.8 },
    ]

    const wrapper = mount(TableViewer, {
      props: {
        data: createResult(rows),
      },
    })

    const grid = wrapper.get('[data-test="ag-grid-stub"]')
    // 关键：关闭 dot notation，使 AG-Grid 把 "factor.code" 当作普通 key 访问
    expect(grid.attributes('data-suppress-field-dot-notation')).toBe('true')

    const gridVm = wrapper.getComponent({ name: 'AgGridVueStub' }).vm as {
      columnDefs: Array<{ colId?: string; field?: string }>
    }
    // 过滤掉行号列（AgGridTablePreview 在用户列前插入 colId='__row_number__' 的固定列）
    expect(
      gridVm.columnDefs
        .filter((column) => column.colId !== '__row_number__')
        .map((column) => column.field),
    ).toEqual(['factor.code', 'metric.value'])
  })

  it('点击导出按钮后可在弹窗中设置参数并直接触发下载', async () => {
    exportCalls.exportTableResult.mockReset()
    exportCalls.exportTableResult.mockResolvedValue(undefined)

    const wrapper = mount(TableViewer, {
      props: {
        data: createResult(createRows(5)),
      },
    })

    await wrapper.get('[data-test="table-export-trigger"]').trigger('click')
    expect(document.body.querySelector('[data-test="table-export-dialog"]')).not.toBeNull()

    ;(document.body.querySelector('[data-test="table-export-format"]') as HTMLSelectElement).value = 'json'
    ;(document.body.querySelector('[data-test="table-export-format"]') as HTMLSelectElement).dispatchEvent(new Event('change'))
    ;(document.body.querySelector('[data-test="table-export-filename"]') as HTMLInputElement).value = '分析结果'
    ;(document.body.querySelector('[data-test="table-export-filename"]') as HTMLInputElement).dispatchEvent(new Event('input'))
    ;(document.body.querySelector('[data-test="table-export-submit"]') as HTMLButtonElement).click()
    await nextTick()

    expect(exportCalls.exportTableResult).toHaveBeenCalledWith(
      expect.objectContaining({
        rows: createRows(5),
        format: 'json',
        filename: '分析结果',
      }),
    )
  })

  it('导出失败时展示中文错误提示', async () => {
    exportCalls.exportTableResult.mockReset()
    exportCalls.addToast.mockReset()
    exportCalls.exportTableResult.mockImplementation(() => {
      throw new Error('导出失败测试')
    })

    const wrapper = mount(TableViewer, {
      props: {
        data: createResult(createRows(5)),
      },
    })

    await wrapper.get('[data-test="table-export-trigger"]').trigger('click')
    ;(document.body.querySelector('[data-test="table-export-submit"]') as HTMLButtonElement).click()
    await nextTick()

    expect(exportCalls.addToast).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: 'error',
        summary: '导出失败',
        detail: '导出失败测试',
      }),
    )
  })

  it('快速搜索会更新 grid quick filter 并同步状态栏可见行数', async () => {
    const wrapper = mount(TableViewer, {
      props: {
        data: createResult(createRows(6)),
      },
    })

    await wrapper.get('[data-test="table-quick-filter"]').setValue('Beijing')

    const grid = wrapper.get('[data-test="ag-grid-stub"]')
    expect(grid.attributes('data-quick-filter-text')).toBe('Beijing')
    expect(wrapper.get('[data-test="table-status-bar"]').text()).toContain('可见行数 3')
  })

  it('密度切换会同步更新 grid 行高和表头高度', async () => {
    const wrapper = mount(TableViewer, {
      props: {
        data: createResult(createRows(5)),
      },
    })

    await wrapper.get('[data-test="table-density-compact"]').trigger('click')

    const grid = wrapper.get('[data-test="ag-grid-stub"]')
    expect(grid.attributes('data-row-height')).toBe('30')
    expect(grid.attributes('data-header-height')).toBe('36')
  })

  it('批量列宽会更新目标列定义宽度', async () => {
    const wrapper = mount(TableViewer, {
      props: {
        data: createResult(createRows(5)),
      },
    })

    await wrapper.get('[data-test="table-width-panel-toggle"]').trigger('click')
    await wrapper.get('[data-test="table-width-fields"]').setValue(['id', 'name'])
    await wrapper.get('[data-test="table-width-input"]').setValue('240')
    await wrapper.get('[data-test="table-apply-width"]').trigger('click')
    await nextTick()

    const gridVm = wrapper.getComponent({ name: 'AgGridVueStub' }).vm as {
      columnDefs: Array<{ field?: string; width?: number }>
    }

    expect(gridVm.columnDefs.find((column) => column.field === 'id')?.width).toBe(240)
    expect(gridVm.columnDefs.find((column) => column.field === 'name')?.width).toBe(240)
  })

  it('列管理支持隐藏、固定和恢复默认视图', async () => {
    const wrapper = mount(TableViewer, {
      props: {
        data: createResult(createRows(5)),
      },
    })

    await wrapper.get('[data-test="table-column-panel-toggle"]').trigger('click')
    await wrapper.get('[data-test="table-hide-column-name"]').trigger('click')
    await wrapper.get('[data-test="table-pin-column-id-left"]').trigger('click')
    await nextTick()

    let gridVm = wrapper.getComponent({ name: 'AgGridVueStub' }).vm as {
      columnDefs: Array<{ field?: string; hide?: boolean; pinned?: string | null }>
    }

    expect(gridVm.columnDefs.find((column) => column.field === 'name')?.hide).toBe(true)
    expect(gridVm.columnDefs.find((column) => column.field === 'id')?.pinned).toBe('left')

    await wrapper.get('[data-test="table-reset-view"]').trigger('click')
    await nextTick()

    gridVm = wrapper.getComponent({ name: 'AgGridVueStub' }).vm as {
      columnDefs: Array<{ field?: string; hide?: boolean; pinned?: string | null }>
    }
    expect(gridVm.columnDefs.find((column) => column.field === 'name')?.hide).toBe(false)
    expect(gridVm.columnDefs.find((column) => column.field === 'id')?.pinned).toBeUndefined()
  })

  it('列头三点菜单支持固定、自动列宽、列显隐和重置', async () => {
    const wrapper = mount(TableViewer, {
      props: {
        data: createResult(createRows(5)),
      },
    })

    await wrapper.get('[data-test="header-menu-trigger-name"]').trigger('click')
    expect(document.body.querySelector('[data-test="table-column-menu"]')).not.toBeNull()

    ;(document.body.querySelector('[data-test="table-column-menu-pin-left"]') as HTMLButtonElement).click()
    await nextTick()

    let gridVm = wrapper.getComponent({ name: 'AgGridVueStub' }).vm as {
      columnDefs: Array<{ field?: string; pinned?: string | null; width?: number; hide?: boolean }>
    }
    expect(gridVm.columnDefs.find((column) => column.field === 'name')?.pinned).toBe('left')

    await wrapper.get('[data-test="header-menu-trigger-name"]').trigger('click')
    ;(
      document.body.querySelector('[data-test="table-column-menu-auto-size-current"]') as HTMLButtonElement
    ).click()
    await nextTick()

    gridVm = wrapper.getComponent({ name: 'AgGridVueStub' }).vm as {
      columnDefs: Array<{ field?: string; pinned?: string | null; width?: number; hide?: boolean }>
    }
    expect(gridVm.columnDefs.find((column) => column.field === 'name')?.width).not.toBe(160)

    await wrapper.get('[data-test="header-menu-trigger-name"]').trigger('click')
    ;(
      document.body.querySelector('[data-test="table-column-menu-toggle-columns"]') as HTMLButtonElement
    ).click()
    await nextTick()
    ;(
      document.body.querySelector('[data-test="table-column-menu-visibility-name"]') as HTMLLabelElement
    ).click()
    await nextTick()

    gridVm = wrapper.getComponent({ name: 'AgGridVueStub' }).vm as {
      columnDefs: Array<{ field?: string; pinned?: string | null; width?: number; hide?: boolean }>
    }
    expect(gridVm.columnDefs.find((column) => column.field === 'name')?.hide).toBe(true)

    ;(document.body.querySelector('[data-test="table-column-menu-reset"]') as HTMLButtonElement).click()
    await nextTick()

    gridVm = wrapper.getComponent({ name: 'AgGridVueStub' }).vm as {
      columnDefs: Array<{ field?: string; pinned?: string | null; width?: number; hide?: boolean }>
    }
    expect(gridVm.columnDefs.find((column) => column.field === 'name')?.hide).toBe(false)
    expect(gridVm.columnDefs.find((column) => column.field === 'name')?.pinned).toBeUndefined()
  })

  it('拖动列顺序后会同步更新列定义顺序', async () => {
    const wrapper = mount(TableViewer, {
      props: {
        data: createResult(createRows(5)),
      },
    })

    wrapper.getComponent({ name: 'AgGridVueStub' }).vm.$emit('columnMoved', {
      finished: true,
      api: {
        getAllGridColumns: () => [
          { getColId: () => 'name' },
          { getColId: () => 'id' },
          { getColId: () => 'city' },
        ],
      },
    })
    await nextTick()

    const gridVm = wrapper.getComponent({ name: 'AgGridVueStub' }).vm as {
      columnDefs: Array<{ colId?: string; field?: string }>
    }

    // 过滤掉行号列后再校验用户列顺序
    expect(
      gridVm.columnDefs
        .filter((column) => column.colId !== '__row_number__')
        .slice(0, 2)
        .map((column) => column.field),
    ).toEqual(['name', 'id'])
  })

  it('默认开启排序、筛选、列拖动和高性能配置', () => {
    const wrapper = mount(TableViewer, {
      props: {
        data: createResult(createRows(5), [
          { name: 'id', type: 'number' },
          { name: 'name', type: 'string' },
          { name: 'city', type: 'string' },
        ]),
      },
    })

    const grid = wrapper.get('[data-test="ag-grid-stub"]')
    const defaultColDef = JSON.parse(grid.attributes('data-default-col-def') ?? '{}')
    const gridVm = wrapper.getComponent({ name: 'AgGridVueStub' }).vm as {
      columnDefs: Array<{ colId?: string; field?: string; filter?: unknown; suppressMovable?: boolean }>
    }

    expect(defaultColDef.resizable).toBe(true)
    expect(defaultColDef.sortable).toBe(true)
    expect(defaultColDef.filter).toBe(true)
    expect(defaultColDef.floatingFilter).toBe(false)
    // 行号列 suppressMovable=true 是预期的（固定列），只校验用户列可拖动
    expect(
      gridVm.columnDefs
        .filter((column) => column.colId !== '__row_number__')
        .every((column) => column.suppressMovable !== true),
    ).toBe(true)
    expect(gridVm.columnDefs.find((column) => column.field === 'id')?.filter).toBe('agNumberColumnFilter')
    // ag-grid v33 起 theme 改为传入主题对象（themeQuartz），不再用字符串 'legacy'，
    // 这里仅断言高性能相关配置
    expect(grid.attributes('data-animate-rows')).toBe('false')
    expect(grid.attributes('data-row-buffer')).toBe('4')
    expect(grid.attributes('data-enable-cell-text-selection')).toBe('true')
    expect(grid.attributes('data-ensure-dom-order')).toBe('true')
  })

  it('persists density and column layout per node scope but does not persist quick filter text', async () => {
    localStorage.clear()

    const wrapper = mount(TableViewer, {
      props: {
        data: createResult(createRows(5)),
        storageScopeKey: 'node-a',
      },
    })

    await wrapper.get('[data-test="table-density-compact"]').trigger('click')
    await wrapper.get('[data-test="table-column-panel-toggle"]').trigger('click')
    await wrapper.get('[data-test="table-hide-column-name"]').trigger('click')
    await wrapper.get('[data-test="table-quick-filter"]').setValue('Beijing')
    await wrapper.unmount()

    const remounted = mount(TableViewer, {
      props: {
        data: createResult(createRows(5)),
        storageScopeKey: 'node-a',
      },
    })

    const gridVm = remounted.getComponent({ name: 'AgGridVueStub' }).vm as {
      columnDefs: Array<{ field?: string; hide?: boolean }>
      rowHeight: number
    }

    expect(gridVm.rowHeight).toBe(30)
    expect(gridVm.columnDefs.find((column) => column.field === 'name')?.hide).toBe(true)
    expect(remounted.get('[data-test="ag-grid-stub"]').attributes('data-quick-filter-text')).toBe('')

    const otherNode = mount(TableViewer, {
      props: {
        data: createResult(createRows(5)),
        storageScopeKey: 'node-b',
      },
    })

    const otherGridVm = otherNode.getComponent({ name: 'AgGridVueStub' }).vm as {
      columnDefs: Array<{ field?: string; hide?: boolean }>
      rowHeight: number
    }

    expect(otherGridVm.rowHeight).toBe(36)
    expect(otherGridVm.columnDefs.find((column) => column.field === 'name')?.hide).toBe(false)
  })

  it('replays persisted grid sort and filter models on remount', async () => {
    localStorage.clear()
    gridApiCalls.setFilterModel.mockReset()
    gridApiCalls.applyColumnState.mockReset()
    localStorage.setItem(
      'workflow-result-preview:node-a:table-sort-model',
      JSON.stringify([{ colId: 'name', sort: 'asc', sortIndex: 0 }]),
    )
    localStorage.setItem(
      'workflow-result-preview:node-a:table-filter-model',
      JSON.stringify({
        id: { filterType: 'number', type: 'greaterThan', filter: 2 },
      }),
    )

    mount(TableViewer, {
      props: {
        data: createResult(createRows(5)),
        storageScopeKey: 'node-a',
      },
    })

    expect(gridApiCalls.applyColumnState).toHaveBeenCalledWith(
      expect.objectContaining({
        state: expect.arrayContaining([expect.objectContaining({ colId: 'name', sort: 'asc' })]),
      }),
    )
    expect(gridApiCalls.setFilterModel).toHaveBeenCalledWith({
      id: { filterType: 'number', type: 'greaterThan', filter: 2 },
    })
  })

  it('uses the injected overlay host for the width multiselect and column menu teleport', async () => {
    const host = document.createElement('div')
    host.setAttribute('data-test', 'overlay-host')
    document.body.appendChild(host)

    const wrapper = mountWithOverlayHost(host)

    await wrapper.get('[data-test="table-width-panel-toggle"]').trigger('click')
    expect(wrapper.get('[data-test="table-width-fields"]').attributes('data-append-to-type')).toBe('element')

    await wrapper.get('[data-test="header-menu-trigger-name"]').trigger('click')
    expect(host.querySelector('[data-test="table-column-menu"]')).not.toBeNull()
    expect(document.body.querySelector('[data-test="table-column-menu"]')).not.toBeNull()
  })
})
