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
  it('normalizes selected line series with min-max scaling and restores the saved mode on remount', async () => {
    localStorage.clear()

    const wrapper = mount(DataChart, {
      props: {
        data: [
          { small: 1, large: 1000 },
          { small: 3, large: 3000 },
          { small: 5, large: 5000 },
        ],
      },
    })

    await wrapper.get('[data-test="chart-key-select"]').setValue(['small', 'large'])
    await wrapper.get('[data-test="chart-view-mode-normalized"]').trigger('click')

    const option = getChartOption(wrapper)
    expect(option.yAxis.min).toBe(0)
    expect(option.yAxis.max).toBe(1)
    expect(option.series[0].data).toEqual([0, 0.5, 1])
    expect(option.series[1].data).toEqual([0, 0.5, 1])
    expect(localStorage.getItem('workflow-data-chart-view-mode')).toBe('normalized')
    expect(localStorage.getItem('workflow-data-chart-normalization-method')).toBe('min-max')

    await wrapper.unmount()

    const remounted = mount(DataChart, {
      props: {
        data: [
          { small: 2, large: 2000 },
          { small: 4, large: 4000 },
        ],
      },
    })

    expect(remounted.get('[data-test="chart-view-mode-normalized"]').attributes('data-state')).toBe(
      'active',
    )
    expect(remounted.get('[data-test="chart-normalization-method-min-max"]').attributes('data-state')).toBe(
      'active',
    )
  })

  it('supports z-score normalization while keeping filtering based on raw values', async () => {
    localStorage.clear()

    const wrapper = mount(DataChart, {
      props: {
        data: [
          { score: 10, revenue: 1000 },
          { score: 20, revenue: 2000 },
          { score: 30, revenue: 3000 },
        ],
      },
    })

    await wrapper.get('[data-test="chart-key-select"]').setValue(['score', 'revenue'])
    await wrapper.get('[data-test="chart-view-mode-normalized"]').trigger('click')
    await wrapper.get('[data-test="chart-normalization-method-z-score"]').trigger('click')
    await wrapper.get('[data-test="chart-lower-bound"]').setValue('15')
    await wrapper.get('[data-test="chart-upper-bound"]').setValue('25')

    const option = getChartOption(wrapper)
    expect(option.xAxis.data).toEqual([1])
    expect(option.series[0].data).toEqual([0])
    expect(option.series[1].data).toEqual([0])
    expect(option.yAxis.name).toBe('标准分值')
  })

  it('does not show normalization controls for grouped boxplot charts', () => {
    const wrapper = mount(DataChart, {
      props: {
        data: [
          { name: 'A', data: [{ score: 1 }, { score: 2 }] },
          { name: 'B', data: [{ score: 3 }, { score: 4 }] },
        ],
      },
    })

    expect(wrapper.find('[data-test="chart-view-mode-raw"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="chart-normalization-method-min-max"]').exists()).toBe(false)
  })

  it('uses the richer grouped boxplot presentation style', async () => {
    const wrapper = mount(DataChart, {
      props: {
        data: [
          { name: 'A', data: [{ score: 1 }, { score: 2 }, { score: 3 }] },
          { name: 'B', data: [{ score: 4 }, { score: 5 }, { score: 6 }] },
        ],
      },
    })

    await wrapper.get('[data-test="chart-key-select"]').setValue(['score'])

    const option = getChartOption(wrapper)

    expect(option.legend.type).toBe('scroll')
    expect(option.legend.icon).toBe('rect')
    expect(option.legend.left).toBe('center')
    expect(option.tooltip.borderWidth).toBe(1)
    expect(option.tooltip.extraCssText).toContain('border-radius: 12px')
    expect(option.dataZoom[1].height).toBe(12)
    expect(option.series[0].itemStyle.color).toMatch(/rgba?\(/)
    expect(option.series[0].itemStyle.borderColor).toBeTruthy()
    expect(option.series[0].itemStyle.borderWidth).toBeGreaterThanOrEqual(1.5)
  })

  it('uses the richer single-table boxplot presentation style', async () => {
    const wrapper = mount(DataChart, {
      props: {
        data: [
          { score: 1, cost: 10 },
          { score: 2, cost: 12 },
          { score: 3, cost: 15 },
        ],
      },
    })

    await wrapper.get('[data-test="chart-type-select"]').setValue('boxplot')
    await wrapper.get('[data-test="chart-key-select"]').setValue(['score', 'cost'])

    const option = getChartOption(wrapper)

    expect(option.legend.type).toBe('scroll')
    expect(option.legend.icon).toBe('rect')
    expect(option.tooltip.borderWidth).toBe(1)
    expect(option.tooltip.extraCssText).toContain('border-radius: 12px')
    expect(option.series[0].itemStyle.color).toMatch(/rgba?\(/)
    expect(option.series[0].itemStyle.borderColor).toBeTruthy()
    expect(option.series[0].itemStyle.borderWidth).toBeGreaterThanOrEqual(1.5)
    expect(option.series[0].emphasis.itemStyle.borderWidth).toBeGreaterThan(2)
  })

  it('discovers grouped numeric factors from all rows and keeps only common fields across groups', () => {
    const wrapper = mount(DataChart, {
      props: {
        data: [
          {
            name: 'A',
            data: [
              { score: null, temperature: 10, onlyA: 1 },
              { score: 2, temperature: 12 },
            ],
          },
          {
            name: 'B',
            data: [
              { score: null, temperature: 20, onlyB: 9 },
              { score: 5, temperature: 24 },
            ],
          },
        ],
      },
    })

    const options = wrapper
      .get('[data-test="chart-key-select"]')
      .findAll('option')
      .map((option) => option.text())

    expect(options).toEqual(['score', 'temperature'])
  })

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

  it('anchors the preset panel beside the trigger and changes trigger style after opening', async () => {
    const wrapper = mount(DataChart, {
      props: {
        data: [
          { score: 5, other: 10 },
          { score: 15, other: 11 },
        ],
      },
    })

    const trigger = wrapper.get('[data-test="chart-filter-presets-trigger"]')

    expect(trigger.attributes('data-state')).toBe('closed')
    expect(trigger.classes()).not.toContain('preset-trigger-button--active')

    await trigger.trigger('click')

    expect(trigger.attributes('data-state')).toBe('open')
    expect(trigger.classes()).toContain('preset-trigger-button--active')

    const panel = wrapper.get('[data-test="chart-preset-panel"]')
    expect(panel.classes()).toContain('chart-preset-popover')
    expect(panel.classes()).toContain('left-full')
    expect(panel.classes()).toContain('top-0')
    expect(panel.classes()).not.toContain('right-0')
  })

  it('keeps the preset panel tall enough to show the upper controls before scrolling', async () => {
    localStorage.clear()
    localStorage.setItem(
      'workflow-data-chart-filter-presets',
      JSON.stringify(
        Array.from({ length: 20 }, (_, index) => ({
          id: `preset-${index}`,
          name: `过滤条件 ${index + 1}`,
          lowerBound: index,
          upperBound: index + 10,
          updatedAt: index + 1,
        })),
      ),
    )

    const wrapper = mount(DataChart, {
      props: {
        data: [
          { score: 5, other: 10 },
          { score: 15, other: 11 },
        ],
      },
    })

    await wrapper.get('[data-test="chart-filter-presets-trigger"]').trigger('click')

    expect(wrapper.get('[data-test="chart-preset-panel"]').classes()).toContain('max-h-[min(75vh,640px)]')
    expect(wrapper.get('[data-test="chart-preset-scroll"]').classes()).toContain('overflow-y-auto')
  })
})
