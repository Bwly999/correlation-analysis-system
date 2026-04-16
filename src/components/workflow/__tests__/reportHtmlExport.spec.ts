import { describe, expect, it, vi } from 'vitest'
import { buildOfflineReportHtml, downloadOfflineReportHtml } from '../reportHtmlExport'

vi.mock('echarts/core', () => ({
  init: vi.fn(() => ({
    setOption: vi.fn(),
    renderToSVGString: vi.fn(() => '<svg data-test="chart-svg"></svg>'),
    dispose: vi.fn(),
  })),
  use: vi.fn(),
}))

describe('reportHtmlExport', () => {
  it('builds a self-contained offline html document for reports', async () => {
    const html = await buildOfflineReportHtml(
      {
        title: 'Pearson 相关系数矩阵分析',
        sections: [
          {
            key: 'summary',
            type: 'summary',
            title: '分析摘要',
            cards: [{ label: '样本行数', value: 128 }],
            content: '摘要正文',
          },
          {
            key: 'matrix',
            type: 'chart',
            title: '相关矩阵',
            option: {
              xAxis: { data: ['f1'] },
              yAxis: { data: ['target'] },
              series: [{ type: 'heatmap', data: [[0, 0, 0.9]] }],
            },
          },
        ],
        supplements: {
          fullReportImage: 'data:image/png;base64,full-report',
        },
      },
      {
        filename: '相关性分析报告.html',
      },
    )

    expect(html).toContain('<!DOCTYPE html>')
    expect(html).toContain('Pearson 相关系数矩阵分析')
    expect(html).toContain('分析摘要')
    expect(html).toContain('data-test="chart-svg"')
    expect(html).toContain('full-report')
  })

  it('downloads the generated html as a blob file', async () => {
    const click = vi.fn()
    const anchor = {
      href: '',
      download: '',
      click,
    }
    vi.spyOn(document, 'createElement').mockReturnValue(anchor as any)
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:offline-report')

    await downloadOfflineReportHtml(
      {
        title: '离线报告',
        sections: [],
      },
      {
        filename: '离线报告.html',
      },
    )

    expect(anchor.download).toBe('离线报告.html')
    expect(anchor.href).toBe('blob:offline-report')
    expect(click).toHaveBeenCalledTimes(1)
  })
})
