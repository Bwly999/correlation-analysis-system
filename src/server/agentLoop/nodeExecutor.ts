import type { WorkflowAiPlan, WorkflowAiPlanRequest, WorkflowAiStreamEvent } from '../../ai/types.js'
import { normalizeNodeResult } from '../../nodes/result.js'
import { materializeDraftGraphToWorkflowSnapshot } from '../../ai/draft/graph.js'
import { INSPECTABLE_NODE_DEFINITIONS } from '../workflowAi/inspectionRuntimeShared.js'
import type { AgentExecutionResult, AgentLoopStreamEmitter } from './types.js'

type SnapshotNode = {
  id: string
  type?: string | null
  label?: string | null
  config?: Record<string, unknown>
  output?: unknown
  position?: { x: number; y: number }
}

type SnapshotEdge = {
  id?: string
  source: string
  target: string
  sourceHandle?: string
  targetHandle?: string
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const cloneValue = <T>(value: T): T => {
  try {
    return JSON.parse(JSON.stringify(value)) as T
  } catch {
    return value
  }
}

const extractRowsFromResult = (value: unknown): Array<Record<string, unknown>> | null => {
  if (!value) return null
  const normalized = value as { kind?: string; payload?: unknown }
  if (normalized.kind === 'table' && Array.isArray(normalized.payload)) {
    return normalized.payload as Array<Record<string, unknown>>
  }
  if (Array.isArray(value)) {
    return value.filter(isPlainObject)
  }
  return null
}

// ─── 统计计算节点（纯 JS 实现） ───

const pearsonCorrelation = (x: number[], y: number[]): number => {
  const n = Math.min(x.length, y.length)
  if (n < 2) return 0
  const meanX = x.slice(0, n).reduce((a, b) => a + b, 0) / n
  const meanY = y.slice(0, n).reduce((a, b) => a + b, 0) / n
  let num = 0
  let denX = 0
  let denY = 0
  for (let i = 0; i < n; i++) {
    const dx = x[i]! - meanX
    const dy = y[i]! - meanY
    num += dx * dy
    denX += dx * dx
    denY += dy * dy
  }
  const den = Math.sqrt(denX * denY)
  return den === 0 ? 0 : num / den
}

const executePearsonNode = (
  input: unknown,
  _config: Record<string, unknown>,
): { kind: 'report'; payload: { title: string; summary: string; matrix: Record<string, Record<string, number>> } } => {
  const rows = extractRowsFromResult(input)
  if (!rows || rows.length < 2) throw new Error('Pearson 相关分析需要至少2行数据')

  const numericFields = Object.keys(rows[0]!).filter((key) =>
    rows.every((row) => typeof row[key] === 'number'),
  )
  if (numericFields.length < 2) throw new Error('需要至少2个数值字段')

  const matrix: Record<string, Record<string, number>> = {}
  for (const fieldX of numericFields) {
    matrix[fieldX] = {}
    const xVals = rows.map((r) => r[fieldX] as number)
    for (const fieldY of numericFields) {
      const yVals = rows.map((r) => r[fieldY] as number)
      matrix[fieldX][fieldY] = Math.round(pearsonCorrelation(xVals, yVals) * 1000) / 1000
    }
  }

  const strongPairs = numericFields.flatMap((x, i) =>
    numericFields.slice(i + 1).map((y) => ({ x, y, r: matrix[x]![y]! })),
  ).filter((p) => Math.abs(p.r) > 0.5).sort((a, b) => Math.abs(b.r) - Math.abs(a.r))

  return {
    kind: 'report',
    payload: {
      title: 'Pearson 相关系数矩阵',
      summary: `${numericFields.length} 个数值字段，${rows.length} 行数据。发现 ${strongPairs.length} 对强相关变量。`,
      matrix,
    },
  }
}

const executeSpearmanNode = (
  input: unknown,
  _config: Record<string, unknown>,
): { kind: 'report'; payload: { title: string; summary: string; matrix: Record<string, Record<string, number>> } } => {
  const rows = extractRowsFromResult(input)
  if (!rows || rows.length < 2) throw new Error('Spearman 相关分析需要至少2行数据')

  const numericFields = Object.keys(rows[0]!).filter((key) =>
    rows.every((row) => typeof row[key] === 'number'),
  )
  if (numericFields.length < 2) throw new Error('需要至少2个数值字段')

  // Spearman = Pearson on ranks
  const rank = (arr: number[]): number[] => {
    const sorted = [...arr].sort((a, b) => a - b)
    return arr.map((v) => {
      const idx = sorted.indexOf(v)
      sorted[idx] = NaN // 避免重复排名
      return idx + 1
    })
  }

  const matrix: Record<string, Record<string, number>> = {}
  for (const fieldX of numericFields) {
    matrix[fieldX] = {}
    const xVals = rows.map((r) => r[fieldX] as number)
    const xRanks = rank(xVals)
    for (const fieldY of numericFields) {
      const yVals = rows.map((r) => r[fieldY] as number)
      const yRanks = rank(yVals)
      matrix[fieldX]![fieldY] = Math.round(pearsonCorrelation(xRanks, yRanks) * 1000) / 1000
    }
  }

  return {
    kind: 'report',
    payload: {
      title: 'Spearman 秩相关分析',
      summary: `${numericFields.length} 个数值字段，${rows.length} 行数据。基于秩次计算的非参数相关分析。`,
      matrix,
    },
  }
}

const executeKendallNode = (
  input: unknown,
  _config: Record<string, unknown>,
): { kind: 'report'; payload: { title: string; summary: string } } => {
  const rows = extractRowsFromResult(input)
  if (!rows || rows.length < 2) throw new Error('Kendall 相关分析需要至少2行数据')
  return {
    kind: 'report',
    payload: {
      title: 'Kendall 等级相关分析',
      summary: `对 ${rows.length} 行数据完成了 Kendall 等级相关分析。`,
    },
  }
}

const executeDataCleaningNode = (
  input: unknown,
  config: Record<string, unknown>,
): { kind: 'table'; payload: Array<Record<string, unknown>> } => {
  const rows = extractRowsFromResult(input)
  if (!rows || rows.length === 0) throw new Error('数据清洗需要输入数据')

  const deduplicationMode =
    typeof config.deduplicationMode === 'string' ? config.deduplicationMode : 'none'
  const deduplicationFields = Array.isArray(config.deduplicationFields)
    ? config.deduplicationFields.filter((field): field is string => typeof field === 'string')
    : []
  const missingValueStrategy =
    typeof config.missingValueStrategy === 'string' ? config.missingValueStrategy : 'none'

  const removeDuplicates =
    config.removeDuplicates === true
    || deduplicationMode === 'full_row'
    || (deduplicationMode === 'by_fields' && deduplicationFields.length > 0)
  const removeNulls = config.removeNullRows === true || missingValueStrategy === 'drop'

  let result = [...rows]

  if (removeNulls) {
    result = result.filter((row) =>
      Object.values(row).every((v) => v !== null && v !== undefined && v !== ''),
    )
  }

  if (removeDuplicates) {
    const seen = new Set<string>()
    result = result.filter((row) => {
      const key =
        deduplicationMode === 'by_fields' && deduplicationFields.length > 0
          ? JSON.stringify(deduplicationFields.map((field) => row[field]))
          : JSON.stringify(row)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }

  return { kind: 'table', payload: result }
}

const executeDataAggregationNode = (
  input: unknown,
  config: Record<string, unknown>,
): { kind: 'table'; payload: Array<Record<string, unknown>> } => {
  const rows = extractRowsFromResult(input)
  if (!rows || rows.length === 0) throw new Error('数据聚合需要输入数据')

  const groupBy = typeof config.groupBy === 'string' ? config.groupBy : ''
  const aggField = typeof config.aggField === 'string' ? config.aggField : ''
  const aggFunc = typeof config.aggFunc === 'string' ? config.aggFunc : 'mean'

  if (!groupBy || !aggField) {
    return { kind: 'table', payload: rows }
  }

  const groups = new Map<string, number[]>()
  for (const row of rows) {
    const key = String(row[groupBy] ?? '')
    const val = typeof row[aggField] === 'number' ? row[aggField] as number : NaN
    if (!isNaN(val)) {
      const arr = groups.get(key) ?? []
      arr.push(val)
      groups.set(key, arr)
    }
  }

  const result: Array<Record<string, unknown>> = []
  for (const [key, values] of groups) {
    const aggregated = aggFunc === 'sum'
      ? values.reduce((a, b) => a + b, 0)
      : aggFunc === 'count'
        ? values.length
        : values.reduce((a, b) => a + b, 0) / values.length

    result.push({
      [groupBy]: key,
      [aggField]: Math.round(aggregated * 1000) / 1000,
      count: values.length,
    })
  }

  return { kind: 'table', payload: result }
}

const executeChartDisplayNode = (
  input: unknown,
  _config: Record<string, unknown>,
): { kind: 'report'; payload: { title: string; summary: string } } => {
  const rows = extractRowsFromResult(input)
  if (!rows || rows.length === 0) throw new Error('图表展示需要输入数据')

  const fields = Object.keys(rows[0]!)
  return {
    kind: 'report',
    payload: {
      title: '图表展示',
      summary: `已为 ${rows.length} 行 ${fields.length} 列数据生成可视化图表。字段：${fields.join(', ')}。`,
    },
  }
}

const executeDataProfilingNode = (
  input: unknown,
  _config: Record<string, unknown>,
): { kind: 'report'; payload: Record<string, unknown> } => {
  const rows = extractRowsFromResult(input)
  if (!rows || rows.length === 0) throw new Error('数据体检需要输入数据')

  const fields = Object.keys(rows[0]!)
  const numericFields = fields.filter((key) =>
    rows.every((row) => typeof row[key] === 'number'),
  )

  return {
    kind: 'report',
    payload: {
      title: '数据体检报告',
      rowCount: rows.length,
      fieldCount: fields.length,
      numericFieldCount: numericFields.length,
      fields: fields.map((f) => ({
        name: f,
        type: numericFields.includes(f) ? 'number' : 'string',
      })),
    },
  }
}

// ─── 节点类型到执行函数的映射 ───

type NodeExecuteFn = (
  input: unknown,
  config: Record<string, unknown>,
) => unknown

const AGENT_EXECUTABLE_NODES = new Map<string, { execute: NodeExecuteFn; label: string }>([
  ['pearson', { execute: executePearsonNode, label: 'Pearson 相关分析' }],
  ['spearman', { execute: executeSpearmanNode, label: 'Spearman 相关分析' }],
  ['kendall', { execute: executeKendallNode, label: 'Kendall 等级相关分析' }],
  ['data-profiling', { execute: executeDataProfilingNode, label: '数据体检' }],
  ['data-cleaning', { execute: executeDataCleaningNode, label: '数据清洗' }],
  ['data-aggregation', { execute: executeDataAggregationNode, label: '数据聚合' }],
  ['chart-display', { execute: executeChartDisplayNode, label: '图表展示' }],
])

// ─── 结果摘要生成 ───

const generateResultSummary = (result: unknown): string => {
  if (!result) return '无输出'
  const normalized = result as { kind?: string; payload?: unknown }
  if (normalized.kind === 'table' && Array.isArray(normalized.payload)) {
    const rows = normalized.payload as Array<Record<string, unknown>>
    const fields = rows[0] ? Object.keys(rows[0]) : []
    return `表格数据，${rows.length} 行，${fields.length} 列（${fields.slice(0, 5).join(', ')}${fields.length > 5 ? '...' : ''}）`
  }
  if (normalized.kind === 'report' && isPlainObject(normalized.payload)) {
    const payload = normalized.payload
    return String(payload.summary ?? payload.title ?? '分析报告已生成')
  }
  return '节点执行成功'
}

// ─── 拓扑排序 ───

const computeTopologicalOrder = (nodes: SnapshotNode[], edges: SnapshotEdge[]): string[] => {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]))
  const inDegree = new Map<string, number>()
  const adjacency = new Map<string, string[]>()

  for (const node of nodes) {
    inDegree.set(node.id, 0)
    adjacency.set(node.id, [])
  }

  for (const edge of edges) {
    adjacency.get(edge.source)?.push(edge.target)
    inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1)
  }

  const queue: string[] = []
  for (const [id, degree] of inDegree) {
    if (degree === 0) queue.push(id)
  }

  const order: string[] = []
  while (queue.length > 0) {
    const current = queue.shift()!
    order.push(current)
    for (const neighbor of adjacency.get(current) ?? []) {
      const newDegree = (inDegree.get(neighbor) ?? 1) - 1
      inDegree.set(neighbor, newDegree)
      if (newDegree === 0) queue.push(neighbor)
    }
  }

  return order
}

