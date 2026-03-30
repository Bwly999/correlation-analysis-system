import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent } from 'vue'
import ExportViewer from '../viewers/ExportViewer.vue'

const { mockAdd, mockExportReportElementToPdf } = vi.hoisted(() => ({
  mockAdd: vi.fn(),
  mockExportReportElementToPdf: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('primevue/usetoast', () => ({
  useToast: () => ({ add: mockAdd }),
}))

vi.mock('../reportPdfExport', () => ({
  exportReportElementToPdf: mockExportReportElementToPdf,
}))

vi.mock('../viewers/ReportViewer.vue', () => ({
  default: defineComponent({
    props: ['data', 'exportMode'],
    template: '<div data-test="report-export-stub">{{ data?.report?.title || data?.payload?.title }}</div>',
  }),
}))

describe('ExportViewer', () => {
  beforeEach(() => {
    mockAdd.mockReset()
    mockExportReportElementToPdf.mockReset()
    mockExportReportElementToPdf.mockResolvedValue(undefined)
  })

  it('renders pdf export preview only when download starts', async () => {
    let resolveExport: (() => void) | undefined
    mockExportReportElementToPdf.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveExport = resolve
        }),
    )

    const wrapper = mount(ExportViewer, {
      props: {
        data: {
          kind: 'file',
          payload: {
            filename: '相关性分析报告.pdf',
            format: 'pdf',
            contentKind: 'report-pdf',
            report: {
              title: 'Pearson 相关系数矩阵分析',
              sections: [],
            },
          },
        },
      },
    })

    expect(wrapper.find('[data-test="report-export-stub"]').exists()).toBe(false)

    const downloadPromise = wrapper.get('[data-test="file-download-button"]').trigger('click')
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[data-test="report-export-stub"]').exists()).toBe(true)

    resolveExport?.()
    await downloadPromise
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[data-test="report-export-stub"]').exists()).toBe(false)
  })

  it('triggers on-demand pdf export for report file payloads', async () => {
    const wrapper = mount(ExportViewer, {
      props: {
        data: {
          kind: 'file',
          payload: {
            filename: '相关性分析报告.pdf',
            format: 'pdf',
            contentKind: 'report-pdf',
            report: {
              title: 'Pearson 相关系数矩阵分析',
              sections: [],
            },
          },
        },
      },
    })

    await wrapper.get('[data-test="file-download-button"]').trigger('click')

    expect(mockExportReportElementToPdf).toHaveBeenCalledTimes(1)
    expect(mockExportReportElementToPdf).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      expect.objectContaining({
        filename: '相关性分析报告.pdf',
      }),
    )
  })
})
