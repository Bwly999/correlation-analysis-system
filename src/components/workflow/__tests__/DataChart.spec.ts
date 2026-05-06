import { defineComponent, h, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import * as resultModule from '@/nodes/result'
import DataChart from '../DataChart.vue'
import { provideWorkflowOverlayHost } from '../workflowOverlayHost'

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
    props: ['modelValue', 'options', 'optionLabel', 'optionValue', 'disabled', 'appendTo'],
    emits: ['update:modelValue'],
    setup(props, { emit }) {
      return () =>
        h(
          'select',
          {
            'data-test': 'chart-type-select',
            'data-append-to-type': props.appendTo && typeof props.appendTo === 'object' ? 'element' : String(props.appendTo ?? ''),
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
    props: ['modelValue', 'options', 'appendTo'],
    emits: ['update:modelValue', 'filter'],
    setup(props, { emit }) {
      return () =>
        h(
          'select',
          {
            'data-test': 'chart-key-select',
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
          (props.options ?? []).map((option: string) => h('option', { value: option }, option)),
        )
    },
  }),
}))

vi.mock('primevue/inputnumber', () => ({
  default: defineComponent({
    name: 'PrimeInputNumberStub',
    props: ['modelValue', 'inputId', 'min', 'max', 'step', 'minFractionDigits', 'maxFractionDigits'],
    emits: ['update:modelValue'],
    setup(props, { emit }) {
      return () =>
        h('input', {
          'data-test': props.inputId ?? 'input-number',
          type: 'number',
          min: props.min,
          max: props.max,
          step: props.step,
          'data-min-fraction-digits': props.minFractionDigits,
          'data-max-fraction-digits': props.maxFractionDigits,
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

const mountWithOverlayHost = (component: any, host: HTMLElement) =>
  mount(
    defineComponent({
      components: { TestComponent: component },
      setup() {
        provideWorkflowOverlayHost({
          overlayAppendTo: host,
          teleportTarget: host,
        })
        return {
          component,
        }
      },
      template: '<TestComponent />',
    }),
  )

describe('DataChart', () => {
  it('normalizes selected line series with min-max scaling and restores the saved mode on remount', async () => {
    localStorage.clear()

    const wrapper = mount(DataChart, {
      props: {
        storageScopeKey: 'node-a',
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
    expect(localStorage.getItem('workflow-result-preview:node-a:chart-view-mode')).toBe('normalized')
    expect(localStorage.getItem('workflow-result-preview:node-a:chart-normalization-method')).toBe('min-max')

    await wrapper.unmount()

    const remounted = mount(DataChart, {
      props: {
        storageScopeKey: 'node-a',
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

    await wrapper.get('[data-test="chart-key-select"]').setValue(['score'])
    await wrapper.get('[data-test="chart-view-mode-normalized"]').trigger('click')
    await wrapper.get('[data-test="chart-normalization-method-z-score"]').trigger('click')
    await wrapper.get('[data-test="chart-lower-bound"]').setValue('15')
    await wrapper.get('[data-test="chart-upper-bound"]').setValue('25')

    const option = getChartOption(wrapper)
    expect(option.xAxis.data).toEqual([1])
    expect(option.series[0].data).toEqual([0])
    expect(option.yAxis.name).toBe('标准分值')
  })

  it('shows normalization controls for grouped boxplot charts', () => {
    localStorage.clear()

    const wrapper = mount(DataChart, {
      props: {
        data: [
          { name: 'A', data: [{ score: 1 }, { score: 2 }] },
          { name: 'B', data: [{ score: 3 }, { score: 4 }] },
        ],
      },
    })

    expect(wrapper.find('[data-test="chart-view-mode-raw"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="chart-normalization-method-min-max"]').exists()).toBe(false)
  })

  it('normalizes single-table boxplot data with min-max scaling', async () => {
    localStorage.clear()

    const wrapper = mount(DataChart, {
      props: {
        data: [
          { score: 1, cost: 10 },
          { score: 2, cost: 12 },
          { score: 3, cost: 14 },
        ],
      },
    })

    await wrapper.get('[data-test="chart-type-select"]').setValue('boxplot')
    await wrapper.get('[data-test="chart-key-select"]').setValue(['score'])
    await wrapper.get('[data-test="chart-view-mode-normalized"]').trigger('click')

    const option = getChartOption(wrapper)

    expect(option.yAxis.name).toBe('归一化值')
    expect(option.yAxis.min).toBe(0)
    expect(option.yAxis.max).toBe(1)
    expect(option.series[0].data[0].value).toEqual([0, 0, 0.5, 1, 1])
  })

  it('normalizes grouped boxplot data with min-max scaling', async () => {
    localStorage.clear()

    const wrapper = mount(DataChart, {
      props: {
        data: [
          { name: 'A', data: [{ score: 1 }, { score: 2 }, { score: 3 }] },
          { name: 'B', data: [{ score: 4 }, { score: 5 }, { score: 6 }] },
        ],
      },
    })

    await wrapper.get('[data-test="chart-key-select"]').setValue(['score'])
    await wrapper.get('[data-test="chart-view-mode-normalized"]').trigger('click')

    const option = getChartOption(wrapper)

    expect(option.yAxis.name).toBe('归一化值')
    expect(option.yAxis.min).toBe(0)
    expect(option.yAxis.max).toBe(1)
    expect(option.series[0].data).toEqual([[0, 0, 0.2, 0.4, 0.4]])
    expect(option.series[1].data).toEqual([[0.6, 0.6, 0.8, 1, 1]])
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
    expect(option.series[0].data[0].itemStyle.borderColor).not.toBe(option.series[0].data[1].itemStyle.borderColor)
    expect(option.series[0].data[0].itemStyle.color).not.toBe(option.series[0].data[1].itemStyle.color)
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

  it('discovers numeric factors from all table rows when the first row is null', () => {
    const wrapper = mount(DataChart, {
      props: {
        data: [
          { score: null, temperature: 10, note: 'cold' },
          { score: 2, temperature: 12, note: 'warm' },
        ],
      },
    })

    const options = wrapper
      .get('[data-test="chart-key-select"]')
      .findAll('option')
      .map((option) => option.text())

    expect(options).toEqual(['score', 'temperature'])
  })

  it('reuses provided table schema instead of inferring fields from all rows again', () => {
    const inferSchemaSpy = vi.spyOn(resultModule, 'inferSchemaFromRows')

    const wrapper = mount(DataChart, {
      props: {
        data: {
          kind: 'table',
          schema: {
            fields: [
              { name: 'score', type: 'number' },
              { name: 'temperature', type: 'number' },
              { name: 'label', type: 'string' },
            ],
          },
          payload: [
            { score: 1, temperature: 10, label: 'cold' },
            { score: 2, temperature: 12, label: 'warm' },
          ],
        },
      },
    })

    const options = wrapper
      .get('[data-test="chart-key-select"]')
      .findAll('option')
      .map((option) => option.text())

    expect(options).toEqual(['score', 'temperature'])
    expect(inferSchemaSpy).not.toHaveBeenCalled()
  })

  it('saves presets locally, applies them, and restores default preset on remount', async () => {
    localStorage.clear()

    const wrapper = mount(DataChart, {
      props: {
        storageScopeKey: 'node-a',
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
        storageScopeKey: 'node-a',
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
        storageScopeKey: 'node-a',
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
        storageScopeKey: 'node-a',
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

  it('configures filter bounds to accept decimal values', async () => {
    const wrapper = mount(DataChart, {
      props: {
        data: [
          { score: 1.1 },
          { score: 1.5 },
          { score: 2.2 },
        ],
      },
    })

    const lowerInput = wrapper.get('[data-test="chart-lower-bound"]')
    const upperInput = wrapper.get('[data-test="chart-upper-bound"]')

    expect(lowerInput.attributes('step')).toBe('0.01')
    expect(upperInput.attributes('step')).toBe('0.01')
    expect(lowerInput.attributes('data-max-fraction-digits')).toBe('10')
    expect(upperInput.attributes('data-max-fraction-digits')).toBe('10')

    await lowerInput.setValue('1.2')
    await upperInput.setValue('2.1')

    const option = getChartOption(wrapper)

    expect(option.xAxis.data).toEqual([1])
    expect(option.series[0].data).toEqual([1.5])
  })

  it('requires all selected factors to satisfy bounds when multiple fields are selected', async () => {
    const wrapper = mount(DataChart, {
      props: {
        data: [
          { score: 15, other: 18 },
          { score: 15, other: 30 },
          { score: null, other: 16 },
          { score: 12, other: 19 },
        ],
      },
    })

    await wrapper.get('[data-test="chart-key-select"]').setValue(['score', 'other'])
    await wrapper.get('[data-test="chart-lower-bound"]').setValue('10')
    await wrapper.get('[data-test="chart-upper-bound"]').setValue('20')

    const option = getChartOption(wrapper)

    expect(option.xAxis.data).toEqual([1, 2])
    expect(option.series[0].data).toEqual([15, 12])
    expect(option.series[1].data).toEqual([18, 19])
  })

  it('appends filtered select-all results instead of overriding previous selected factors', async () => {
    const wrapper = mount(DataChart, {
      props: {
        data: [
          { score: 15, other: 18, temp: 100 },
          { score: 12, other: 19, temp: 90 },
        ],
      },
    })

    await wrapper.get('[data-test="chart-key-select"]').setValue(['score', 'other'])

    const multiSelect = wrapper.getComponent({ name: 'PrimeMultiSelectStub' })
    multiSelect.vm.$emit('filter', { value: 'temp' })
    multiSelect.vm.$emit('update:modelValue', ['temp'])
    await nextTick()

    const option = getChartOption(wrapper)
    const seriesNames = (option.series ?? []).map((item: { name?: string }) => item.name)
    expect(seriesNames).toEqual(['score', 'other', 'temp'])
  })

  it('supports clearing all selected factors by the clear icon button', async () => {
    const wrapper = mount(DataChart, {
      props: {
        data: [
          { score: 15, other: 18 },
          { score: 12, other: 19 },
        ],
      },
    })

    await wrapper.get('[data-test="chart-key-select"]').setValue(['score', 'other'])
    await wrapper.get('[data-test="chart-key-clear-all"]').trigger('click')

    const multiSelect = wrapper.get('[data-test="chart-key-select"]')
    expect(multiSelect.element).toBeTruthy()
    const selectedValues = Array.from((multiSelect.element as HTMLSelectElement).selectedOptions).map(
      (item) => item.value,
    )
    expect(selectedValues).toEqual([])
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

  it('uses the injected overlay host for chart selects', () => {
    const host = document.createElement('div')

    const wrapper = mountWithOverlayHost(
      defineComponent({
        components: { DataChart },
        template: `<DataChart :data="[{ score: 1, cost: 10 }, { score: 2, cost: 12 }]" />`,
      }),
      host,
    )

    expect(wrapper.get('[data-test="chart-key-select"]').attributes('data-append-to-type')).toBe('element')
    expect(wrapper.get('[data-test="chart-type-select"]').attributes('data-append-to-type')).toBe('element')
  })
})
