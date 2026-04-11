import { defineComponent, h } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import TableChartComboViewer from '../viewers/TableChartComboViewer.vue'

vi.mock('../viewers/TableViewer.vue', () => ({
  default: {
    props: ['data'],
    template: '<div data-test="table-viewer-stub">table-viewer</div>',
  },
}))

vi.mock('../viewers/ChartViewer.vue', () => ({
  default: {
    props: ['data'],
    template: '<div data-test="chart-viewer-stub">chart-viewer</div>',
  },
}))

vi.mock('vue-echarts', () => ({
  default: defineComponent({
    name: 'VChartStub',
    props: {
      option: {
        type: Object,
        required: true,
      },
    },
    setup(props) {
      return () =>
        h('div', {
          'data-test': 'chart-option',
          'data-option': JSON.stringify(props.option),
        })
    },
  }),
}))

vi.mock('primevue/select', () => ({
  default: defineComponent({
    name: 'PrimeSelectStub',
    props: ['modelValue', 'options', 'optionLabel', 'optionValue', 'disabled'],
    emits: ['update:modelValue'],
    setup(props, { emit }) {
      return () =>
        h(
          'select',
          {
            'data-test': 'chart-type-select',
            disabled: props.disabled,
            value: props.modelValue,
            onChange: (event: Event) =>
              emit('update:modelValue', (event.target as HTMLSelectElement).value),
          },
          (props.options ?? []).map((option: any) =>
            h(
              'option',
              {
                value: props.optionValue ? option[props.optionValue] : option.value,
              },
              props.optionLabel ? option[props.optionLabel] : option.label,
            ),
          ),
        )
    },
  }),
}))

vi.mock('primevue/multiselect', () => ({
  default: defineComponent({
    name: 'PrimeMultiSelectStub',
    props: ['modelValue', 'options'],
    emits: ['update:modelValue'],
    setup(props, { emit }) {
      return () =>
        h(
          'select',
          {
            'data-test': 'chart-key-select',
            multiple: true,
            value: props.modelValue,
            onChange: (event: Event) => {
              const selected = Array.from((event.target as HTMLSelectElement).selectedOptions).map(
                (option) => option.value,
              )
              emit('update:modelValue', selected)
            },
          },
          (props.options ?? []).map((option: string) => h('option', { value: option }, option)),
        )
    },
  }),
}))

vi.mock('primevue/inputnumber', () => ({
  default: defineComponent({
    name: 'PrimeInputNumberStub',
    props: ['modelValue', 'inputId', 'min', 'max'],
    emits: ['update:modelValue'],
    setup(props, { emit }) {
      return () =>
        h('input', {
          'data-test': props.inputId ?? 'input-number',
          type: 'number',
          min: props.min,
          max: props.max,
          value: props.modelValue ?? '',
          onInput: (event: Event) => {
            const rawValue = (event.target as HTMLInputElement).value
            emit('update:modelValue', rawValue === '' ? null : Number(rawValue))
          },
        })
    },
  }),
}))

describe('TableChartComboViewer', () => {
  const expectPaneVisible = (wrapper: ReturnType<typeof mount>, selector: string) => {
    expect(wrapper.get(selector).attributes('style') ?? '').not.toContain('display: none')
  }

  const expectPaneHidden = (wrapper: ReturnType<typeof mount>, selector: string) => {
    expect(wrapper.get(selector).attributes('style') ?? '').toContain('display: none')
  }

  it('supports chart, table and split modes', async () => {
    const wrapper = mount(TableChartComboViewer, {
      props: {
        data: {
          kind: 'tableCollection',
          payload: [{ name: 'Group A', data: [{ value: 1 }] }],
          meta: {
            chartOption: {
              xAxis: { type: 'category', data: ['Group A'] },
              yAxis: { type: 'value' },
              series: [{ type: 'bar', data: [1] }],
            },
          },
        },
      },
    })

    expectPaneVisible(wrapper, '[data-test="combo-chart-pane"]')
    expectPaneHidden(wrapper, '[data-test="combo-table-pane"]')

    await wrapper.get('[data-test="combo-mode-chart"]').trigger('click')
    expectPaneVisible(wrapper, '[data-test="combo-chart-pane"]')
    expectPaneHidden(wrapper, '[data-test="combo-table-pane"]')

    await wrapper.get('[data-test="combo-mode-split"]').trigger('click')
    expectPaneVisible(wrapper, '[data-test="combo-table-pane"]')
    expectPaneVisible(wrapper, '[data-test="combo-chart-pane"]')

    await wrapper.get('[data-test="combo-mode-table"]').trigger('click')
    expectPaneVisible(wrapper, '[data-test="combo-table-pane"]')
    expectPaneHidden(wrapper, '[data-test="combo-chart-pane"]')
  })

  it('enables chart mode for plain table results by using derived data charts', async () => {
    const wrapper = mount(TableChartComboViewer, {
      props: {
        data: {
          kind: 'table',
          payload: [{ value: 1, score: 2 }],
        },
      },
    })

    expect(wrapper.find('[data-test="table-viewer-stub"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="chart-viewer-stub"]').exists()).toBe(false)
    expect(wrapper.get('[data-test="combo-mode-chart"]').attributes('disabled')).toBeUndefined()

    await wrapper.get('[data-test="combo-mode-chart"]').trigger('click')

    expect(wrapper.get('[data-test="chart-key-select"]').exists()).toBe(true)
  })

  it('keeps derived chart settings when switching between chart and split modes', async () => {
    const wrapper = mount(TableChartComboViewer, {
      props: {
        data: {
          kind: 'table',
          payload: [
            { score: 5, other: 10 },
            { score: 15, other: 20 },
            { score: 25, other: 30 },
          ],
        },
      },
    })

    expectPaneHidden(wrapper, '[data-test="combo-table-pane"]')
    expect((wrapper.get('[data-test="chart-lower-bound"]').element as HTMLInputElement).value).toBe('')

    await wrapper.get('[data-test="chart-key-select"]').setValue(['other'])
    await wrapper.get('[data-test="input-number"]').setValue('200')
    await wrapper.get('[data-test="chart-lower-bound"]').setValue('12')
    await wrapper.get('[data-test="chart-upper-bound"]').setValue('28')

    await wrapper.get('[data-test="combo-mode-split"]').trigger('click')
    expectPaneVisible(wrapper, '[data-test="combo-table-pane"]')

    await wrapper.get('[data-test="combo-mode-chart"]').trigger('click')

    expect((wrapper.get('[data-test="input-number"]').element as HTMLInputElement).value).toBe('200')
    expect((wrapper.get('[data-test="chart-lower-bound"]').element as HTMLInputElement).value).toBe('12')
    expect((wrapper.get('[data-test="chart-upper-bound"]').element as HTMLInputElement).value).toBe('28')

    const selectedOptions = Array.from(
      (wrapper.get('[data-test="chart-key-select"]').element as HTMLSelectElement).selectedOptions,
    ).map((option) => option.value)
    expect(selectedOptions).toEqual(['other'])
  })
})
