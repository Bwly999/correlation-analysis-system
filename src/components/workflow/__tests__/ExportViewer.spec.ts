import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import ExportViewer from '../viewers/ExportViewer.vue'

const { mockAdd, mockExportReportToHtmlFile } = vi.hoisted(() => ({
  mockAdd: vi.fn(),
  mockExportReportToHtmlFile: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('primevue/usetoast', () => ({
  useToast: () => ({ add: mockAdd }),
}))

vi.mock('../reportHtmlExport', () => ({
  exportReportToHtmlFile: mockExportReportToHtmlFile,
}))

describe('ExportViewer', () => {
  beforeEach(() => {
    mockAdd.mockReset()
    mockExportReportToHtmlFile.mockReset()
    mockExportReportToHtmlFile.mockResolvedValue(undefined)
  })

  it('shows offline-html copy for on-demand report exports', () => {
    const wrapper = mount(ExportViewer, {
      props: {
        data: {
          kind: 'file',
          payload: {
            filename: '相关性分析报告.html',
            format: 'html',
            contentKind: 'report-html',
            report: {
              title: 'Pearson 相关系数矩阵分析',
              sections: [],
            },
          },
        },
      },
    })

    expect(wrapper.text()).toContain('已准备就绪，点击后将下载离线 HTML 报告。')
    expect(wrapper.get('[data-test="file-download-button"]').text()).toContain('下载离线报告')
  })

  it('exports an offline html report for report file payloads', async () => {
    const wrapper = mount(ExportViewer, {
      props: {
        data: {
          kind: 'file',
          payload: {
            filename: '相关性分析报告.html',
            format: 'html',
            contentKind: 'report-html',
            report: {
              title: 'Pearson 相关系数矩阵分析',
              sections: [],
            },
          },
        },
      },
    })

    await wrapper.get('[data-test="file-download-button"]').trigger('click')

    expect(mockExportReportToHtmlFile).toHaveBeenCalledTimes(1)
    expect(mockExportReportToHtmlFile).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Pearson 相关系数矩阵分析',
        sections: [],
      }),
      expect.objectContaining({
        filename: '相关性分析报告.html',
      }),
    )
  })
})
