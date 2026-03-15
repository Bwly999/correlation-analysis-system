import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import ReportViewer from '../viewers/ReportViewer.vue'

vi.mock('vue-echarts', () => ({
  default: {
    props: ['option'],
    template: '<div class="chart-stub">{{ option.series?.[0]?.type }}</div>',
  },
}))

vi.mock('primevue/usetoast', () => ({
  useToast: () => ({ add: vi.fn() }),
}))

vi.mock('html2pdf.js', () => ({
  default: () => ({
    set: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    save: vi.fn().mockResolvedValue(undefined),
  }),
}))

vi.mock('html2canvas', () => ({
  default: vi.fn().mockResolvedValue({
    toDataURL: () => 'data:image/jpeg;base64,mock',
  }),
}))

const createShapReport = () => ({
  report: {
    title: 'Xgboost + SHAP 因子贡献度分析报告',
    metadata: {
      targetField: 'target',
      sampleCount: 12,
      featureCount: 8,
      r2: 0.91,
      mae: 0.12,
    },
    sections: [
      {
        key: 'summary',
        type: 'summary',
        title: '模型摘要',
        cards: [
          { label: '目标字段', value: 'target' },
          { label: '样本量', value: 12 },
        ],
      },
      {
        key: 'importance',
        type: 'chart',
        title: '特征贡献排行',
        option: { xAxis: {}, yAxis: {}, series: [{ type: 'bar', data: [1, 2] }] },
        items: [
          { name: 'f1', value: 0.5 },
          { name: 'f2', value: 0.4 },
        ],
      },
      {
        key: 'dependence',
        type: 'dependence',
        title: '关键因子趋势',
        defaultVisibleCount: 2,
        allItems: [
          { feature: 'f1', title: '因子趋势: f1', option: { xAxis: {}, yAxis: {}, series: [{ type: 'scatter', data: [[1, 1]] }] } },
          { feature: 'f2', title: '因子趋势: f2', option: { xAxis: {}, yAxis: {}, series: [{ type: 'scatter', data: [[1, 2]] }] } },
          { feature: 'f3', title: '因子趋势: f3', option: { xAxis: {}, yAxis: {}, series: [{ type: 'scatter', data: [[1, 3]] }] } },
        ],
      },
      {
        key: 'details',
        type: 'details',
        title: '完整因子明细',
        defaultVisibleCount: 2,
        items: [
          { feature: 'f1', title: '因子趋势: f1', option: { xAxis: {}, yAxis: {}, series: [{ type: 'scatter', data: [[1, 1]] }] } },
          { feature: 'f2', title: '因子趋势: f2', option: { xAxis: {}, yAxis: {}, series: [{ type: 'scatter', data: [[1, 2]] }] } },
          { feature: 'f3', title: '因子趋势: f3', option: { xAxis: {}, yAxis: {}, series: [{ type: 'scatter', data: [[1, 3]] }] } },
        ],
      },
    ],
    supplements: {
      fullReportImage: 'data:image/png;base64,full-report',
      beeswarmImage: 'data:image/png;base64,beeswarm',
    },
  },
})

describe('ReportViewer', () => {
  it('renders shap main report sections and supplement panel', () => {
    const wrapper = mount(ReportViewer, {
      props: { data: createShapReport() },
    })

    expect(wrapper.text()).toContain('模型摘要')
    expect(wrapper.text()).toContain('目标字段')
    expect(wrapper.text()).toContain('特征贡献排行')
    expect(wrapper.text()).toContain('后端原始整图')
    expect(wrapper.text()).toContain('导出当前报告')
    expect(wrapper.text()).toContain('导出原始整图')
  })

  it('allows searching and expanding to access all shap features', async () => {
    const wrapper = mount(ReportViewer, {
      props: { data: createShapReport() },
    })

    expect(wrapper.text()).not.toContain('因子趋势: f3')

    const searchInput = wrapper.get('[data-test="shap-feature-search"]')
    await searchInput.setValue('f3')

    expect(wrapper.text()).toContain('因子趋势: f3')
  })
})
