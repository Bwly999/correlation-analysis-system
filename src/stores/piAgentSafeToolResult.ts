import type { PiAgentSafeNodeSummary, PiAgentSafeToolResult } from '@/ai/types'
import type { WorkflowExecutionResult, WorkflowNodeDebugResult } from '@/stores/workflowStore'
import type { WorkflowNodeSnapshot } from '@/utils/storage'
import {
  extractReportPayload,
  extractTableCollectionGroups,
  extractTableRows,
  inferSchemaFromRows,
  isNodeResult,
  isPlainObject,
} from '@/nodes/result'

const MAX_SAMPLE_ROWS = 3
const MAX_SAMPLE_FIELDS = 200
const MAX_TEXT_LENGTH = 120
const MAX_ARRAY_PREVIEW = 5
const MAX_KEY_PREVIEW = 20

type ExecutionLike = WorkflowExecutionResult | WorkflowNodeDebugResult
type UnknownRecord = Record<string, unknown>

const truncateText = (value: string, maxLength = MAX_TEXT_LENGTH) =>
  value.length > maxLength ? `${value.slice(0, maxLength)}...` : value

const summarizePrimitive = (value: unknown): string => {
  if (value === null || value === undefined) return '空值'
  if (typeof value === 'string') return truncateText(value)
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value)
  if (Array.isArray(value)) return `数组(${value.length})`
  if (isPlainObject(value)) return `对象(${Object.keys(value).length}个键)`
  return truncateText(String(value))
}

const sanitizeSampleValue = (value: unknown): unknown => {
  if (value === null || value === undefined) return value
  if (typeof value === 'string') return truncateText(value)
  if (typeof value === 'number' || typeof value === 'boolean') return value
  if (Array.isArray(value)) return `数组(${value.length})`
  if (isPlainObject(value)) return `对象(${Object.keys(value).length}个键)`
  return summarizePrimitive(value)
}

const collectColumns = (rows: Array<Record<string, unknown>>) =>
  Array.from(new Set(rows.flatMap((row) => Object.keys(row))))

const buildSampleRows = (rows: Array<Record<string, unknown>>) => {
  return rows.slice(0, MAX_SAMPLE_ROWS).map((row) => {
    const keys = Object.keys(row).slice(0, MAX_SAMPLE_FIELDS)
    return Object.fromEntries(keys.map((key) => [key, sanitizeSampleValue(row[key])]))
  })
}

const buildColumnStatsPreview = (rows: Array<Record<string, unknown>>, columns: string[]) => {
  const previews: Array<Record<string, unknown>> = []
  for (const column of columns) {
    const numericValues = rows
      .map((row) => row[column])
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))

    if (numericValues.length === 0) continue
    const total = numericValues.reduce((sum, value) => sum + value, 0)
    previews.push({
      column,
      count: numericValues.length,
      min: Math.min(...numericValues),
      max: Math.max(...numericValues),
      avg: Number((total / numericValues.length).toFixed(4)),
    })

    if (previews.length >= 5) break
  }

  return previews
}

const buildTableSummary = (
  nodeId: string,
  nodeLabel: string,
  rows: Array<Record<string, unknown>>,
  source: unknown,
): PiAgentSafeNodeSummary => {
  const columns = collectColumns(rows)
  const schemaFields =
    isNodeResult(source) && source.schema?.fields?.length
      ? source.schema.fields.map((field) => field.name)
      : inferSchemaFromRows(rows).fields?.map((field) => field.name) ?? columns

  return {
    nodeId,
    nodeLabel,
    resultKind: 'table',
    summary: `共 ${rows.length} 行，${columns.length} 列`,
    rowCount: rows.length,
    columnCount: columns.length,
    columns,
    sampleRows: buildSampleRows(rows),
    schemaSummary: {
      fields: schemaFields,
    },
    columnStatsPreview: buildColumnStatsPreview(rows, columns),
  }
}

