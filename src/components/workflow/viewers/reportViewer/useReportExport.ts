import { ref, type Ref } from 'vue'
import { useToast } from 'primevue/usetoast'
import { exportReportElementToPdf } from '../../reportPdfExport'
import { resolveExportFilename } from '@/utils/exportNaming'

interface UseReportExportOptions {
  exportRootRef: Ref<HTMLElement | null>
  reportTitle: () => string
  fullReportImage: () => string | undefined
}

export const useReportExport = ({
  exportRootRef,
  reportTitle,
  fullReportImage,
}: UseReportExportOptions) => {
  const toast = useToast()
  const isExporting = ref(false)

  const exportCurrentReport = async () => {
    if (!exportRootRef.value || isExporting.value) return

    isExporting.value = true
    toast.add({
      severity: 'info',
      summary: '正在导出当前报告',
      detail: '正在生成 PDF，请稍候。',
      life: 2000,
    })

    try {
      const filename = resolveExportFilename(undefined, reportTitle() || '分析报告', 'pdf', {
        appendTimestamp: true,
      })

      await exportReportElementToPdf(exportRootRef.value, { filename })

      toast.add({
        severity: 'success',
        summary: '导出成功',
        detail: '当前报告已导出。',
        life: 2500,
      })
    } catch (error) {
      console.error('导出当前报告失败:', error)
      toast.add({
        severity: 'error',
        summary: '导出失败',
        detail: '生成当前报告 PDF 时发生错误。',
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
