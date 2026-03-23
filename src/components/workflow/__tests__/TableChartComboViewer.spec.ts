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

vi.mock('../DataChart.vue', () => ({
  default: {
    props: ['data'],
    template: '<div data-test="data-chart-stub">data-chart</div>',
  },
}))

describe('TableChartComboViewer', () => {
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

    expect(wrapper.find('[data-test="table-viewer-stub"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="chart-viewer-stub"]').exists()).toBe(true)

    await wrapper.get('[data-test="combo-mode-chart"]').trigger('click')
    expect(wrapper.find('[data-test="chart-viewer-stub"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="table-viewer-stub"]').exists()).toBe(false)

    await wrapper.get('[data-test="combo-mode-table"]').trigger('click')
    expect(wrapper.find('[data-test="table-viewer-stub"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="chart-viewer-stub"]').exists()).toBe(false)
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

    expect(wrapper.find('[data-test="data-chart-stub"]').exists()).toBe(true)
  })
})