const buildTableCollectionSummary = (
  nodeId: string,
  nodeLabel: string,
  groups: Array<{ name: string; data: Array<Record<string, unknown>> }>,
): PiAgentSafeNodeSummary => {
  const totalRows = groups.reduce((sum, group) => sum + group.data.length, 0)
  const sampleGroups = groups.slice(0, 3).map((group) => ({
    name: group.name,
    rowCount: group.data.length,
    sampleRows: buildSampleRows(group.data),
  }))

  return {
    nodeId,
    nodeLabel,
    resultKind: 'tableCollection',
    summary: `共 ${groups.length} 组，${totalRows} 行`,
    rowCount: totalRows,
    groupCount: groups.length,
    groups: sampleGroups,
  }
}

const toStringArray = (value: unknown) =>
  Array.isArray(value)
    ? value.slice(0, MAX_ARRAY_PREVIEW).map((item) => truncateText(String(item)))
    : []

const buildReportSummary = (
  nodeId: string,
  nodeLabel: string,
  payload: Record<string, unknown>,
): PiAgentSafeNodeSummary => ({
  nodeId,
  nodeLabel,
  resultKind: 'report',
  summary: typeof payload.summary === 'string' ? truncateText(payload.summary) : '已生成分析报告摘要',
  title: typeof payload.title === 'string' ? truncateText(payload.title) : nodeLabel,
  keyMetrics: Array.isArray(payload.keyMetrics) ? payload.keyMetrics.slice(0, MAX_ARRAY_PREVIEW) : [],
  findings: toStringArray(payload.findings),
  recommendations: toStringArray(payload.recommendations),
})

const buildChartSummary = (
  nodeId: string,
  nodeLabel: string,
  payload: Record<string, unknown>,
): PiAgentSafeNodeSummary => {
  const series = Array.isArray(payload.series) ? payload.series : []
  const xAxisData = Array.isArray((payload.xAxis as UnknownRecord | undefined)?.data)
    ? ((payload.xAxis as UnknownRecord).data as unknown[])
    : []

  return {
    nodeId,
    nodeLabel,
    resultKind: 'chart',
    summary: typeof payload.title === 'string' ? truncateText(payload.title) : '已生成图表摘要',
    title: typeof payload.title === 'string' ? truncateText(payload.title) : nodeLabel,
    chartType: typeof (series[0] as UnknownRecord | undefined)?.type === 'string'
      ? String((series[0] as UnknownRecord).type)
      : 'unknown',
    dimensions: {
      categories: xAxisData.length,
      series: series.length,
    },
    seriesSummary: series.slice(0, MAX_ARRAY_PREVIEW).map((item) => ({
      name: truncateText(String((item as UnknownRecord)?.name ?? '未命名序列')),
      type: String((item as UnknownRecord)?.type ?? 'unknown'),
    })),
  }
}

const buildFileSummary = (
  nodeId: string,
  nodeLabel: string,
  payload: Record<string, unknown>,
): PiAgentSafeNodeSummary => ({
  nodeId,
  nodeLabel,
  resultKind: 'file',
  summary: `文件 ${String(payload.fileName ?? payload.filename ?? nodeLabel)}`,
  fileName: String(payload.fileName ?? payload.filename ?? nodeLabel),
  fileType: typeof payload.fileType === 'string'
    ? payload.fileType
    : typeof payload.format === 'string'
      ? payload.format
      : 'unknown',
  fileSize: typeof payload.fileSize === 'number'
    ? payload.fileSize
    : typeof payload.size === 'number'
      ? payload.size
      : undefined,
})

