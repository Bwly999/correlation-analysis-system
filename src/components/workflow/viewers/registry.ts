import ChartViewer from './ChartViewer.vue'
import ExportViewer from './ExportViewer.vue'
import ReportViewer from './ReportViewer.vue'

export const workflowViewerRegistry = {
  'chart-viewer': ChartViewer,
  'file-viewer': ExportViewer,
  'report-viewer': ReportViewer,
} as const

export type WorkflowViewerKey = keyof typeof workflowViewerRegistry
