import { defineComponent, h } from 'vue'
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import DataChart from '../DataChart.vue'

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

const getChartOption = (wrapper: ReturnType<typeof mount>) =>
  JSON.parse(wrapper.get('[data-test="chart-option"]').attributes('data-option') || '{}')

describe('DataChart', () => {
  it('saves presets locally, applies them, and restores default preset on remount', async () => {
    localStorage.clear()

    const wrapper = mount(DataChart, {
      props: {
        data: [
          { score: 5, other: 10 },
          { score: 15, other: 11 },
          { score: 25, other: 12 },
        ],
      },
    })

    await wrapper.get('[data-test="chart-lower-bound"]').setValue('10')
    await wrapper.get('[data-test="chart-upper-bound"]').setValue('20')
    await wrapper.get('[data-test="chart-filter-presets-trigger"]').trigger('click')
    await wrapper.get('[data-test="chart-preset-save"]').trigger('click')

    expect(wrapper.get('[data-test="chart-preset-panel"]').classes()).toContain('chart-preset-popover')
    expect(wrapper.find('[data-test="chart-preset-apply"]').exists()).toBe(true)

    await wrapper.get('[data-test="chart-preset-apply"]').trigger('click')
    await wrapper.get('[data-test="chart-preset-mark-default"]').trigger('click')
    await wrapper.unmount()

    const remounted = mount(DataChart, {
      props: {
        data: [
          { score: 5, other: 10 },
          { score: 15, other: 11 },
          { score: 25, other: 12 },
        ],
      },
    })

    expect((remounted.get('[data-test="chart-lower-bound"]').element as HTMLInputElement).value).toBe(
      '10',
    )
    expect((remounted.get('[data-test="chart-upper-bound"]').element as HTMLInputElement).value).toBe(
      '20',
    )
  })

  it('supports setting default to no filter', async () => {
    localStorage.clear()

    const wrapper = mount(DataChart, {
      props: {
        data: [
          { score: 5, other: 10 },
          { score: 15, other: 11 },
        ],
      },
    })

    await wrapper.get('[data-test="chart-lower-bound"]').setValue('10')
    await wrapper.get('[data-test="chart-upper-bound"]').setValue('20')
    await wrapper.get('[data-test="chart-filter-presets-trigger"]').trigger('click')
    await wrapper.get('[data-test="chart-preset-set-no-default"]').trigger('click')
    expect(wrapper.get('[data-test="chart-preset-set-no-default"]').classes()).toContain(
      'preset-secondary-button--active',
    )
    await wrapper.unmount()

    const remounted = mount(DataChart, {
      props: {
        data: [
          { score: 5, other: 10 },
          { score: 15, other: 11 },
        ],
      },
    })

    expect((remounted.get('[data-test="chart-lower-bound"]').element as HTMLInputElement).value).toBe(
      '',
    )
    expect((remounted.get('[data-test="chart-upper-bound"]').element as HTMLInputElement).value).toBe(
      '',
    )
  })

  it('filters line chart rows by y-value lower and upper bounds', async () => {
    const wrapper = mount(DataChart, {
      props: {
        data: [
          { score: 5, other: 10 },
          { score: 15, other: 11 },
          { score: 25, other: 12 },
        ],
      },
    })

    await wrapper.get('[data-test="chart-lower-bound"]').setValue('10')
    await wrapper.get('[data-test="chart-upper-bound"]').setValue('20')

    const option = getChartOption(wrapper)

    expect(option.xAxis.data).toEqual([1])
    expect(option.series[0].data).toEqual([15])
  })

  it('uses lighter interactive settings for large line charts', () => {
    const wrapper = mount(DataChart, {
      props: {
        data: Array.from({ length: 2500 }, (_, index) => ({
          score: Math.sin(index) * 1000,
        })),
      },
    })

    const option = getChartOption(wrapper)
    const firstSeries = option.series[0]

    expect(option.tooltip.trigger).toBe('axis')
    expect(option.tooltip.axisPointer.animation).toBe(false)
    expect(firstSeries.progressive).toBeGreaterThan(0)
    expect(firstSeries.progressiveThreshold).toBeGreaterThan(0)
    expect(firstSeries.emphasis.disabled).toBe(true)
  })
})
