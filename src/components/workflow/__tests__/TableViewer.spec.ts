import { defineComponent, h, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import TableViewer from '../viewers/TableViewer.vue'

vi.mock('primevue/multiselect', () => ({
  default: defineComponent({
    name: 'PrimeMultiSelectStub',
    props: ['modelValue', 'options', 'optionLabel', 'optionValue', 'filter', 'display'],
    emits: ['update:modelValue'],
    setup(props, { emit }) {
      const resolveValue = (option: any) =>
        props.optionValue ? option?.[props.optionValue] : option?.value ?? option
      const resolveLabel = (option: any) =>
        props.optionLabel ? option?.[props.optionLabel] : option?.label ?? option

      return () =>
        h(
          'select',
          {
            'data-test': 'table-column-select',
            'data-filter-enabled': String(Boolean(props.filter)),
            'data-display': props.display ?? '',
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
            h(
              'option',
              {
                value: resolveValue(option),
                'data-field': resolveValue(option),
              },
              resolveLabel(option),
            ),
          ),
        )
    },
  }),
}))

vi.mock('primevue/inputnumber', () => ({
  default: defineComponent({
    name: 'PrimeInputNumberStub',
    props: ['modelValue', 'inputId', 'min', 'max', 'step', 'useGrouping', 'showButtons', 'buttonLayout', 'inputClass', 'inputStyle'],
    emits: ['update:modelValue'],
    setup(props, { emit }) {
      const hasSpinnerButtons = props.showButtons === '' || Boolean(props.showButtons)

      const updateValue = (nextValue: number | null) => {
        emit('update:modelValue', nextValue)
      }

      return () =>
        h('div', { 'data-test': 'table-width-input-wrapper' }, [
          h('input', {
            id: props.inputId,
            class: props.inputClass,
            style: props.inputStyle,
            'data-test': props.inputId ?? 'table-width-input',
            type: 'number',
            min: props.min,
            max: props.max,
            step: props.step,
            'data-show-buttons': String(hasSpinnerButtons),
            'data-button-layout': props.buttonLayout ?? '',
            value: props.modelValue ?? '',
            onInput: (event: Event) => {
              const rawValue = (event.target as HTMLInputElement).value
              updateValue(rawValue === '' ? null : Number(rawValue))
            },
          }),
          hasSpinnerButtons
            ? h(
                'div',
                { 'data-test': 'table-width-spinner-buttons' },
                [
                  h(
                    'button',
                    {
                      type: 'button',
                      'data-test': 'table-width-increment',
                      onClick: () => updateValue(Number(props.modelValue ?? 0) + Number(props.step ?? 1)),
                    },
                    '+',
                  ),
                  h(
                    'button',
                    {
                      type: 'button',
                      'data-test': 'table-width-decrement',
                      onClick: () =>
                        updateValue(Math.max(Number(props.min ?? Number.NEGATIVE_INFINITY), Number(props.modelValue ?? 0) - Number(props.step ?? 1))),
                    },
                    '-',
                  ),
                ],
              )
            : null,
        ])
    },
  }),
}))

const createRows = (count: number) =>
  Array.from({ length: count }, (_, index) => ({
    id: index,
    name: `row-${index}`,
  }))

const tooltipDirectiveStub = {
  mounted() {},
  updated() {},
  unmounted() {},
}

const mountTableViewer = (rowCount: number) =>
  mount(TableViewer, {
    props: {
      data: {
        kind: 'table',
        payload: createRows(rowCount),
      },
    },
    global: {
      directives: {
        tooltip: tooltipDirectiveStub,
      },
    },
  })

describe('TableViewer', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('paginates table rows instead of rendering all rows at once', async () => {
    const wrapper = mountTableViewer(60)

    expect(wrapper.text()).toContain('row-0')
    expect(wrapper.text()).toContain('row-49')
    expect(wrapper.text()).not.toContain('row-50')
    expect(wrapper.findAll('[data-test=\"table-row\"]')).toHaveLength(50)

    await wrapper.get('[data-test="table-next-page"]').trigger('click')

    expect(wrapper.text()).toContain('row-50')
    expect(wrapper.text()).not.toContain('row-0')
    expect(wrapper.findAll('[data-test=\"table-row\"]')).toHaveLength(10)
  })

  it('列宽输入框会限流后实时生效，并显示前后文案', async () => {
    vi.useFakeTimers()

    const wrapper = mountTableViewer(5)

    const toggle = await wrapper.get('[data-test="table-width-panel-toggle"]')
    expect(toggle.text()).toBe('')
    await toggle.trigger('click')

    const panel = await wrapper.get('[data-test="table-width-panel"]')
    const columnSelect = await panel.get('[data-test="table-column-select"]')
    expect(columnSelect.attributes('data-filter-enabled')).toBe('true')
    expect(columnSelect.attributes('data-display')).toBe('chip')
    expect(panel.text()).toContain('列宽')
    expect(panel.text()).toContain('px')
    await columnSelect.setValue(['id'])

    const widthInput = await panel.get('[data-test="table-width-input"]')
    expect(widthInput.attributes('data-show-buttons')).toBe('true')
    expect(widthInput.attributes('data-button-layout')).toBe('stacked')
    expect(widthInput.attributes('step')).toBe('10')
    await widthInput.setValue('120')
    expect(panel.get('[data-test="table-reset-widths"]').text()).toBe('')

    expect(wrapper.get('[data-test="table-column-header-id"]').attributes('data-column-width')).toBeUndefined()

    await vi.advanceTimersByTimeAsync(120)
    await nextTick()

    const idHeader = await wrapper.get('[data-test="table-column-header-id"]')
    expect(idHeader.attributes('data-column-width')).toBe('120')
    expect(wrapper.text()).toContain('row-0')
    expect(wrapper.findAll('[data-test="table-row"]')).toHaveLength(5)

    await panel.get('[data-test="table-reset-widths"]').trigger('click')
    await nextTick()

    const resetIdHeader = await wrapper.get('[data-test="table-column-header-id"]')
    expect(resetIdHeader.attributes('data-column-width')).toBeUndefined()
  })

  it('输入框右侧上下箭头会按 10 为步长调整列宽', async () => {
    vi.useFakeTimers()

    const wrapper = mountTableViewer(5)

    await wrapper.get('[data-test="table-width-panel-toggle"]').trigger('click')

    const panel = await wrapper.get('[data-test="table-width-panel"]')
    await panel.get('[data-test="table-column-select"]').setValue(['id'])
    await panel.get('[data-test="table-width-input"]').setValue('100')
    await vi.advanceTimersByTimeAsync(120)
    await nextTick()

    await panel.get('[data-test="table-width-increment"]').trigger('click')
    await vi.advanceTimersByTimeAsync(120)
    await nextTick()

    expect(wrapper.get('[data-test="table-column-header-id"]').attributes('data-column-width')).toBe(
      '110',
    )

    await panel.get('[data-test="table-width-decrement"]').trigger('click')
    await vi.advanceTimersByTimeAsync(120)
    await nextTick()

    expect(wrapper.get('[data-test="table-column-header-id"]').attributes('data-column-width')).toBe(
      '100',
    )
  })

  it('支持应用较小的列宽并同步表格内容宽度', async () => {
    vi.useFakeTimers()

    const wrapper = mountTableViewer(5)

    await wrapper.get('[data-test="table-width-panel-toggle"]').trigger('click')

    const panel = await wrapper.get('[data-test="table-width-panel"]')
    await panel.get('[data-test="table-column-select"]').setValue(['id'])
    await panel.get('[data-test="table-width-input"]').setValue('20')
    await vi.advanceTimersByTimeAsync(120)
    await nextTick()

    expect(wrapper.get('[data-test="table-column-header-id"]').attributes('data-column-width')).toBe(
      '20',
    )
    expect(wrapper.get('[data-test="table-column-header-id"]').attributes('style') ?? '').toContain(
      'padding-left: 2px',
    )
    expect(wrapper.get('[data-test="table-scroll-content"]').attributes('style') ?? '').toContain(
      'width: 180px',
    )
  })

  it('当总列宽超过容器时会保留更宽的表格内容宽度', async () => {
    vi.useFakeTimers()

    const wrapper = mountTableViewer(5)

    await wrapper.get('[data-test="table-width-panel-toggle"]').trigger('click')

    const panel = await wrapper.get('[data-test="table-width-panel"]')
    await panel.get('[data-test="table-column-select"]').setValue(['id', 'name'])
    await panel.get('[data-test="table-width-input"]').setValue('320')
    await vi.advanceTimersByTimeAsync(120)
    await nextTick()

    expect(wrapper.get('[data-test="table-scroll-content"]').attributes('style') ?? '').toContain(
      'width: 640px',
    )
  })

  it('重置列宽时不会清空当前列选择', async () => {
    vi.useFakeTimers()

    const wrapper = mountTableViewer(5)

    await wrapper.get('[data-test="table-width-panel-toggle"]').trigger('click')

    const panel = await wrapper.get('[data-test="table-width-panel"]')
    const columnSelect = await panel.get('[data-test="table-column-select"]')
    const widthInput = await panel.get('[data-test="table-width-input"]')

    await columnSelect.setValue(['id'])
    await widthInput.setValue('120')
    await vi.advanceTimersByTimeAsync(120)
    await nextTick()

    expect(wrapper.get('[data-test="table-column-header-id"]').attributes('data-column-width')).toBe(
      '120',
    )

    await panel.get('[data-test="table-reset-widths"]').trigger('click')
    await nextTick()

    expect(wrapper.get('[data-test="table-column-header-id"]').attributes('data-column-width')).toBeUndefined()

    await widthInput.setValue('140')
    await vi.advanceTimersByTimeAsync(120)
    await nextTick()

    expect(wrapper.get('[data-test="table-column-header-id"]').attributes('data-column-width')).toBe(
      '140',
    )
  })

  it('仅在列头文本被截断时启用 tooltip 标记', async () => {
    const scrollWidthSpy = vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockImplementation(function (this: HTMLElement) {
      const marker = this.getAttribute('data-test')
      if (marker === 'table-column-header-name') return 120
      if (marker === 'table-column-header-id') return 60
      return 80
    })
    const clientWidthSpy = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (this: HTMLElement) {
      const marker = this.getAttribute('data-test')
      if (marker === 'table-column-header-name') return 80
      if (marker === 'table-column-header-id') return 80
      return 80
    })

    try {
      const wrapper = mountTableViewer(5)
      await nextTick()

      const nameHeader = await wrapper.get('[data-test="table-column-header-name"]')
      const idHeader = await wrapper.get('[data-test="table-column-header-id"]')

      expect(nameHeader.attributes('data-tooltip-enabled')).toBe('true')
      expect(idHeader.attributes('data-tooltip-enabled')).toBe('false')
    } finally {
      scrollWidthSpy.mockRestore()
      clientWidthSpy.mockRestore()
    }
  })

  it('列头会渲染可拖拽的列宽调节句柄', async () => {
    const wrapper = mountTableViewer(5)

    expect(wrapper.find('.p-datatable-column-resizer').exists()).toBe(true)
  })

  it('拖拽后会更新标题栏高度', async () => {
    const wrapper = mountTableViewer(5)

    expect(wrapper.get('[data-test="table-column-header-id"]').attributes('style') ?? '').toContain(
      'height: 48px',
    )

    await wrapper.get('[data-test="table-header-height-resizer"]').trigger('mousedown', {
      clientY: 100,
    })

    window.dispatchEvent(new MouseEvent('mousemove', { clientY: 132 }))
    await nextTick()

    expect(wrapper.get('[data-test="table-column-header-id"]').attributes('style') ?? '').toContain(
      'height: 80px',
    )

    window.dispatchEvent(new MouseEvent('mouseup', { clientY: 132 }))
  })

  it('点击面板外部位置会关闭列宽面板', async () => {
    const wrapper = mountTableViewer(5)

    await wrapper.get('[data-test="table-width-panel-toggle"]').trigger('click')
    expect(wrapper.find('[data-test="table-width-panel"]').exists()).toBe(true)

    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    await nextTick()

    expect(wrapper.find('[data-test="table-width-panel"]').exists()).toBe(false)
  })
})
