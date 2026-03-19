import { defineAsyncComponent } from 'vue'

export const workflowViewerRegistry = {
  'chart-viewer': defineAsyncComponent(() => import('./ChartViewer.vue')),
  'file-viewer': defineAsyncComponent(() => import('./ExportViewer.vue')),
  'report-viewer': defineAsyncComponent(() => import('./ReportViewer.vue')),
} as const

export type WorkflowViewerKey = keyof typeof workflowViewerRegistry
