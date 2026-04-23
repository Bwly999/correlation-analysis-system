import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent } from 'vue'
import ReportViewer from '../viewers/ReportViewer.vue'
import { provideWorkflowOverlayHost } from '../workflowOverlayHost'
const { mockExportReportToHtmlFile } = vi.hoisted(() => ({
  mockExportReportToHtmlFile: vi.fn().mockResolvedValue(undefined),
}))

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

vi.mock('primevue/dialog', () => ({
  default: defineComponent({
    props: ['visible', 'appendTo'],
    emits: ['update:visible'],
    template:
      '<div v-if="visible" data-test="dialog-stub" :data-append-to-type="appendTo && typeof appendTo === \'object\' ? \'element\' : String(appendTo ?? \'\')"><slot /><slot name="header" /></div>',
  }),
}))

vi.mock('../reportHtmlExport', () => ({
  exportReportToHtmlFile: mockExportReportToHtmlFile,
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
          { name: 'f2', value: 0.5 },
          { name: 'f1', value: 0.4 },
          { name: 'f3', value: 0.3 },
        ],
      },
      {
        key: 'dependence',
        type: 'dependence',
        title: '因子趋势明细',
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
        type: 'summary',
        title: '分析摘要',
        cards: [
          { label: '样本行数', value: 128 },
          { label: 'X 字段数', value: 2 },
          { label: 'Y 字段数', value: 2 },
          { label: '风险提示数', value: 2 },
        ],
        content: '本次共分析 2 个 X 字段与 2 个 Y 字段。',
      },
      {
        key: 'matrix',
        type: 'chart',
        title: 'X / Y 相关矩阵',
        controls: {
          toggle: {
            label: '显示数值',
            modelKey: 'showHeatmapLabels',
            defaultValue: true,
          },
          labelTruncate: {
            label: '标签截断',
            modelKey: 'labelTruncateLength',
            defaultValue: 6,
          },
        },
        option: {
          visualMap: { top: 8, bottom: 'auto' },
          xAxis: { data: ['超长字段名称ABCDEF', '另一个超长字段123456'] },
          yAxis: { data: ['产线温度标签超长字段', '压力标签超长字段'] },
          series: [{ type: 'heatmap', data: [[0, 0, 0.91]], label: { show: true } }],
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
            yAxis: {
              type: 'category',
              data: ['另一个超长字段123456', '超长字段名称ABCDEF'],
            },
            series: [{ type: 'bar', data: [{ value: 0.61 }, { value: 0.25 }] }],
          },
        },
      },
      {
        key: 'risks',
        type: 'risk-list',
        title: '结果可信提示',
        items: [
          {
            level: 'warning',
            title: '样本量偏少',
            message: '当前最小成对样本量为 6，结果可能波动较大。',
          },
          {
            level: 'warning',
            title: '字段高度共线',
            message: '部分 X 字段之间高度相关，进入回归前建议结合 VIF 继续检查。',
          },
        ],
      },
      {
        key: 'details',
        type: 'text',
        title: 'X / Y 字段相关明细',
        content: '[\n  {\n    "xField": "超长字段名称ABCDEF",\n    "yField": "产线温度标签超长字段",\n    "correlation": 0.91\n  }\n]',
      },
    ],
  },
})

