import { defineAsyncComponent } from 'vue'

export const workflowViewerRegistry = {
  'chart-viewer': defineAsyncComponent(() => import('./ChartViewer.vue')),
  'file-viewer': defineAsyncComponent(() => import('./ExportViewer.vue')),
  'json-viewer': defineAsyncComponent(() => import('./JsonViewer.vue')),
  'report-viewer': defineAsyncComponent(() => import('./ReportViewer.vue')),
  'table-chart-combo-viewer': defineAsyncComponent(() => import('./TableChartComboViewer.vue')),
  'table-collection-preview': defineAsyncComponent(() => import('./TableCollectionViewer.vue')),
  'table-preview': defineAsyncComponent(() => import('./TableViewer.vue')),
} as const

export type WorkflowViewerKey = keyof typeof workflowViewerRegistry