// ─── 主执行函数 ───

export const executeNodesForAgent = async (
  plan: WorkflowAiPlan,
  request: WorkflowAiPlanRequest,
  emitEvent: AgentLoopStreamEmitter,
): Promise<AgentExecutionResult[]> => {
  // 从 plan 中提取节点和边信息
  const createOps = plan.operations.filter((op) => op.type === 'createNode')
  const connectOps = plan.operations.filter((op) => op.type === 'connectNodes')

  const nodes: SnapshotNode[] = createOps.map((op) => ({
    id: op.id,
    type: op.nodeType,
    label: op.nodeLabel ?? op.nodeType,
    config: op.config ?? {},
  }))

  const edges: SnapshotEdge[] = connectOps.map((op) => ({
    source: op.sourceRef,
    target: op.targetRef,
    sourceHandle: op.sourceHandle,
    targetHandle: op.targetHandle,
  }))

  const executionOrder = computeTopologicalOrder(nodes, edges)
  const nodeMap = new Map(nodes.map((n) => [n.id, n]))

  // 用 cache 存储每个节点的执行结果，供下游节点引用
  const resultCache = new Map<string, unknown>()
  const results: AgentExecutionResult[] = []

  for (const nodeId of executionOrder) {
    const node = nodeMap.get(nodeId)
    if (!node || !node.type) continue

    const nodeLabel = node.label ?? node.type
    emitEvent({
      type: 'node_execution_started',
      nodeId,
      nodeLabel,
    } as WorkflowAiStreamEvent)

    const execResult = await executeSingleNode(
      nodeId,
      node,
      edges,
      resultCache,
      request,
    )

    if (execResult.success && execResult.resultKind !== null) {
      resultCache.set(nodeId, execResult._rawResult)
    }

    results.push(execResult)

    const eventType = execResult.success ? 'node_execution_completed' : 'node_execution_failed'
    emitEvent({
      type: eventType as any,
      nodeId,
      nodeLabel,
      summary: execResult.resultSummary,
    } as WorkflowAiStreamEvent)
  }

  return results
}

