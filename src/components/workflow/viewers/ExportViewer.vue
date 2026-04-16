<script setup lang="ts">
import { computed, ref } from 'vue'
import { Download, CheckCircle } from 'lucide-vue-next'
import { useToast } from 'primevue/usetoast'
import { getResultFileInfo } from '../resultView'
import { exportReportToHtmlFile } from '../reportHtmlExport'
import type { ReportPayload } from './reportViewer/reportTypes'

const props = defineProps<{
  data: any
}>()

const toast = useToast()
const fileInfo = computed(() => getResultFileInfo(props.data))
const reportPayload = computed<ReportPayload | null>(() => {
  const report = fileInfo.value?.report
  return report && typeof report === 'object' ? (report as ReportPayload) : null
})
const isExporting = ref(false)
const isOnDemandReport = computed(
  () =>
    String(fileInfo.value?.contentKind || '') === 'report-html' &&
    !!reportPayload.value,
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

  if (!isOnDemandReport.value) {
    toast.add({
      severity: 'error',
      summary: '导出失败',
      detail: '当前结果没有可下载的导出内容。',
      life: 3000,
    })
    return
  }

  isExporting.value = true
  const fallbackFilename = String(fileInfo.value?.filename || '分析报告.html')
  const report = reportPayload.value
  if (!report) {
    isExporting.value = false
    toast.add({
      severity: 'error',
      summary: '导出失败',
      detail: '当前结果缺少可导出的报告内容。',
      life: 3000,
    })
    return
  }
  toast.add({
    severity: 'info',
    summary: '正在生成离线报告',
    detail: '将生成并下载单文件 HTML 报告。',
    life: 2000,
  })

  try {
    await exportReportToHtmlFile(report, {
      filename: fallbackFilename,
    })
    toast.add({
      severity: 'success',
      summary: '离线报告已下载',
      detail: '可直接双击 HTML 文件离线查看。',
      life: 2500,
    })
  } catch (error) {
    console.error('生成离线报告失败:', error)
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
        {{ isOnDemandReport ? '已准备就绪，点击后将下载离线 HTML 报告。' : '已经成功生成，可以进行下载。' }}
      </p>

      <button
        data-test="file-download-button"
        :disabled="isExporting"
        class="flex items-center gap-3 px-8 py-4 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white rounded-xl font-bold shadow-lg shadow-indigo-200 transition-all"
        @click="handleDownload"
      >
        <Download :size="20" />
        <span>{{ isOnDemandReport ? '下载离线报告' : '立即下载文件' }}</span>
      </button>
    </div>
  </div>
</template>
