import type { NodeDefinition } from '../types'
import { createFileResult, extractReportPayload, extractTableRows } from '../result'
import * as XLSX from 'xlsx'
import { resolveExportFilename } from '@/utils/exportNaming'

const createPortableReportExportPayload = (report: Record<string, unknown>) => {
  const portableReport = {
    ...report,
  }

  if (portableReport.supplements && typeof portableReport.supplements === 'object') {
    portableReport.supplements = {}
  }

  return portableReport
}

export const dataExportNode: NodeDefinition = {
  name: 'data-export',
  displayName: '数据导出',
  icon: 'download',
  category: 'terminal',
  description: '将当前节点的数据导出为 CSV、Excel、JSON，或把分析报告导出为离线 HTML。',
  properties: [
    {
      name: 'format',
      displayName: '导出格式',
      type: 'options',
      default: 'csv',
      options: [
        { name: 'CSV', value: 'csv' },
        { name: 'Excel (.xlsx)', value: 'xlsx' },
        { name: 'JSON', value: 'json' },
        { name: 'HTML（离线报告）', value: 'html' },
      ],
    },
    {
      name: 'filename',
      displayName: '文件名称',
      type: 'string',
      default: 'export_data',
      placeholder: '输入导出文件名前缀',
    },
  ],
  execute: async (input, config) => {
    const format = typeof config.format === 'string' ? config.format : 'csv'
    const report = extractReportPayload(input)

    if (format === 'html') {
      if (!report) {
        throw new Error('HTML 导出仅支持分析报告输入')
      }

      const portableReport = createPortableReportExportPayload(report)
      const reportTitle =
        typeof report.title === 'string' && report.title.trim() !== '' ? report.title : '分析报告'
      const filename = resolveExportFilename(config.filename, reportTitle, 'html', {
        appendTimestamp: true,
      })

      return createFileResult(
        {
          filename,
          format: 'html',
          contentKind: 'report-html',
          report: portableReport,
        },
        {
          meta: {
            sourceKind: 'report',
            sectionCount: Array.isArray(report.sections) ? report.sections.length : 0,
          },
          preview: {
            viewer: 'file-viewer',
            title: '导出文件',
            summary: `已准备 ${filename}，点击后将下载离线 HTML 报告。`,
          },
        },
      )
    }

    if (report) {
      throw new Error('分析报告当前仅支持 HTML 导出')
    }

    const rows = extractTableRows(input)
    if (!rows || rows.length === 0) {
      throw new Error('无输入数据')
    }

    const filename = resolveExportFilename(config.filename, 'export_data', format)
    let blob: Blob

    if (format === 'json') {
      blob = new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' })
    } else if (format === 'xlsx') {
      const worksheet = XLSX.utils.json_to_sheet(rows)
      const workbook = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(workbook, worksheet, '数据导出')
      const workbookBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' })
      blob = new Blob([workbookBuffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
    } else {
      const headers = Object.keys(rows[0] ?? {})
      const csvContent = [
        headers.join(','),
        ...rows.map((row) => headers.map((key) => JSON.stringify(row[key] ?? '')).join(',')),
      ].join('\n')
      blob = new Blob([csvContent], { type: 'text/csv' })
    }

    return createFileResult(
      {
        filename,
        url: URL.createObjectURL(blob),
        format,
      },
      {
        meta: {
          sourceKind: 'table',
          rowCount: rows.length,
        },
        preview: {
          viewer: 'file-viewer',
          title: '导出文件',
          summary: `已生成 ${filename}`,
        },
      },
    )
  },
}
