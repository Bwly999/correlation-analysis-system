import {
  extractTableRows,
  inferSchemaFromRows,
  type FieldSchema,
} from '@/nodes/result'
import type { JsTransformAgentContext } from '@/ai/types'

const MAX_SAMPLE_ROWS = 3
const MAX_SAMPLE_COLUMNS = 50
const MAX_STRING_LENGTH = 120

const sanitizeSampleValue = (value: unknown): unknown => {
  if (value === null || value === undefined) return value
  if (typeof value === 'string') {
    return value.length > MAX_STRING_LENGTH ? `${value.slice(0, MAX_STRING_LENGTH)}...` : value
  }
  if (typeof value === 'number' || typeof value === 'boolean') return value
  if (Array.isArray(value)) return `数组(${value.length})`
  if (typeof value === 'object') return `对象(${Object.keys(value as Record<string, unknown>).length}个键)`
  return String(value)
}

const buildSampleRows = (rows: Array<Record<string, unknown>>) =>
  rows.slice(0, MAX_SAMPLE_ROWS).map((row) =>
    Object.fromEntries(
      Object.keys(row)
        .slice(0, MAX_SAMPLE_COLUMNS)
        .map((key) => [key, sanitizeSampleValue(row[key])]),
    ),
  )

const buildFieldSummary = (fields: FieldSchema[]): JsTransformAgentContext['inputContext']['schemaSummary']['fields'] =>
  fields.map((field) => ({
    name: field.name,
    type: field.type,
    nullable: Boolean(field.nullable),
  }))

const buildSummaryText = (rows: Array<Record<string, unknown>>) =>
  rows.length > 0 ? `上游输入共 ${rows.length} 行` : '当前没有可用的上游表格输入'

export const buildJsTransformAgentContext = (input: {
  nodeId: string
  nodeLabel: string
  nodeType: 'js-transform'
  currentCode: string
  declarations: string
  inputData: unknown
  outputData: unknown
  errorMessage: string
  status: JsTransformAgentContext['latestDebugContext']['status']
  task?: string
}): JsTransformAgentContext => {
  const inputRows = extractTableRows(input.inputData) ?? []
  const outputRows = extractTableRows(input.outputData) ?? []
  const schema = inputRows.length > 0 ? inferSchemaFromRows(inputRows) : { fields: [] }

  return {
    node: {
      nodeId: input.nodeId,
      nodeLabel: input.nodeLabel,
      nodeType: 'js-transform',
    },
    task: input.task ?? '',
    codeContext: {
      currentCode: input.currentCode,
      language: 'javascript',
      declarations: input.declarations,
      constraints: [
        '只能写同步 JS',
        '可用变量只有 rows',
        '必须显式 return 数组对象列表',
      ],
    },
    inputContext: {
      inputMode: 'single',
      rowCount: inputRows.length,
      sourceSummary: buildSummaryText(inputRows),
      sampleRows: buildSampleRows(inputRows),
      schemaSummary: {
        fields: buildFieldSummary(schema.fields ?? []),
      },
    },
    latestDebugContext: {
      status: input.status,
      summary:
        outputRows.length > 0
          ? `当前节点最近一次调试输出 ${outputRows.length} 行`
          : input.errorMessage
            ? '当前节点最近一次调试失败'
            : '当前尚未调试',
      outputSample: buildSampleRows(outputRows),
      errorMessage: input.errorMessage,
    },
    capabilities: {
      ask: ['read_context'],
      agent: ['read_context', 'update_current_code', 'debug_current_node'],
    },
  }
}
