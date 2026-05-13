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
      updateOptions: {
        type: Object,
        default: undefined,
      },
    },
    setup(props) {
      return () =>
        h('div', {
          'data-test': 'chart-option',
          'data-option': JSON.stringify(props.option),
          'data-update-options': JSON.stringify(props.updateOptions),
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

const getChartOptionObject = (wrapper: ReturnType<typeof mount>) =>
  wrapper.getComponent({ name: 'VChartStub' }).props('option') as Record<string, any>

const getChartUpdateOptions = (wrapper: ReturnType<typeof mount>) =>
  JSON.parse(wrapper.get('[data-test="chart-option"]').attributes('data-update-options') || '{}')

const getKeyOptions = (wrapper: ReturnType<typeof mount>) =>
  wrapper
    .get('[data-test="chart-key-select"]')
    .findAll('option')
    .map((option) => option.text())

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

  it('offers normal distribution charts for table data only', () => {
    const tableWrapper = mount(DataChart, {
      props: {
        data: [
          { score: 1, cost: 10 },
          { score: 2, cost: 12 },
        ],
      },
    })

    const tableChartTypes = tableWrapper
      .get('[data-test="chart-type-select"]')
      .findAll('option')
      .map((option) => option.text())

    expect(tableChartTypes).toContain('散点图')
    expect(tableChartTypes).toContain('柱状图')
    expect(tableChartTypes).toContain('正态分布')

    const groupedWrapper = mount(DataChart, {
      props: {
        data: [
          { name: 'A', data: [{ score: 1 }, { score: 2 }] },
          { name: 'B', data: [{ score: 3 }, { score: 4 }] },
        ],
      },
    })

    const groupedChartTypes = groupedWrapper
      .get('[data-test="chart-type-select"]')
      .findAll('option')
      .map((option) => option.text())

    expect(groupedChartTypes).toEqual(['多组因子对比', '多组散点图', '多组柱状图'])
  })

  it('prefers preview chart defaults when no local chart state exists', () => {
    localStorage.clear()

    const wrapper = mount(DataChart, {
      props: {
        storageScopeKey: 'chart-defaults-node',
        data: {
          kind: 'table',
          payload: [
            { group: 'A', score_mean: 92, cost_mean: 18 },
            { group: 'B', score_mean: 88, cost_mean: 21 },
          ],
          preview: {
            viewer: 'table-chart-combo-viewer',
            props: {
              chartDefaults: {
                mode: 'bar',
                xField: 'group',
                yFields: ['score_mean'],
              },
            },
          },
        },
      },
    })

    expect((wrapper.get('[data-test="chart-type-select"]').element as HTMLSelectElement).value).toBe(
      'bar',
    )
    expect(
      Array.from((wrapper.get('[data-test="chart-key-select"]').element as HTMLSelectElement).selectedOptions).map(
        (option) => option.value,
      ),
    ).toEqual(['score_mean'])

    const option = getChartOption(wrapper)
    expect(option.xAxis.type).toBe('category')
    expect(option.xAxis.data).toEqual(['A', 'B'])
    expect(option.series[0].type).toBe('bar')
    expect(option.series[0].data).toEqual([92, 88])
  })

  it('uses line charts as the fallback default even when table data contains category fields', () => {
    localStorage.clear()

    const wrapper = mount(DataChart, {
      props: {
        data: {
          kind: 'table',
          payload: [
            { group: 'A', score_mean: 92, cost_mean: 18 },
            { group: 'B', score_mean: 88, cost_mean: 21 },
          ],
        },
      },
    })

    expect((wrapper.get('[data-test="chart-type-select"]').element as HTMLSelectElement).value).toBe(
      'line',
    )
    const option = getChartOption(wrapper)
    expect(option.tooltip.trigger).toBe('axis')
    expect(option.xAxis.data).toEqual([1, 2])
    expect(option.series[0].type).toBe('line')
  })

  it('renders table scatter charts with explicit x and y field defaults', () => {
    localStorage.clear()

    const wrapper = mount(DataChart, {
      props: {
        data: {
          kind: 'table',
          payload: [
            { temperature: 10, score: 1 },
            { temperature: 20, score: 2 },
          ],
          preview: {
            viewer: 'table-chart-combo-viewer',
            props: {
              chartDefaults: {
                mode: 'scatter',
                xField: 'temperature',
                yFields: ['score'],
              },
            },
          },
        },
      },
    })

    const option = getChartOption(wrapper)
    expect((wrapper.get('[data-test="chart-type-select"]').element as HTMLSelectElement).value).toBe(
      'scatter',
    )
    expect(option.xAxis.type).toBe('value')
    expect(option.xAxis.name).toBe('temperature')
    expect(option.series[0].type).toBe('scatter')
    expect(option.series[0].data).toEqual([
      [10, 1],
      [20, 2],
    ])
  })

  it('falls back to normal distribution when preview defaults still request legacy histogram mode', () => {
    localStorage.clear()

    const wrapper = mount(DataChart, {
      props: {
        data: {
          kind: 'table',
          payload: [{ score: 1 }, { score: 2 }, { score: 2 }, { score: 3 }, { score: 5 }, { score: 8 }],
          preview: {
            viewer: 'table-chart-combo-viewer',
            props: {
              chartDefaults: {
                mode: 'histogram',
                yFields: ['score'],
              },
            },
          },
        },
      },
    })

    const option = getChartOption(wrapper)
    expect((wrapper.get('[data-test="chart-type-select"]').element as HTMLSelectElement).value).toBe(
      'normal',
    )
    expect(option.series.map((series: { type: string }) => series.type)).toEqual(['bar', 'line'])
  })

  it('migrates stored legacy histogram mode to normal distribution on first render', () => {
    localStorage.clear()
    localStorage.setItem('workflow-result-preview:legacy-histogram-node:chart-type', 'histogram')

    const wrapper = mount(DataChart, {
      props: {
        storageScopeKey: 'legacy-histogram-node',
        data: [{ score: 1 }, { score: 2 }, { score: 3 }],
      },
    })

    expect((wrapper.get('[data-test="chart-type-select"]').element as HTMLSelectElement).value).toBe(
      'normal',
    )
  })

  it('renders grouped scatter charts from preview defaults', () => {
    localStorage.clear()

    const wrapper = mount(DataChart, {
      props: {
        data: {
          kind: 'tableCollection',
          payload: [
            { name: 'A', data: [{ temperature: 10, score: 1 }, { temperature: 20, score: 2 }] },
            { name: 'B', data: [{ temperature: 15, score: 3 }, { temperature: 25, score: 4 }] },
          ],
          preview: {
            viewer: 'table-chart-combo-viewer',
            props: {
              chartDefaults: {
                mode: 'grouped-scatter',
                xField: 'temperature',
                yFields: ['score'],
              },
            },
          },
        },
      },
    })

    const option = getChartOption(wrapper)
    expect((wrapper.get('[data-test="chart-type-select"]').element as HTMLSelectElement).value).toBe(
      'grouped-scatter',
    )
    expect(option.series).toHaveLength(2)
    expect(option.series[0].type).toBe('scatter')
    expect(option.series[0].data).toEqual([
      [10, 1],
      [20, 2],
    ])
    expect(option.series[1].data).toEqual([
      [15, 3],
      [25, 4],
    ])
  })

  it('renders grouped bar charts from preview defaults', () => {
    localStorage.clear()

    const wrapper = mount(DataChart, {
      props: {
        data: {
          kind: 'tableCollection',
          payload: [
            { name: 'A', data: [{ score_mean: 92 }] },
            { name: 'B', data: [{ score_mean: 88 }] },
          ],
          preview: {
            viewer: 'table-chart-combo-viewer',
            props: {
              chartDefaults: {
                mode: 'grouped-bar',
                yFields: ['score_mean'],
              },
            },
          },
        },
      },
    })

    const option = getChartOption(wrapper)
    expect((wrapper.get('[data-test="chart-type-select"]').element as HTMLSelectElement).value).toBe(
      'grouped-bar',
    )
    expect(option.xAxis.type).toBe('category')
    expect(option.xAxis.data).toEqual(['A', 'B'])
    expect(option.series[0].type).toBe('bar')
    expect(option.series[0].data).toEqual([92, 88])
  })

  it('renders selected factors as independent normal distribution panels in two columns', async () => {
    const wrapper = mount(DataChart, {
      props: {
        data: [
          { score: 1, cost: 10, temp: 100 },
          { score: 2, cost: 12, temp: 104 },
          { score: 3, cost: 13, temp: 108 },
          { score: 4, cost: 15, temp: 112 },
          { score: 5, cost: 18, temp: 116 },
        ],
      },
    })

    await wrapper.get('[data-test="chart-type-select"]').setValue('normal')
    await wrapper.get('[data-test="chart-key-select"]').setValue(['score', 'cost', 'temp'])

    const option = getChartOption(wrapper)

    expect(option.grid).toHaveLength(3)
    expect(option.grid[0].left).toBe('6%')
    expect(option.grid[1].left).toBe('56%')
    expect(option.grid[2].left).toBe('6%')
    expect(option.xAxis.map((axis: { gridIndex: number }) => axis.gridIndex)).toEqual([0, 1, 2])
    expect(option.yAxis.map((axis: { gridIndex: number }) => axis.gridIndex)).toEqual([0, 1, 2])
    expect(option.series).toHaveLength(6)
    expect(option.series.map((series: { type: string }) => series.type)).toEqual([
      'bar',
      'line',
      'bar',
      'line',
      'bar',
      'line',
    ])
    expect(option.series.map((series: { xAxisIndex: number; yAxisIndex: number }) => [
      series.xAxisIndex,
      series.yAxisIndex,
    ])).toEqual([
      [0, 0],
      [0, 0],
      [1, 1],
      [1, 1],
      [2, 2],
      [2, 2],
    ])
  })

  it('keeps normal distribution data finite for invalid values and constant series', async () => {
    const wrapper = mount(DataChart, {
      props: {
        data: {
          kind: 'table',
          schema: {
            fields: [
              { name: 'score', type: 'number' },
              { name: 'constant', type: 'number' },
            ],
          },
          payload: [
            { score: 1, constant: 5 },
            { score: null, constant: 5 },
            { score: 'bad', constant: 5 },
          ],
        },
      },
    })

    await wrapper.get('[data-test="chart-type-select"]').setValue('normal')
    await wrapper.get('[data-test="chart-key-select"]').setValue(['score', 'constant'])

    const option = getChartOption(wrapper)
    const allPoints = option.series.flatMap((series: { data: Array<[number, number]> }) => series.data)

    expect(option.grid).toHaveLength(2)
    expect(allPoints.length).toBeGreaterThan(0)
    expect(allPoints.every(([x, y]: [number, number]) => Number.isFinite(x) && Number.isFinite(y))).toBe(true)
  })

  it('uses full option replacement to avoid vue-echarts smart replaceMerge errors when switching chart shapes', async () => {
    const wrapper = mount(DataChart, {
      props: {
        data: [
          { score: 1, cost: 10 },
          { score: 2, cost: 12 },
        ],
      },
    })

    await wrapper.get('[data-test="chart-type-select"]').setValue('normal')

    expect(getChartUpdateOptions(wrapper)).toEqual({
      notMerge: true,
      lazyUpdate: true,
    })
  })

  it('wraps tall normal distribution charts in a scrollable viewport', async () => {
    const wrapper = mount(DataChart, {
      props: {
        data: Array.from({ length: 5 }, (_, rowIndex) => ({
          factorA: rowIndex + 1,
          factorB: rowIndex + 2,
          factorC: rowIndex + 3,
          factorD: rowIndex + 4,
          factorE: rowIndex + 5,
        })),
      },
    })

    await wrapper.get('[data-test="chart-type-select"]').setValue('normal')
    await wrapper
      .get('[data-test="chart-key-select"]')
      .setValue(['factorA', 'factorB', 'factorC', 'factorD', 'factorE'])

    const viewport = wrapper.get('[data-test="chart-scroll-viewport"]')
    const host = wrapper.get('[data-test="chart-host"]')

    expect(viewport.classes()).toContain('chart-scroll-viewport')
    expect(host.attributes('style')).toContain('min-height: 900px')
  })

  it('keeps fitted normal lines from stealing frequency bar tooltips', async () => {
    const wrapper = mount(DataChart, {
      props: {
        data: [
          { score: 1 },
          { score: 2 },
          { score: 3 },
          { score: 4 },
          { score: 5 },
        ],
      },
    })

    await wrapper.get('[data-test="chart-type-select"]').setValue('normal')
    await wrapper.get('[data-test="chart-key-select"]').setValue(['score'])

    const option = getChartOption(wrapper)
    const barSeries = option.series.find((series: { type: string }) => series.type === 'bar')
    const lineSeries = option.series.find((series: { type: string }) => series.type === 'line')

    expect(option.tooltip.trigger).toBe('item')
    expect(barSeries.tooltip.show).toBe(true)
    expect(lineSeries.silent).toBe(true)
    expect(lineSeries.tooltip.show).toBe(false)
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

  it('shows single-table boxplot tooltip stats from data item values', async () => {
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
    await wrapper.get('[data-test="chart-key-select"]').setValue(['score'])

    const option = getChartOptionObject(wrapper)
    const formatter = option.tooltip.formatter as (params: Record<string, unknown>) => string
    const tooltipHtml = formatter({
      name: 'score',
      seriesName: '数据分布',
      marker: '<span></span>',
      data: option.series[0].data[0],
    })

    expect(tooltipHtml).toContain('最大值')
    expect(tooltipHtml).toContain('3')
    expect(tooltipHtml).toContain('中位数')
    expect(tooltipHtml).toContain('2')
    expect(tooltipHtml).toContain('最小值')
    expect(tooltipHtml).toContain('1')
    expect(tooltipHtml).not.toContain('--')
  })

  it('uses 1.5 IQR whiskers and renders outliers as scatter points for single-table boxplots', async () => {
    const wrapper = mount(DataChart, {
      props: {
        data: [{ score: 1 }, { score: 2 }, { score: 3 }, { score: 4 }, { score: 100 }],
      },
    })

    await wrapper.get('[data-test="chart-type-select"]').setValue('boxplot')
    await wrapper.get('[data-test="chart-key-select"]').setValue(['score'])

    const option = getChartOption(wrapper)
    const boxplotSeries = option.series.find((series: { type: string }) => series.type === 'boxplot')
    const scatterSeries = option.series.find((series: { type: string }) => series.type === 'scatter')
    const scatterValues = scatterSeries.data.map((item: { value: [number, number] }) => item.value)

    expect(boxplotSeries.data[0].value).toEqual([1, 2, 3, 4, 4])
    expect(scatterValues).toEqual([[0, 100]])
  })

  it('switches boxplot whiskers to 2% and 98% percentiles inside the chart panel', async () => {
    const wrapper = mount(DataChart, {
      props: {
        data: [{ score: 1 }, { score: 2 }, { score: 3 }, { score: 4 }, { score: 100 }],
      },
    })

    await wrapper.get('[data-test="chart-type-select"]').setValue('boxplot')
    await wrapper.get('[data-test="chart-key-select"]').setValue(['score'])

    expect(wrapper.get('[data-test="boxplot-whisker-mode-toggle"]').text()).toContain('1.5 IQR')

    await wrapper.get('[data-test="boxplot-whisker-mode-percentile"]').trigger('click')

    const option = getChartOption(wrapper)
    const boxplotSeries = option.series.find((series: { type: string }) => series.type === 'boxplot')
    const scatterSeries = option.series.find((series: { type: string }) => series.type === 'scatter')
    const scatterValues = scatterSeries.data.map((item: { value: [number, number] }) => item.value)

    expect(wrapper.get('[data-test="boxplot-whisker-mode-percentile"]').attributes('data-state')).toBe('active')
    expect(boxplotSeries.data[0].value[0]).not.toBe(1)
    expect(boxplotSeries.data[0].value[4]).not.toBe(4)
    expect(scatterValues).toEqual([
      [0, 1],
      [0, 100],
    ])
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

    expect(getKeyOptions(wrapper)).toEqual(['score', 'temperature'])
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

    expect(getKeyOptions(wrapper)).toEqual(['score', 'temperature'])
  })

  it('keeps mixed table columns selectable when they still contain renderable numeric values', () => {
    const wrapper = mount(DataChart, {
      props: {
        data: {
          kind: 'table',
          payload: [
            { score: 1, ratio: null, label: 'A' },
            { score: 'bad', ratio: 0.8, label: 'B' },
            { score: 3, ratio: undefined, label: 'C' },
          ],
        },
      },
    })

    expect(getKeyOptions(wrapper)).toEqual(['score', 'ratio'])
  })

  it('keeps grouped mixed columns selectable when each group still has renderable numeric values', () => {
    const wrapper = mount(DataChart, {
      props: {
        data: [
          {
            name: 'A',
            data: [
              { score: 1, ratio: 'bad', onlyA: 10 },
              { score: null, ratio: 0.2 },
            ],
          },
          {
            name: 'B',
            data: [
              { score: 'oops', ratio: 0.4, onlyB: 20 },
              { score: 5, ratio: null },
            ],
          },
        ],
      },
    })

    expect(getKeyOptions(wrapper)).toEqual(['score', 'ratio'])
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

  it('keeps the invalid-row toggle off by default for line charts', () => {
    const wrapper = mount(DataChart, {
      props: {
        data: [
          { score: 10 },
          { score: 'bad' },
          { score: 20 },
        ],
      },
    })

    const option = getChartOption(wrapper)

    expect(wrapper.get('[data-test="chart-skip-invalid-checkbox"]').attributes('type')).toBe('checkbox')
    expect(wrapper.get('[data-test="chart-skip-invalid-checkbox"]').element).not.toBeNull()
    expect(wrapper.get('[data-test="chart-skip-invalid-label"]').text()).toBe('异常值过滤')
    expect(wrapper.find('[data-test="chart-skip-invalid-help"]').exists()).toBe(true)
    expect((wrapper.get('[data-test="chart-skip-invalid-checkbox"]').element as HTMLInputElement).checked).toBe(false)
    expect(option.xAxis.data).toEqual([1, 2, 3])
    expect(option.series[0].data).toEqual([10, 0, 20])
  })

  it('drops invalid line rows when the invalid-row toggle is enabled', async () => {
    const wrapper = mount(DataChart, {
      props: {
        data: [
          { score: 10 },
          { score: 'bad' },
          { score: 20 },
        ],
      },
    })

    await wrapper.get('[data-test="chart-skip-invalid-checkbox"]').setValue(true)

    const option = getChartOption(wrapper)

    expect((wrapper.get('[data-test="chart-skip-invalid-checkbox"]').element as HTMLInputElement).checked).toBe(true)
    expect(option.xAxis.data).toEqual([1, 2])
    expect(option.series[0].data).toEqual([10, 20])
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

  it('drops line rows when any selected factor is invalid after enabling the invalid-row toggle', async () => {
    const wrapper = mount(DataChart, {
      props: {
        data: [
          { score: 10, other: 100 },
          { score: 20, other: 'bad' },
          { score: null, other: 300 },
          { score: 40, other: 400 },
        ],
      },
    })

    await wrapper.get('[data-test="chart-key-select"]').setValue(['score', 'other'])
    await wrapper.get('[data-test="chart-skip-invalid-checkbox"]').setValue(true)

    const option = getChartOption(wrapper)

    expect(option.xAxis.data).toEqual([1, 2])
    expect(option.series[0].data).toEqual([10, 40])
    expect(option.series[1].data).toEqual([100, 400])
  })

  it('keeps normal distribution filtering independent per factor when the invalid-row toggle is enabled', async () => {
    const wrapper = mount(DataChart, {
      props: {
        data: [
          { score: 1, cost: 10 },
          { score: 2, cost: 'bad' },
          { score: 'oops', cost: 30 },
          { score: 4, cost: 40 },
        ],
      },
    })

    await wrapper.get('[data-test="chart-type-select"]').setValue('normal')
    await wrapper.get('[data-test="chart-key-select"]').setValue(['score', 'cost'])
    await wrapper.get('[data-test="chart-skip-invalid-checkbox"]').setValue(true)

    const option = getChartOption(wrapper)
    const [scoreHistogram, , costHistogram] = option.series
    const scoreCount = scoreHistogram.data.reduce((sum: number, [, y]: [number, number]) => sum + y, 0)
    const costCount = costHistogram.data.reduce((sum: number, [, y]: [number, number]) => sum + y, 0)

    expect(scoreCount).toBe(3)
    expect(costCount).toBe(3)
  })

  it('keeps boxplot filtering independent per factor when the invalid-row toggle is enabled', async () => {
    const wrapper = mount(DataChart, {
      props: {
        data: [
          { score: 1, cost: 10 },
          { score: 2, cost: 'bad' },
          { score: 'oops', cost: 30 },
          { score: 4, cost: 40 },
        ],
      },
    })

    await wrapper.get('[data-test="chart-type-select"]').setValue('boxplot')
    await wrapper.get('[data-test="chart-key-select"]').setValue(['score', 'cost'])
    await wrapper.get('[data-test="chart-skip-invalid-checkbox"]').setValue(true)

    const option = getChartOption(wrapper)

    expect(option.series[0].data[0].value).toEqual([1, 1, 2, 4, 4])
    expect(option.series[0].data[1].value).toEqual([10, 10, 30, 40, 40])
  })

  it('restores the invalid-row toggle from local storage', async () => {
    localStorage.clear()

    const wrapper = mount(DataChart, {
      props: {
        storageScopeKey: 'node-invalid-toggle',
        data: [
          { score: 10 },
          { score: 'bad' },
          { score: 20 },
        ],
      },
    })

    await wrapper.get('[data-test="chart-skip-invalid-checkbox"]').setValue(true)
    expect(localStorage.getItem('workflow-result-preview:node-invalid-toggle:chart-skip-invalid-rows')).toBe('true')

    await wrapper.unmount()

    const remounted = mount(DataChart, {
      props: {
        storageScopeKey: 'node-invalid-toggle',
        data: [
          { score: 10 },
          { score: 'bad' },
          { score: 20 },
        ],
      },
    })

    expect((remounted.get('[data-test="chart-skip-invalid-checkbox"]').element as HTMLInputElement).checked).toBe(true)
    expect(getChartOption(remounted).series[0].data).toEqual([10, 20])
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
