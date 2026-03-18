export type WorkflowLayoutMetrics = {
  sidebarWidth: number
  logExpandedHeight: number
  logCollapsedHeight: number
  contentPadding: number
  nodeListItemPaddingClass: 'p-3' | 'p-3.5'
}

const DEFAULT_METRICS: WorkflowLayoutMetrics = {
  sidebarWidth: 340,
  logExpandedHeight: 300,
  logCollapsedHeight: 44,
  contentPadding: 24,
  nodeListItemPaddingClass: 'p-3.5',
}

const WIDESCREEN_METRICS: WorkflowLayoutMetrics = {
  sidebarWidth: 336,
  logExpandedHeight: 248,
  logCollapsedHeight: 44,
  contentPadding: 16,
  nodeListItemPaddingClass: 'p-3',
}

export const getWorkflowLayoutMetrics = (viewportWidth: number): WorkflowLayoutMetrics => {
  if (viewportWidth >= 1600) {
    return WIDESCREEN_METRICS
  }

  return DEFAULT_METRICS
}
