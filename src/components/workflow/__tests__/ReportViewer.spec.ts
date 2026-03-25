import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent } from 'vue'
import ReportViewer from '../viewers/ReportViewer.vue'

vi.mock('vue-echarts', () => ({
  default: defineComponent({
    props: ['option'],
    computed: {
      previewLabel(this: any): string {
        const yAxis = this.option?.yAxis
        const axis = Array.isArray(yAxis) ? yAxis[0] : yAxis
        const firstLabel = axis?.data?.[0]
        const formatter = axis?.axisLabel?.formatter
        return typeof formatter === 'function' ? String(formatter(firstLabel)) : String(firstLabel ?? '')
      },
    },
    template:
      '<div class="chart-stub" :data-option="JSON.stringify(option)" :data-preview-label="previewLabel">{{ option.series?.[0]?.type }}</div>',
  }),
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

const createCorrelationReport = () => ({
  report: {
    title: 'Pearson 相关系数矩阵分析',
    metadata: {
      currentYField: '产线温度标签超长字段',
    },
    sections: [
      {
        key: 'summary',
        type: 'text',
        title: '分析摘要',
        content: '本次共分析 2 个 X 字段与 2 个 Y 字段。',
      },
      {
        key: 'matrix',
        type: 'chart',
        title: 'X / Y 相关矩阵',
        option: {
          visualMap: { top: 8, bottom: 'auto' },
          xAxis: { data: ['超长字段名称ABCDEF', '另一个超长字段123456'] },
          yAxis: { data: ['产线温度标签超长字段', '压力标签超长字段'] },
          series: [{ type: 'heatmap', data: [[0, 0, 0.91]] }],
        },
      },
      {
        key: 'ranking',
        type: 'chart',
        title: 'Y 字段相关性排行',
        controls: {
          select: {
            label: '当前 Y',
            modelKey: 'rankingYField',
            options: ['产线温度标签超长字段', '压力标签超长字段'],
          },
          labelTruncate: {
            label: '标签截断',
            modelKey: 'labelTruncateLength',
            defaultValue: 6,
          },
        },
        optionMap: {
          产线温度标签超长字段: {
            xAxis: { type: 'value', name: 'Pearson r' },
            yAxis: { type: 'category', data: ['超长字段名称ABCDEF', '另一个超长字段123456'] },
            series: [{ type: 'bar', data: [{ value: 0.91 }, { value: -0.82 }] }],
          },
          压力标签超长字段: {
            xAxis: { type: 'value', name: 'Pearson r' },
            yAxis: { type: 'category', data: ['超长字段名称ABCDEF', '另一个超长字段123456'] },
            series: [{ type: 'bar', data: [{ value: 0.25 }, { value: 0.61 }] }],
          },
        },
      },
    ],
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

  it('supports correlation chart Y switching and axis label truncation', async () => {
    const wrapper = mount(ReportViewer, {
      props: { data: createCorrelationReport() },
      global: {
        stubs: {
          Select: {
            props: ['modelValue', 'options', 'optionLabel', 'optionValue'],
            emits: ['update:modelValue'],
            template:
              '<select data-test="report-select" :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value)"><option v-for="option in options" :key="typeof option === \'string\' ? option : option.value" :value="typeof option === \'string\' ? option : option.value">{{ typeof option === \'string\' ? option : option.label }}</option></select>',
          },
        },
      },
    })

    const charts = wrapper.findAll('.chart-stub')
    expect(charts).toHaveLength(2)
    expect(charts[0]?.attributes('data-option')).toContain('"top":8')
    expect(charts[1]?.attributes('data-option')).toContain('超长字段')
    expect(charts[1]?.attributes('data-preview-label')).toContain('超长字段名称...')

    const selects = wrapper.findAll('[data-test="report-select"]')
    expect(selects).toHaveLength(1)
    await selects[0]!.setValue('压力标签超长字段')

    const updatedCharts = wrapper.findAll('.chart-stub')
    expect(updatedCharts[1]?.attributes('data-option')).toContain('"value":0.61')

    const truncateInput = wrapper.get('[data-test="report-label-truncate-input"]')
    await truncateInput.setValue('4')
    expect(wrapper.findAll('.chart-stub')[1]?.attributes('data-preview-label')).toContain('超长字段...')
  })
})