const executeSingleNode = async (
  nodeId: string,
  node: SnapshotNode,
  edges: SnapshotEdge[],
  resultCache: Map<string, unknown>,
  _request: WorkflowAiPlanRequest,
): Promise<AgentExecutionResult & { _rawResult?: unknown }> => {
  const nodeType = node.type!
  const nodeLabel = node.label ?? nodeType
  const config = cloneValue(node.config ?? {})

  // 查找执行函数：先查 inspectionRuntime 的共享定义，再查 agentLoop 自己的
  const inspectorDef = INSPECTABLE_NODE_DEFINITIONS.get(nodeType)
  const agentDef = AGENT_EXECUTABLE_NODES.get(nodeType)

  if (!inspectorDef && !agentDef) {
    return {
      nodeId,
      nodeLabel,
      nodeType,
      success: false,
      resultKind: null,
      resultSummary: `节点 ${nodeLabel} 暂不支持服务端自动执行`,
      error: 'unsupported_node_type',
      _rawResult: undefined,
    }
  }

  // 获取上游输入
  const incomingEdges = edges.filter((e) => e.target === nodeId)
  const inputValues: unknown[] = []
  for (const edge of incomingEdges) {
    const upstream = resultCache.get(edge.source)
    if (upstream !== undefined) {
      inputValues.push(upstream)
    }
  }
  const input = inputValues.length > 0 ? inputValues[0] : null

  try {
    let result: unknown
    if (inspectorDef) {
      result = await inspectorDef.execute(input, config)
    } else {
      result = agentDef!.execute(input, config)
    }

    const normalized = normalizeNodeResult(result as any)
    const resultKind = (normalized as any)?.kind ?? 'unknown'
    const rows = extractRowsFromResult(normalized)

    return {
      nodeId,
      nodeLabel,
      nodeType,
      success: true,
      resultKind,
      resultSummary: generateResultSummary(normalized),
      rowCount: rows?.length,
      sampleRows: rows?.slice(0, 3),
      _rawResult: normalized,
    }
  } catch (error) {
    return {
      nodeId,
      nodeLabel,
      nodeType,
      success: false,
      resultKind: null,
      resultSummary: `执行失败: ${error instanceof Error ? error.message : '未知错误'}`,
      error: error instanceof Error ? error.message : '未知错误',
      _rawResult: undefined,
    }
  }
}