const buildJsonSummary = (
  nodeId: string,
  nodeLabel: string,
  payload: unknown,
  resultKind: string,
): PiAgentSafeNodeSummary => {
  if (isPlainObject(payload)) {
    const keys = Object.keys(payload)
    return {
      nodeId,
      nodeLabel,
      resultKind,
      summary: `对象摘要，包含 ${keys.length} 个顶层字段`,
      topLevelKeys: keys.slice(0, MAX_KEY_PREVIEW),
      textSummary: keys.slice(0, MAX_KEY_PREVIEW).map((key) => `${key}: ${summarizePrimitive(payload[key])}`).join('；'),
    }
  }

  if (Array.isArray(payload)) {
    return {
      nodeId,
      nodeLabel,
      resultKind,
      summary: `数组摘要，共 ${payload.length} 项`,
      topLevelKeys: [],
      textSummary: payload.slice(0, MAX_ARRAY_PREVIEW).map((item) => summarizePrimitive(item)).join('；'),
    }
  }

  return {
    nodeId,
    nodeLabel,
    resultKind,
    summary: summarizePrimitive(payload),
    topLevelKeys: [],
    textSummary: summarizePrimitive(payload),
  }
}

const summarizeNodeOutput = (
  nodeId: string,
  nodeLabel: string,
  output: unknown,
): PiAgentSafeNodeSummary => {
  const rows = extractTableRows(output)
  if (rows) return buildTableSummary(nodeId, nodeLabel, rows, output)

  const groups = extractTableCollectionGroups(output)
  if (groups) return buildTableCollectionSummary(nodeId, nodeLabel, groups)

  const reportPayload = extractReportPayload(output)
  if (reportPayload) return buildReportSummary(nodeId, nodeLabel, reportPayload)

  if (isNodeResult(output) && output.kind === 'chart' && isPlainObject(output.payload)) {
    return buildChartSummary(nodeId, nodeLabel, output.payload)
  }

  if (isNodeResult(output) && output.kind === 'file' && isPlainObject(output.payload)) {
    return buildFileSummary(nodeId, nodeLabel, output.payload)
  }

  if (isNodeResult(output)) {
    return buildJsonSummary(nodeId, nodeLabel, output.payload, output.kind)
  }

  return buildJsonSummary(nodeId, nodeLabel, output, 'json')
}

const summarizeExecutionNode = (node: WorkflowNodeSnapshot): PiAgentSafeNodeSummary => {
  const output = node.data.output
  if (!output) {
    return {
      nodeId: node.id,
      nodeLabel: node.data.label,
      resultKind: 'empty',
      summary: node.data.error ? truncateText(node.data.error) : '节点暂无可用结果',
      status: node.data.status,
    }
  }

  return {
    ...summarizeNodeOutput(node.id, node.data.label, output),
    status: node.data.status,
  }
}

const summarizeDebugNode = (result: WorkflowNodeDebugResult): PiAgentSafeNodeSummary => {
  return {
    ...summarizeNodeOutput(result.nodeId, result.nodeId, result.output),
    status: result.status,
  }
}

const buildToolSummaryText = (toolName: string, nodes: PiAgentSafeNodeSummary[], scope: 'global' | 'single') => {
  const actionLabel = toolName === 'workflow_debug_node' ? '调试' : '执行'
  if (nodes.length === 0) return `${actionLabel}已完成，未返回可用节点摘要`
  const primary = nodes[0]
  if (!primary) return `${actionLabel}已完成，未返回可用节点摘要`
  const scopeLabel = scope === 'single' ? '单节点' : '全局'
  return `${scopeLabel}${actionLabel}完成：${primary.nodeLabel}，${primary.summary}`
}

export const buildPiAgentSafeToolResult = (input: {
  toolName: string
  toolCallId: string
  rawResult: ExecutionLike
}): PiAgentSafeToolResult => {
  const { toolName, rawResult } = input
  const nodes =
    rawResult.scope === 'global'
      ? rawResult.nodeResults
          .filter((node) => node.data.status === 'success' || node.data.status === 'error')
          .map((node) => summarizeExecutionNode(node))
      : [summarizeDebugNode(rawResult as WorkflowNodeDebugResult)]

  return {
    ok: rawResult.ok,
    scope: rawResult.scope,
    executionId: 'executionId' in rawResult ? rawResult.executionId ?? null : null,
    status: rawResult.status,
    summary: buildToolSummaryText(toolName, nodes, rawResult.scope),
    nodes,
    artifacts: [],
    warnings: rawResult.ok ? [] : ['执行未成功完成，请根据节点摘要继续排查'],
  }
}
