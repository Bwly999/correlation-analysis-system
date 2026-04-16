import { ref } from 'vue'
import { useToast } from 'primevue/usetoast'
import { exportReportToHtmlFile } from '../../reportHtmlExport'
import { resolveExportFilename } from '@/utils/exportNaming'
import type { ReportPayload } from './reportTypes'

interface UseReportExportOptions {
  reportPayload: () => ReportPayload
  reportTitle: () => string
  fullReportImage: () => string | undefined
}

export const useReportExport = ({
  reportPayload,
  reportTitle,
  fullReportImage,
}: UseReportExportOptions) => {
  const toast = useToast()
  const isExporting = ref(false)

  const exportCurrentReport = async () => {
    if (isExporting.value) return

    isExporting.value = true
    toast.add({
      severity: 'info',
      summary: '正在生成离线报告',
      detail: '将生成并下载单文件 HTML 报告。',
      life: 2000,
    })

    try {
      const filename = resolveExportFilename(undefined, reportTitle() || '分析报告', 'html', {
        appendTimestamp: true,
      })

      await exportReportToHtmlFile(reportPayload(), { filename })

      toast.add({
        severity: 'success',
        summary: '离线报告已下载',
        detail: '可直接双击 HTML 文件离线查看。',
        life: 2500,
      })
    } catch (error) {
      console.error('导出当前报告失败:', error)
      toast.add({
        severity: 'error',
        summary: '导出失败',
        detail: error instanceof Error ? error.message : '生成离线报告时发生错误。',
        life: 4000,
      })
    } finally {
      isExporting.value = false
    }
  }

  const exportOriginalImage = () => {
    const imageUrl = fullReportImage()
    if (!imageUrl) return

    const anchor = document.createElement('a')
    anchor.href = imageUrl
    anchor.download = `后端原始整图_${Date.now()}.png`
    anchor.click()
  }

  return {
    isExporting,
    exportCurrentReport,
    exportOriginalImage,
  }
}
