import ChartViewer from './ChartViewer.vue'
import ExportViewer from './ExportViewer.vue'
import JsonViewer from './JsonViewer.vue'
import ReportViewer from './ReportViewer.vue'
import TableChartComboViewer from './TableChartComboViewer.vue'
import TableCollectionViewer from './TableCollectionViewer.vue'
import TableViewer from './TableViewer.vue'

export const workflowViewerRegistry = {
  'chart-viewer': ChartViewer,
  'file-viewer': ExportViewer,
  'json-viewer': JsonViewer,
  'report-viewer': ReportViewer,
  'table-chart-combo-viewer': TableChartComboViewer,
  'table-collection-preview': TableCollectionViewer,
  'table-preview': TableViewer,
} as const

export type WorkflowViewerKey = keyof typeof workflowViewerRegistry
