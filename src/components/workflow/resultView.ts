import {
  extractTableCollectionGroups,
  extractTableRows,
  inferSchemaFromRows,
  isNodeResult,
  isPlainObject,
  normalizeNodeResult,
  type FieldSchema,
  type NodeResult,
} from '@/nodes/result'

const legacyViewerMap: Record<string, string> = {
  report: 'report-viewer',
  chart: 'chart-viewer',
  export: 'file-viewer',
}

export const normalizeWorkflowResult = (value: unknown): NodeResult | null => {
  if (!isNodeResult(value)) return null
  return normalizeNodeResult(value)
}

export const getResultViewerKey = (value: unknown) => {
  const normalized = normalizeWorkflowResult(value)
  if (normalized?.preview?.viewer) return normalized.preview.viewer

  if (isPlainObject(value) && typeof value.viewType === 'string') {
    return legacyViewerMap[value.viewType] ?? value.viewType
  }

  return null
}

export const getResultRows = (value: unknown) => extractTableRows(value) ?? []

export const getResultGroups = (value: unknown) => extractTableCollectionGroups(value) ?? []

export const getResultSchemaFields = (value: unknown): FieldSchema[] => {
  const normalized = normalizeWorkflowResult(value)
  if (normalized?.schema?.fields?.length) return normalized.schema.fields

  const rows = getResultRows(value)
  if (rows.length === 0) return []

  return inferSchemaFromRows(rows).fields ?? []
}

export const getResultReport = (value: unknown) => {
  const normalized = normalizeWorkflowResult(value)
  if (normalized?.kind === 'report' && isPlainObject(normalized.payload)) {
    return normalized.payload
  }

  if (isPlainObject(value) && isPlainObject(value.report)) {
    return value.report
  }

  return null
}

export const getResultChartOption = (value: unknown) => {
  const normalized = normalizeWorkflowResult(value)
  if (normalized?.kind === 'chart' && isPlainObject(normalized.payload)) {
    return normalized.payload
  }

  if (isPlainObject(value) && isPlainObject(value.chartOption)) {
    return value.chartOption
  }

  return null
}

export const getResultFileInfo = (value: unknown) => {
  const normalized = normalizeWorkflowResult(value)
  if (normalized?.kind === 'file' && isPlainObject(normalized.payload)) {
    return normalized.payload
  }

  if (isPlainObject(value) && isPlainObject(value.exportInfo)) {
    return value.exportInfo
  }

  return null
}

export const getResultKindLabel = (value: unknown) => {
  const normalized = normalizeWorkflowResult(value)
  const kind = normalized?.kind

  if (kind === 'table') return '表格数据'
  if (kind === 'tableCollection') return '分组数据集'
  if (kind === 'report') return '分析报告'
  if (kind === 'chart') return '图表结果'
  if (kind === 'file') return '导出文件'
  if (kind === 'json') return 'JSON 数据'
  return '数据结果'
}

export const getResultPreviewSummary = (value: unknown) => {
  const normalized = normalizeWorkflowResult(value)
  if (normalized?.preview?.summary) return normalized.preview.summary

  if (normalized?.kind === 'table') {
    const rows = getResultRows(normalized)
    return `共 ${rows.length} 行，${getResultSchemaFields(normalized).length} 个字段`
  }

  if (normalized?.kind === 'tableCollection') {
    const groups = getResultGroups(normalized)
    const totalRows = groups.reduce((sum, group) => sum + group.data.length, 0)
    return `共 ${groups.length} 组，${totalRows} 行样本`
  }

  if (normalized?.kind === 'report') {
    const report = getResultReport(normalized)
    const sectionCount = Array.isArray(report?.sections) ? report.sections.length : 0
    return `共 ${sectionCount} 个报告分节`
  }

  return ''
}
