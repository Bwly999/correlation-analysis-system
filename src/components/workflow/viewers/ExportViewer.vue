<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { Download, CheckCircle } from 'lucide-vue-next'
import { useToast } from 'primevue/usetoast'
import { getResultFileInfo } from '../resultView'
import { exportReportElementToPdf } from '../reportPdfExport'
import ReportViewer from './ReportViewer.vue'

const props = defineProps<{
  data: any
}>()

const toast = useToast()
const fileInfo = computed(() => getResultFileInfo(props.data))
const reportExportRoot = ref<HTMLElement | null>(null)
const isExporting = ref(false)
const shouldRenderPdfPreview = ref(false)
const isOnDemandPdf = computed(
  () => fileInfo.value?.format === 'pdf' && fileInfo.value?.contentKind === 'report-pdf' && fileInfo.value?.report,
)
const reportExportData = computed(() =>
  shouldRenderPdfPreview.value && isOnDemandPdf.value && fileInfo.value?.report
    ? {
        kind: 'report',
        payload: fileInfo.value.report,
      }
    : null,
)

const handleDownload = async () => {
  if (isExporting.value) return

  if (fileInfo.value?.url) {
    const a = document.createElement('a')
    a.href = String(fileInfo.value.url)
    a.download = String(fileInfo.value.filename || 'export.csv')
    a.click()
    return
  }

  if (!isOnDemandPdf.value) {
    toast.add({
      severity: 'error',
      summary: '导出失败',
      detail: '当前结果没有可下载的导出内容。',
      life: 3000,
    })
    return
  }

  isExporting.value = true
  const exportFilename = String(fileInfo.value?.filename || '分析报告.pdf')
  toast.add({
    severity: 'info',
    summary: '正在生成 PDF',
    detail: '正在准备导出内容，请稍候。',
    life: 2000,
  })

  try {
    shouldRenderPdfPreview.value = true
    await nextTick()
    if (!reportExportRoot.value) {
      throw new Error('报告导出容器未就绪')
    }
    await exportReportElementToPdf(reportExportRoot.value, {
      filename: exportFilename,
    })
    toast.add({
      severity: 'success',
      summary: '导出成功',
      detail: 'PDF 已生成并开始下载。',
      life: 2500,
    })
  } catch (error) {
    console.error('生成报告 PDF 失败:', error)
    toast.add({
      severity: 'error',
      summary: '导出失败',
      detail: '生成 PDF 时发生错误。',
      life: 4000,
    })
  } finally {
    isExporting.value = false
    shouldRenderPdfPreview.value = false
  }
}
</script>

<template>
  <div class="h-full w-full flex items-center justify-center p-6 bg-slate-50">
    <div
      class="bg-white p-10 rounded-3xl shadow-sm border border-slate-200 flex flex-col items-center max-w-md text-center"
    >
      <div class="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center mb-6">
        <CheckCircle :size="40" class="text-emerald-500" />
      </div>

      <h2 class="text-2xl font-black text-slate-800 mb-2">数据导出就绪</h2>
      <p class="text-slate-500 mb-8 leading-relaxed">
        文件
        <strong>{{ fileInfo?.filename || 'export.csv' }}</strong>
        {{ isOnDemandPdf ? '已准备就绪，点击后将生成并下载 PDF。' : '已经成功生成，可以进行下载。' }}
      </p>

      <button
        data-test="file-download-button"
        :disabled="isExporting"
        class="flex items-center gap-3 px-8 py-4 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white rounded-xl font-bold shadow-lg shadow-indigo-200 transition-all"
        @click="handleDownload"
      >
        <Download :size="20" />
        <span>{{ isOnDemandPdf ? '生成并下载 PDF' : '立即下载文件' }}</span>
      </button>
    </div>
  </div>

  <div v-if="reportExportData" class="pointer-events-none fixed left-[-200vw] top-0 w-[1120px] opacity-0">
    <div ref="reportExportRoot" class="bg-white">
      <ReportViewer :data="reportExportData" export-mode />
    </div>
  </div>
</template>
