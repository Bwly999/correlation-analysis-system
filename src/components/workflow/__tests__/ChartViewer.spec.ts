import { defineComponent, h } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import ChartViewer from '../viewers/ChartViewer.vue'

vi.mock('vue-echarts', () => ({
  default: defineComponent({
    name: 'VChartStub',
    props: ['option', 'autoresize'],
    setup(props) {
      return () =>
        h('div', {
          class: 'chart-host-stub',
          'data-autoresize': String(props.autoresize),
        })
    },
  }),
}))

describe('ChartViewer', () => {
  it('uses a full-height embedded layout without outer padding wrappers', () => {
    const wrapper = mount(ChartViewer, {
      props: {
        data: {
          kind: 'chart',
          payload: {
            xAxis: { type: 'category', data: ['A'] },
            yAxis: { type: 'value' },
            series: [{ type: 'bar', data: [1] }],
          },
        },
      },
    })

    const root = wrapper.get('[data-test="chart-viewer-root"]')
    expect(root.classes()).toContain('h-full')
    expect(root.classes()).toContain('min-h-0')
    expect(root.classes()).not.toContain('p-4')

    const chartHost = wrapper.get('[data-test="chart-viewer-host"]')
    expect(chartHost.classes()).toContain('min-h-0')
    expect(chartHost.classes()).toContain('flex-1')

    const chart = wrapper.get('.chart-host-stub')
    expect(chart.classes()).toContain('h-full')
    expect(chart.classes()).toContain('w-full')
    expect(chart.attributes('data-autoresize')).toBeDefined()
  })
})
