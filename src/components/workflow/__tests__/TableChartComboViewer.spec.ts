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

vi.mock('../viewers/TableCollectionViewer.vue', () => ({
  default: {
    props: ['data'],
    template: '<div data-test="table-collection-viewer-stub">table-collection-viewer</div>',
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
  it('uses a full-height viewer shell without outer padding wrappers', () => {
    const wrapper = mount(TableChartComboViewer, {
      props: {
        data: {
          kind: 'table',
          payload: [{ score: 1, revenue: 1000 }],
        },
      },
    })

    const root = wrapper.get('[data-test="table-chart-combo-root"]')
    expect(root.classes()).toContain('h-full')
    expect(root.classes()).toContain('min-h-0')
    expect(root.classes()).not.toContain('p-4')

    const content = wrapper.get('[data-test="table-chart-combo-content"]')
    expect(content.classes()).toContain('min-h-0')
    expect(content.classes()).toContain('flex-1')
  })

  it('persists combo mode per node storage scope and keeps nodes isolated', async () => {
    localStorage.clear()

    const sharedData = {
      kind: 'table',
      payload: [
        { score: 1, revenue: 1000 },
        { score: 2, revenue: 2000 },
      ],
    }

    const wrapper = mount(TableChartComboViewer, {
      props: {
        data: sharedData,
        storageScopeKey: 'node-a',
      },
    })

    await wrapper.get('[data-test="combo-mode-split"]').trigger('click')
    await wrapper.unmount()

    const remounted = mount(TableChartComboViewer, {
      props: {
        data: sharedData,
        storageScopeKey: 'node-a',
      },
    })

    expect(remounted.get('[data-test="combo-mode-split"]').classes()).toContain(
      'combo-mode-button--active',
    )

    const otherNode = mount(TableChartComboViewer, {
      props: {
        data: sharedData,
        storageScopeKey: 'node-b',
      },
    })

    expect(otherNode.get('[data-test="combo-mode-chart"]').classes()).toContain(
      'combo-mode-button--active',
    )
    expect(otherNode.get('[data-test="combo-mode-split"]').classes()).not.toContain(
      'combo-mode-button--active',
    )
  })

  const expectPaneMounted = (wrapper: ReturnType<typeof mount>, selector: string) => {
    expect(wrapper.find(selector).exists()).toBe(true)
  }

  const expectPaneUnmounted = (wrapper: ReturnType<typeof mount>, selector: string) => {
    expect(wrapper.find(selector).exists()).toBe(false)
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

    expectPaneMounted(wrapper, '[data-test="combo-chart-pane"]')
    expectPaneUnmounted(wrapper, '[data-test="combo-table-pane"]')
    expect(wrapper.find('[data-test="table-collection-viewer-stub"]').exists()).toBe(false)

    await wrapper.get('[data-test="combo-mode-chart"]').trigger('click')
    expectPaneMounted(wrapper, '[data-test="combo-chart-pane"]')
    expectPaneUnmounted(wrapper, '[data-test="combo-table-pane"]')

    await wrapper.get('[data-test="combo-mode-split"]').trigger('click')
    expectPaneMounted(wrapper, '[data-test="combo-table-pane"]')
    expectPaneMounted(wrapper, '[data-test="combo-chart-pane"]')

    await wrapper.get('[data-test="combo-mode-table"]').trigger('click')
    expectPaneMounted(wrapper, '[data-test="combo-table-pane"]')
    expectPaneUnmounted(wrapper, '[data-test="combo-chart-pane"]')
  })

  it('supports a data pivot mode alongside chart, table and split modes', async () => {
    const wrapper = mount(TableChartComboViewer, {
      props: {
        data: {
          kind: 'table',
          payload: [
            { score: 10, temp: 20, note: '' },
            { score: null, temp: 30, note: 'ok' },
            { score: 30, temp: 40, note: undefined },
          ],
        },
      },
    })

    const pivotButton = wrapper.get('[data-test="combo-mode-profile"]')
    expect(pivotButton.attributes('disabled')).toBeUndefined()

    await pivotButton.trigger('click')

    expectPaneMounted(wrapper, '[data-test="combo-profile-pane"]')
    expectPaneUnmounted(wrapper, '[data-test="combo-chart-pane"]')
    expectPaneUnmounted(wrapper, '[data-test="combo-table-pane"]')
    expect(wrapper.get('[data-test="data-quality-summary"]').text()).toContain('字段数')
    expect(wrapper.get('[data-test="data-quality-threshold-list"]').text()).toContain('score')
    expect(wrapper.get('[data-test="data-quality-threshold-list"]').text()).toContain('note')

    await wrapper.get('[data-test="combo-mode-table"]').trigger('click')
    expectPaneMounted(wrapper, '[data-test="combo-table-pane"]')
    expectPaneUnmounted(wrapper, '[data-test="combo-profile-pane"]')
  })

  it('keeps data pivot available when source profile metadata exists without local rows', async () => {
    const wrapper = mount(TableChartComboViewer, {
      props: {
        data: {
          kind: 'table',
          payload: [],
          meta: {
            profile: [
              {
                field: 'score',
                type: 'number',
                missingCount: 2,
                nonMissingCount: 3,
                missingRate: 0.4,
                min: 1,
                max: 3,
                mean: 2,
              },
            ],
            metrics: {
              rowCount: 5,
              fieldCount: 1,
              numericFieldCount: 1,
            },
          },
        },
      },
    })

    const pivotButton = wrapper.get('[data-test="combo-mode-profile"]')
    expect(pivotButton.attributes('disabled')).toBeUndefined()

    await pivotButton.trigger('click')

    expectPaneMounted(wrapper, '[data-test="combo-profile-pane"]')
    expect(wrapper.get('[data-test="data-quality-summary"]').text()).toContain('总行数')
    expect(wrapper.get('[data-test="data-quality-threshold-list"]').text()).toContain('score')
  })

  it('uses interactive grouped charts and grouped tables for tableCollection results', async () => {
    const wrapper = mount(TableChartComboViewer, {
      props: {
        data: {
          kind: 'tableCollection',
          payload: [
            {
              name: 'Group A',
              data: [
                { score: null, temperature: 10 },
                { score: 1, temperature: 12 },
              ],
            },
            {
              name: 'Group B',
              data: [
                { score: null, temperature: 20, onlyB: 99 },
                { score: 2, temperature: 22 },
              ],
            },
          ],
          meta: {
            chartOption: {
              xAxis: { type: 'category', data: ['Group A', 'Group B'] },
              yAxis: { type: 'value' },
              series: [{ type: 'bar', data: [1, 2] }],
            },
          },
        },
      },
    })

    expect(wrapper.html()).toContain('data-test="chart-key-select"')
    expect(wrapper.html()).not.toContain('data-test="chart-viewer-stub"')

    await wrapper.get('[data-test="combo-mode-table"]').trigger('click')

    expect(wrapper.html()).toContain('data-test="table-collection-viewer-stub"')
    expect(wrapper.html()).not.toContain('data-test="table-viewer-stub"')

    await wrapper.get('[data-test="combo-mode-split"]').trigger('click')

    expectPaneMounted(wrapper, '[data-test="combo-chart-pane"]')
    expectPaneMounted(wrapper, '[data-test="combo-table-pane"]')
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

    expect(wrapper.find('[data-test="table-viewer-stub"]').exists()).toBe(false)
    expect(wrapper.html()).not.toContain('data-test="chart-viewer-stub"')
    expect(wrapper.get('[data-test="combo-mode-chart"]').attributes('disabled')).toBeUndefined()

    await wrapper.get('[data-test="combo-mode-chart"]').trigger('click')

    expect(wrapper.html()).toContain('data-test="chart-key-select"')
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

    expectPaneUnmounted(wrapper, '[data-test="combo-table-pane"]')
    expect((wrapper.get('[data-test="chart-lower-bound"]').element as HTMLInputElement).value).toBe('')

    await wrapper.get('[data-test="chart-key-select"]').setValue(['other'])
    await wrapper.get('[data-test="input-number"]').setValue('200')
    await wrapper.get('[data-test="chart-lower-bound"]').setValue('12')
    await wrapper.get('[data-test="chart-upper-bound"]').setValue('28')

    await wrapper.get('[data-test="combo-mode-split"]').trigger('click')
    expectPaneMounted(wrapper, '[data-test="combo-table-pane"]')

    await wrapper.get('[data-test="combo-mode-chart"]').trigger('click')

    expect((wrapper.get('[data-test="input-number"]').element as HTMLInputElement).value).toBe('200')
    expect((wrapper.get('[data-test="chart-lower-bound"]').element as HTMLInputElement).value).toBe('12')
    expect((wrapper.get('[data-test="chart-upper-bound"]').element as HTMLInputElement).value).toBe('28')

    const selectedOptions = Array.from(
      (wrapper.get('[data-test="chart-key-select"]').element as HTMLSelectElement).selectedOptions,
    ).map((option) => option.value)
    expect(selectedOptions).toEqual(['other'])
  })

  it('keeps normalization settings when switching between chart and split modes', async () => {
    localStorage.clear()

    const wrapper = mount(TableChartComboViewer, {
      props: {
        data: {
          kind: 'table',
          payload: [
            { score: 1, revenue: 1000 },
            { score: 2, revenue: 2000 },
            { score: 3, revenue: 3000 },
          ],
        },
      },
    })

    await wrapper.get('[data-test="combo-mode-chart"]').trigger('click')
    await wrapper.get('[data-test="chart-view-mode-normalized"]').trigger('click')
    await wrapper.get('[data-test="chart-normalization-method-z-score"]').trigger('click')
    await wrapper.get('[data-test="combo-mode-split"]').trigger('click')
    await wrapper.get('[data-test="combo-mode-chart"]').trigger('click')

    expect(wrapper.get('[data-test="chart-view-mode-normalized"]').attributes('data-state')).toBe(
      'active',
    )
    expect(wrapper.get('[data-test="chart-normalization-method-z-score"]').attributes('data-state')).toBe(
      'active',
    )
  })
})