const createRegressionReport = () => ({
  report: {
    title: '多元线性回归分析',
    metadata: {
      targetField: 'target',
      sampleCount: 48,
      featureCount: 2,
      adjustedR2: 0.9524,
    },
    sections: [
      {
        key: 'summary',
        type: 'summary',
        title: '模型摘要',
        cards: [
          { label: '目标字段', value: 'target' },
          { label: '样本量', value: 48 },
          { label: '调整后 R²', value: 0.9524 },
        ],
      },
      {
        key: 'coefficients',
        type: 'chart',
        title: '回归系数排序',
        option: {
          xAxis: { type: 'value', name: '回归系数' },
          yAxis: { type: 'category', data: ['f1', 'f2'] },
          series: [{ type: 'bar', data: [{ value: 2.1 }, { value: 0.8 }] }],
        },
      },
      {
        key: 'predictions',
        type: 'chart',
        title: '预测值对比',
        option: {
          xAxis: { type: 'value', name: '实际值' },
          yAxis: { type: 'value', name: '预测值' },
          series: [{ type: 'scatter', data: [[10, 10.2], [12, 11.9]] }],
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
    expect(wrapper.text()).toContain('导出离线报告')
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

  it('expands shap dependence section to show all features', async () => {
    const wrapper = mount(ReportViewer, {
      props: { data: createShapReport() },
    })

    expect(wrapper.text()).toContain('因子趋势明细')
    expect(wrapper.text()).not.toContain('因子趋势: f3')

    await wrapper.get('[data-test="shap-show-all"]').trigger('click')

    expect(wrapper.text()).toContain('因子趋势: f3')
  })

  it('sorts shap dependence cards by importance ranking', () => {
    const wrapper = mount(ReportViewer, {
      props: { data: createShapReport() },
    })

    const titles = wrapper
      .findAll('[data-test="shap-dependence-card-title"]')
      .map((node) => node.text())

    expect(titles).toEqual(['因子趋势: f2', '因子趋势: f1'])
  })

  it('opens a zoomable preview modal for the backend full report image', async () => {
    const wrapper = mount(ReportViewer, {
      props: { data: createShapReport() },
    })

    expect(wrapper.find('[data-test="full-report-preview-modal"]').exists()).toBe(false)

    await wrapper.get('[data-test="full-report-image"]').trigger('click')

    expect(wrapper.get('[data-test="full-report-preview-modal"]').text()).toContain('原始整图预览')
    expect(wrapper.get('[data-test="full-report-preview-image"]').attributes('src')).toContain('full-report')
  })

  it('supports dragging the full report preview image after zooming in', async () => {
    const wrapper = mount(ReportViewer, {
      props: { data: createShapReport() },
      attachTo: document.body,
    })

    await wrapper.get('[data-test="full-report-image"]').trigger('click')
    await wrapper.get('[data-test="full-report-zoom-in"]').trigger('click')

    const previewSurface = wrapper.get('[data-test="full-report-preview-surface"]')
    const previewImage = wrapper.get('[data-test="full-report-preview-image"]')
    const beforeTransform = previewImage.attributes('style')

    await previewSurface.trigger('mousedown', { clientX: 100, clientY: 120, button: 0 })
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 160, clientY: 190 }))
    await wrapper.vm.$nextTick()

    const afterTransform = wrapper.get('[data-test="full-report-preview-image"]').attributes('style')

    expect(beforeTransform).not.toBe(afterTransform)
    expect(afterTransform).toContain('translate(60px, 70px)')
  })

  it('still allows dragging the preview image when scale is below 1', async () => {
    const wrapper = mount(ReportViewer, {
      props: { data: createShapReport() },
      attachTo: document.body,
    })

    await wrapper.get('[data-test="full-report-image"]').trigger('click')
    await wrapper.get('[data-test="full-report-zoom-out"]').trigger('click')

    const previewSurface = wrapper.get('[data-test="full-report-preview-surface"]')
    const beforeTransform = wrapper.get('[data-test="full-report-preview-image"]').attributes('style')

    await previewSurface.trigger('mousedown', { clientX: 120, clientY: 140, button: 0 })
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 170, clientY: 200 }))
    await wrapper.vm.$nextTick()

    const afterTransform = wrapper.get('[data-test="full-report-preview-image"]').attributes('style')

    expect(previewSurface.classes()).toContain('cursor-grab')
    expect(beforeTransform).not.toBe(afterTransform)
    expect(afterTransform).toContain('translate(50px, 60px)')
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
    expect(charts[0]?.attributes('data-preview-label')).toContain('产线温度标签...')
    expect(charts[1]?.attributes('data-option')).toContain('超长字段')
    expect(charts[1]?.attributes('data-preview-label')).toContain('超长字段名称...')

    const selects = wrapper.findAll('[data-test="report-select"]')
    expect(selects).toHaveLength(1)
    await selects[0]!.setValue('压力标签超长字段')

    const updatedCharts = wrapper.findAll('.chart-stub')
    expect(updatedCharts[1]?.attributes('data-option')).toContain('"value":0.61')

    const truncateInputs = wrapper.findAll('[data-test="report-label-truncate-input"]')
    expect(truncateInputs).toHaveLength(2)
    await truncateInputs[0]!.setValue('4')
    expect(wrapper.findAll('.chart-stub')[0]?.attributes('data-preview-label')).toContain('产线温度...')

    await truncateInputs[1]!.setValue('4')
    expect(wrapper.findAll('.chart-stub')[1]?.attributes('data-preview-label')).toContain('另一个超...')

    const matrixToggle = wrapper.get('[data-test="report-toggle-showHeatmapLabels"]')
    expect((matrixToggle.element as HTMLInputElement).checked).toBe(true)
    await matrixToggle.setValue(false)
    expect(wrapper.findAll('.chart-stub')[0]?.attributes('data-option')).toContain('"show":false')
  })

  it('renders correlation summary cards and risk list', () => {
    const wrapper = mount(ReportViewer, {
      props: { data: createCorrelationReport() },
    })

    expect(wrapper.text()).toContain('样本行数')
    expect(wrapper.text()).toContain('128')
    expect(wrapper.text()).toContain('风险提示数')
    expect(wrapper.text()).toContain('结果可信提示')
    expect(wrapper.text()).toContain('样本量偏少')
    expect(wrapper.text()).toContain('字段高度共线')
    expect(wrapper.findAll('[data-test="report-risk-item"]')).toHaveLength(2)
  })

  it('expands summary and risks by default but collapses correlation details by default', async () => {
    const wrapper = mount(ReportViewer, {
      props: { data: createCorrelationReport() },
    })

    expect(wrapper.get('[data-test="report-section-summary"]').attributes('data-collapsed')).toBe('false')
    expect(wrapper.get('[data-test="report-section-risks"]').attributes('data-collapsed')).toBe('false')
    expect(wrapper.get('[data-test="report-section-details"]').attributes('data-collapsed')).toBe('true')
    expect(wrapper.text()).toContain('本次共分析 2 个 X 字段与 2 个 Y 字段。')
    expect(wrapper.text()).toContain('样本量偏少')
    expect(wrapper.text()).not.toContain('"correlation": 0.91')

    await wrapper.get('[data-test="report-section-toggle-details"]').trigger('click')

    expect(wrapper.get('[data-test="report-section-details"]').attributes('data-collapsed')).toBe('false')
    expect(wrapper.text()).toContain('"correlation": 0.91')

    await wrapper.get('[data-test="report-section-toggle-details"]').trigger('click')

    expect(wrapper.get('[data-test="report-section-details"]').attributes('data-collapsed')).toBe('true')
    expect(wrapper.text()).not.toContain('"correlation": 0.91')
  })

  it('renders regression summary and chart sections with the generic report viewer', () => {
    const wrapper = mount(ReportViewer, {
      props: { data: createRegressionReport() },
    })

    expect(wrapper.text()).toContain('多元线性回归分析')
    expect(wrapper.text()).toContain('模型摘要')
    expect(wrapper.text()).toContain('调整后 R²')
    expect(wrapper.text()).toContain('回归系数排序')
    expect(wrapper.text()).toContain('预测值对比')
    expect(wrapper.findAll('.chart-stub')).toHaveLength(2)
  })

  it('exports the current report as offline html', async () => {
    const wrapper = mount(ReportViewer, {
      props: { data: createRegressionReport() },
    })

    await wrapper.get('[data-test="report-export-current"]').trigger('click')

    expect(mockExportReportToHtmlFile).toHaveBeenCalledTimes(1)
    expect(mockExportReportToHtmlFile).toHaveBeenCalledWith(
      expect.objectContaining({
        title: '多元线性回归分析',
      }),
      expect.objectContaining({
        filename: expect.stringMatching(/^多元线性回归分析.*\.html$/),
      }),
    )
  })

  it('uses the injected overlay host for the full report preview dialog', async () => {
    const host = document.createElement('div')

    const wrapper = mount(
      defineComponent({
        components: { ReportViewer },
        setup() {
          provideWorkflowOverlayHost({
            overlayAppendTo: host,
            teleportTarget: host,
          })
          return {
            data: createShapReport(),
          }
        },
        template: '<ReportViewer :data="data" />',
      }),
    )

    await wrapper.get('[data-test="full-report-image"]').trigger('click')

    expect(wrapper.get('[data-test="dialog-stub"]').attributes('data-append-to-type')).toBe('element')
  })
})
