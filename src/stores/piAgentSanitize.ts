import type { WorkflowNode } from '@/utils/storage/types'
import type { Edge } from '@vue-flow/core'
import type { NodeResult } from '@/nodes/result'
import { isNodeResult } from '@/nodes/result'

const MAX_SAMPLE_ROWS = 3
const MAX_SAMPLE_COLUMNS = 200
const MAX_LOG_ENTRIES = 10
const MAX_LOG_LENGTH = 200
const MAX_TABLE_COLLECTION_GROUPS = 5
const MAX_CONFIG_STRING_LENGTH = 500
const MAX_ERROR_LENGTH = 500
const MAX_GENERIC_STRING_LENGTH = 500
const MAX_TEXT_SUMMARY_LENGTH = 240
const MAX_OBJECT_KEYS = 20
const MAX_ARRAY_ITEMS = 10
const MAX_PAYLOAD_BYTES = 32768
const HIGH_RISK_ARRAY_THRESHOLD = 20

const HIGH_RISK_KEYS = new Set([
  'rows',
  'rawRows',
  'data',
  'sourceData',
  'jsonData',
  'payload',
])

const LONG_TEXT_KEYS = new Set([
  'summary',
  'title',
  'description',
  'textSummary',
  'interpretation',
  'conclusion',
])

type UnknownRecord = Record<string, unknown>

export interface SanitizedWorkflowNode {
  id: string
  type?: string
  label?: string
  position: { x: number; y: number } | null
  data: {
    label: string
    type: string
    category: string
    config: Record<string, unknown>
    status: string
    error?: string
    output?: unknown
    logs?: string[]
  }
}

export interface SanitizedWorkflowEdge {
  id: string
  source: string
  target: string
  sourceHandle?: string | null
  targetHandle?: string | null
}

export interface SanitizedWorkflowSnapshot {
  name: string
  nodes: SanitizedWorkflowNode[]
  edges: SanitizedWorkflowEdge[]
}

type WorkflowRuntimeAccessors = {
  getNodeOutput?: (nodeId: string) => unknown
  getNodeError?: (nodeId: string) => string | undefined
  getNodeLogs?: (nodeId: string) => string[] | undefined
}

const truncateStr = (str: string, maxLen: number): string =>
  str.length > maxLen ? `${str.slice(0, maxLen)}…` : str

export const countUtf8Bytes = (str: string): number => {
  let bytes = 0
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i)
    if (code < 0x0080) bytes += 1
    else if (code < 0x0800) bytes += 2
    else if (code < 0xd800 || code > 0xdfff) bytes += 3
    else { i++; bytes += 4 }
  }
  return bytes
}

const isPlainObject = (value: unknown): value is UnknownRecord =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

const isLooseNodeResult = (value: unknown): value is {
  kind: string
  payload?: unknown
  schema?: unknown
  meta?: unknown
  preview?: unknown
} => isPlainObject(value) && typeof value.kind === 'string'

const summarizeTruncatedString = (value: string, maxLen = MAX_CONFIG_STRING_LENGTH) => ({
  _truncated: true,
  _type: 'string',
  length: value.length,
  preview: truncateStr(value, maxLen),
})

const sanitizeLogs = (logs?: string[]): string[] | undefined => {
  if (!logs?.length) return undefined
  return logs.slice(-MAX_LOG_ENTRIES).map((item) => truncateStr(item, MAX_LOG_LENGTH))
}

const sanitizeTableRow = (row: unknown): unknown => {
  if (!isPlainObject(row)) return row
  return Object.fromEntries(
    Object.entries(row)
      .slice(0, MAX_SAMPLE_COLUMNS)
      .map(([key, value]) => [key, sanitizeNestedValue(value, { maxStringLength: MAX_GENERIC_STRING_LENGTH })]),
  )
}

const sanitizeTablePayload = (rows: unknown[]): unknown[] =>
  rows.slice(0, MAX_SAMPLE_ROWS).map(sanitizeTableRow)

const summarizeArray = (value: unknown[], keyHint?: string) => {
  const shouldSampleAsTable = value.every((item) => isPlainObject(item))
  if (shouldSampleAsTable) {
    return {
      _truncated: value.length > MAX_SAMPLE_ROWS || keyHint !== undefined,
      _type: 'array',
      total: value.length,
      sample: sanitizeTablePayload(value),
    }
  }

  return {
    _truncated: true,
    _type: 'array',
    total: value.length,
    sample: value
      .slice(0, Math.min(MAX_ARRAY_ITEMS, MAX_SAMPLE_ROWS))
      .map((item) => sanitizeNestedValue(item, { maxStringLength: MAX_GENERIC_STRING_LENGTH })),
  }
}

function sanitizeNestedValue(
  value: unknown,
  options: {
    keyHint?: string
    maxStringLength?: number
    depth?: number
  } = {},
): unknown {
  const { keyHint, maxStringLength = MAX_GENERIC_STRING_LENGTH, depth = 0 } = options

  if (value === null || value === undefined) return value

  if (typeof value === 'string') {
    return value.length > maxStringLength ? summarizeTruncatedString(value, maxStringLength) : value
  }

  if (typeof value === 'number' || typeof value === 'boolean') return value

  if (Array.isArray(value)) {
    const shouldSummarize =
      value.length > MAX_ARRAY_ITEMS
      || value.length > HIGH_RISK_ARRAY_THRESHOLD
      || (keyHint ? HIGH_RISK_KEYS.has(keyHint) : false)
      || depth >= 1

    if (shouldSummarize) return summarizeArray(value, keyHint)

    return value.map((item) => sanitizeNestedValue(item, { maxStringLength, depth: depth + 1 }))
  }

  if (!isPlainObject(value)) {
    return String(value)
  }

  const entries = Object.entries(value).slice(0, MAX_OBJECT_KEYS)
  const sanitizedEntries = entries.map(([key, nestedValue]) => {
    if (typeof nestedValue === 'string' && LONG_TEXT_KEYS.has(key)) {
      return [key, sanitizeTextSummaryValue(nestedValue)]
    }

    if (typeof nestedValue === 'string' && HIGH_RISK_KEYS.has(key)) {
      return [key, summarizeTruncatedString(nestedValue, maxStringLength)]
    }

    if (Array.isArray(nestedValue) && HIGH_RISK_KEYS.has(key)) {
      return [key, summarizeArray(nestedValue, key)]
    }

    return [
      key,
      sanitizeNestedValue(nestedValue, {
        keyHint: key,
        maxStringLength,
        depth: depth + 1,
      }),
    ]
  })

  if (Object.keys(value).length > MAX_OBJECT_KEYS) {
    sanitizedEntries.push([
      '_truncatedKeys',
      {
        _truncated: true,
        total: Object.keys(value).length,
      },
    ])
  }

  return Object.fromEntries(sanitizedEntries)
}

const sanitizeConfig = (config: Record<string, unknown> | undefined): Record<string, unknown> => {
  if (!config) return {}
  return sanitizeNestedValue(config, { maxStringLength: MAX_CONFIG_STRING_LENGTH }) as Record<string, unknown>
}

const sanitizeTextSummaryValue = (value: unknown): unknown => {
  if (typeof value !== 'string') return sanitizeNestedValue(value, { maxStringLength: MAX_TEXT_SUMMARY_LENGTH })
  return value.length > MAX_TEXT_SUMMARY_LENGTH
    ? summarizeTruncatedString(value, MAX_TEXT_SUMMARY_LENGTH)
    : value
}

const sanitizeTableCollectionPayload = (groups: unknown[]): unknown[] =>
  groups.slice(0, MAX_TABLE_COLLECTION_GROUPS).map((group) => {
    if (!isPlainObject(group)) return group

    const nextGroup: Record<string, unknown> = {}
    Object.entries(group).forEach(([key, value]) => {
      if (key === 'data' && Array.isArray(value)) {
        nextGroup[key] = sanitizeTablePayload(value)
        return
      }
      nextGroup[key] = sanitizeNestedValue(value, { keyHint: key, maxStringLength: MAX_GENERIC_STRING_LENGTH })
    })
    return nextGroup
  })

const sanitizeOutput = (output: unknown): unknown => {
  if (output === null || output === undefined) return output

  if (isNodeResult(output) || isLooseNodeResult(output)) {
    const { kind, payload, schema, meta, preview } = output as NodeResult & {
      kind: string
      payload?: unknown
      schema?: unknown
      meta?: unknown
      preview?: unknown
    }

    switch (kind) {
      case 'table': {
        const rows = Array.isArray(payload) ? payload : []
        return {
          kind,
          payload: sanitizeTablePayload(rows),
          ...(schema ? { schema: sanitizeNestedValue(schema) } : {}),
          ...(meta ? { meta: sanitizeNestedValue(meta) } : {}),
          ...(preview ? { preview: sanitizeNestedValue(preview) } : {}),
          _totalRows: rows.length,
          _truncated: rows.length > MAX_SAMPLE_ROWS,
        }
      }
      case 'tableCollection': {
        const groups = Array.isArray(payload) ? payload : []
        return {
          kind,
          payload: sanitizeTableCollectionPayload(groups),
          ...(schema ? { schema: sanitizeNestedValue(schema) } : {}),
          ...(meta ? { meta: sanitizeNestedValue(meta) } : {}),
          ...(preview ? { preview: sanitizeNestedValue(preview) } : {}),
          _totalGroups: groups.length,
          _truncated: groups.length > MAX_TABLE_COLLECTION_GROUPS,
        }
      }
      default:
        return {
          kind,
          payload: sanitizeNestedValue(payload, { keyHint: 'payload' }),
          ...(schema ? { schema: sanitizeNestedValue(schema) } : {}),
          ...(meta ? { meta: sanitizeNestedValue(meta) } : {}),
          ...(preview ? { preview: sanitizeNestedValue(preview) } : {}),
        }
    }
  }

  if (Array.isArray(output)) {
    return {
      kind: 'table',
      payload: sanitizeTablePayload(output),
      _totalRows: output.length,
      _truncated: output.length > MAX_SAMPLE_ROWS,
    }
  }

  return sanitizeNestedValue(output, { keyHint: 'output' })
}

function sanitizeSingleNode(node: WorkflowNode): SanitizedWorkflowNode {
  const data = node.data

  return {
    id: node.id,
    type: node.type,
    label: node.label,
    position: node.position ?? null,
    data: {
      label: data.label,
      type: data.type,
      category: data.category,
      config: sanitizeConfig(data.config),
      status: data.status,
      error: data.error ? truncateStr(data.error, MAX_ERROR_LENGTH) : undefined,
      output: sanitizeOutput(data.output),
      logs: sanitizeLogs(data.logs),
    },
  }
}

export function sanitizeWorkflowNodes(nodes: WorkflowNode[]): SanitizedWorkflowNode[] {
  return nodes.map(sanitizeSingleNode)
}

export function sanitizeWorkflowEdges(edges: Edge[]): SanitizedWorkflowEdge[] {
  return edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceHandle: edge.sourceHandle ?? null,
    targetHandle: edge.targetHandle ?? null,
  }))
}

function buildNodeSkeleton(node: SanitizedWorkflowNode): SanitizedWorkflowNode {
  return {
    id: node.id,
    type: node.type,
    label: node.label,
    position: node.position,
    data: {
      label: node.data.label,
      type: node.data.type,
      category: node.data.category,
      config: {},
      status: node.data.status,
    },
  }
}

function buildNodeEnrichment(
  node: SanitizedWorkflowNode,
  accessors?: WorkflowRuntimeAccessors,
): Partial<SanitizedWorkflowNode['data']> {
  const output = typeof accessors?.getNodeOutput === 'function'
    ? sanitizeOutput(accessors.getNodeOutput(node.id))
    : node.data.output
  const error = typeof accessors?.getNodeError === 'function'
    ? (() => {
        const value = accessors.getNodeError(node.id)
        return value ? truncateStr(value, MAX_ERROR_LENGTH) : undefined
      })()
    : node.data.error
  const logs = typeof accessors?.getNodeLogs === 'function'
    ? sanitizeLogs(accessors.getNodeLogs(node.id))
    : node.data.logs

  return {
    ...(error ? { error } : {}),
    ...(logs?.length ? { logs } : {}),
    ...(output !== undefined ? { output } : {}),
    ...(Object.keys(node.data.config).length ? { config: node.data.config } : {}),
  }
}

function mergeNodeData(
  base: SanitizedWorkflowNode,
  patch: Partial<SanitizedWorkflowNode['data']>,
): SanitizedWorkflowNode {
  return {
    ...base,
    data: {
      ...base.data,
      ...patch,
    },
  }
}

function clampNodesByBudget(
  nodes: SanitizedWorkflowNode[],
  maxBytes: number,
  accessors?: WorkflowRuntimeAccessors,
): SanitizedWorkflowNode[] {
  const baseNodes = nodes.map(buildNodeSkeleton)
  const result = [...baseNodes]

  if (countUtf8Bytes(JSON.stringify(result)) > maxBytes) {
    return result
  }

  for (let index = 0; index < nodes.length; index++) {
    const fullPatch = buildNodeEnrichment(nodes[index]!, accessors)
    const enriched = mergeNodeData(result[index]!, fullPatch)
    const tentative = [...result]
    tentative[index] = enriched

    if (countUtf8Bytes(JSON.stringify(tentative)) <= maxBytes) {
      result[index] = enriched
      continue
    }

    const currentBytes = countUtf8Bytes(JSON.stringify(result))
    const remainingBytes = Math.max(256, maxBytes - currentBytes)
    const reducedPatch: Partial<SanitizedWorkflowNode['data']> = {
      ...(fullPatch.error ? { error: fullPatch.error } : {}),
      ...(fullPatch.logs
        ? { logs: clampJsonSize(fullPatch.logs, Math.max(128, Math.floor(remainingBytes * 0.1))) }
        : {}),
      ...(fullPatch.config
        ? { config: clampJsonSize(fullPatch.config, Math.max(128, Math.floor(remainingBytes * 0.2))) }
        : {}),
      ...(fullPatch.output
        ? { output: clampJsonSize(fullPatch.output, Math.max(256, Math.floor(remainingBytes * 0.6))) }
        : {}),
    }
    const reduced = mergeNodeData(result[index]!, reducedPatch)
    const reducedTentative = [...result]
    reducedTentative[index] = reduced
    if (countUtf8Bytes(JSON.stringify(reducedTentative)) <= maxBytes) {
      result[index] = reduced
    }
  }

  return result
}

function clampJsonSizeRecursive(value: unknown, maxBytes: number): unknown {
  const json = JSON.stringify(value)
  if (countUtf8Bytes(json) <= maxBytes) return value

  if (typeof value === 'string') {
    return summarizeTruncatedString(value, Math.max(16, Math.floor(maxBytes / 4)))
  }

  if (Array.isArray(value)) {
    const result: unknown[] = []
    for (const item of value) {
      const tentative = [...result, item]
      if (countUtf8Bytes(JSON.stringify(tentative)) > maxBytes) break
      result.push(item)
    }
    return result
  }

  if (!isPlainObject(value)) return value

  const result: Record<string, unknown> = {}
  for (const [key, nestedValue] of Object.entries(value)) {
    const tentative = { ...result, [key]: nestedValue }
    if (countUtf8Bytes(JSON.stringify(tentative)) <= maxBytes) {
      result[key] = nestedValue
      continue
    }

    const remainingBytes = Math.max(64, maxBytes - countUtf8Bytes(JSON.stringify(result)))
    const clamped = clampJsonSizeRecursive(nestedValue, remainingBytes)
    const nextTentative = { ...result, [key]: clamped }
    if (countUtf8Bytes(JSON.stringify(nextTentative)) <= maxBytes) {
      result[key] = clamped
    }
  }
  return result
}

export function clampJsonSize<T>(data: T, maxBytes = MAX_PAYLOAD_BYTES): T {
  return clampJsonSizeRecursive(data, maxBytes) as T
}

export function sanitizeWorkflowSnapshot(nodes: WorkflowNode[]): SanitizedWorkflowNode[] {
  const sanitizedNodes = sanitizeWorkflowNodes(nodes)
  const budgetedNodes = clampNodesByBudget(sanitizedNodes, MAX_PAYLOAD_BYTES)
  return clampJsonSize(budgetedNodes, MAX_PAYLOAD_BYTES)
}

function sanitizeWorkflowSnapshotWithRuntime(
  nodes: WorkflowNode[],
  accessors?: WorkflowRuntimeAccessors,
): SanitizedWorkflowNode[] {
  const sanitizedNodes = sanitizeWorkflowNodes(nodes)
  const budgetedNodes = clampNodesByBudget(sanitizedNodes, MAX_PAYLOAD_BYTES, accessors)
  return clampJsonSize(budgetedNodes, MAX_PAYLOAD_BYTES)
}

export function buildSanitizedWorkflowSnapshot(
  input: {
    name: string
    nodes: WorkflowNode[]
    edges: Edge[]
  } & WorkflowRuntimeAccessors,
): SanitizedWorkflowSnapshot {
  return {
    name: input.name,
    nodes: sanitizeWorkflowSnapshotWithRuntime(input.nodes, {
      getNodeOutput: input.getNodeOutput,
      getNodeError: input.getNodeError,
      getNodeLogs: input.getNodeLogs,
    }),
    edges: sanitizeWorkflowEdges(input.edges),
  }
}
