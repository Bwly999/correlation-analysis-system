import {
  applyDraftMutations,
  buildDraftMutationsFromPlan,
  createDraftGraphFromWorkflowSnapshot,
  materializeDraftGraphToWorkflowSnapshot,
} from '../../ai/draft/graph.js'
import { validateWorkflowAiPlanAgainstContext } from '../../ai/planValidation.js'
import type {
  WorkflowAiNodeCatalogItem,
  WorkflowAiOperation,
  WorkflowAiPlan,
  WorkflowAiPlanRequest,
  AgentExecutionRecord,
} from '../../ai/types.js'
import { executeNodesForAgent } from '../workflowExecution/nodeExecutor.js'
import { buildDataProfile } from './analysisIntelligence/dataProfile.js'
import { recommendAnalysisMethods } from './analysisIntelligence/methodAdvisor.js'
import { extractResultEvidence } from './analysisIntelligence/resultEvidence.js'
import {
  buildServerWorkflowAiNodeCatalog,
  buildServerWorkflowAiValidationCatalog,
  getServerNodeCatalogItem,
  resolveServerNodePropertyOptions,
} from '../workflowAi/nodeCatalog.js'
import type {
  ServerExecutionRecord,
  ServerSavedWorkflow,
  ServerWorkflowVersion,
} from '../storageService.js'

type WorkflowSnapshot = NonNullable<WorkflowAiPlanRequest['workflowSnapshot']>

type SavedWorkflowLike = {
  id: string
  name: string
  updatedAt: number
  nodes: Array<Record<string, unknown>>
  edges: Array<Record<string, unknown>>
}

type SnapshotNodeLike = Record<string, unknown> & {
  id: string
  type?: string
  label?: string
  position?: { x: number; y: number }
  config?: Record<string, unknown>
}

type SnapshotEdgeLike = Record<string, unknown> & {
  id?: string
  source: string
  target: string
  sourceHandle?: string
  targetHandle?: string
}

type SearchableText = {
  item: WorkflowAiNodeCatalogItem
  haystack: string
}

export interface WorkflowMcpStorageGateway {
  getUserWorkflowById(userId: string, workflowId: string): Promise<ServerSavedWorkflow | null>
  saveUserWorkflow(userId: string, workflow: ServerSavedWorkflow): Promise<ServerWorkflowVersion>
  getUserHistory(userId: string): Promise<ServerExecutionRecord[]>
  saveUserHistory(userId: string, record: ServerExecutionRecord, limit?: number): Promise<ServerExecutionRecord[]>
  getUserWorkflowVersions(userId: string, workflowId: string): Promise<ServerWorkflowVersion[]>
  getUserWorkflowVersion(
    userId: string,
    workflowId: string,
    versionId: string,
  ): Promise<ServerWorkflowVersion | null>
  rollbackUserWorkflowVersion(
    userId: string,
    workflowId: string,
    versionId: string,
  ): Promise<{ workflow: ServerSavedWorkflow; version: ServerWorkflowVersion } | null>
}

export interface CreateWorkflowMcpRuntimeOptions {
  storage: WorkflowMcpStorageGateway
}

const cloneValue = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T
const MAX_HISTORY_SAMPLE_SIZE = 10
const DEFAULT_HISTORY_SAMPLE_SIZE = 3

const resolvePagination = (input: { limit?: number, offset?: number } = {}) => ({
  limit: Math.min(Math.max(Math.floor(input.limit ?? 20), 1), 100),
  offset: Math.max(Math.floor(input.offset ?? 0), 0),
})

const paginateItems = <T>(items: T[], input: { limit?: number, offset?: number } = {}) => {
  const { limit, offset } = resolvePagination(input)
  const pageItems = items.slice(offset, offset + limit)
  const nextOffset = offset + pageItems.length
  const hasMore = nextOffset < items.length

  return {
    total: items.length,
    count: pageItems.length,
    offset,
    limit,
    hasMore,
    nextOffset: hasMore ? nextOffset : null,
    items: pageItems,
  }
}

const normalizeString = (value: unknown) => (typeof value === 'string' ? value.trim().toLowerCase() : '')
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value)

const resolveHistorySampleSize = (sampleSize?: number) =>
  Math.min(Math.max(Math.floor(sampleSize ?? DEFAULT_HISTORY_SAMPLE_SIZE), 1), MAX_HISTORY_SAMPLE_SIZE)

const shallowCompactValue = (value: unknown): unknown => {
  if (
    value == null
    || typeof value === 'string'
    || typeof value === 'number'
    || typeof value === 'boolean'
  ) {
    return value
  }

  if (Array.isArray(value)) {
    return {
      itemCount: value.length,
    }
  }

  if (isRecord(value)) {
    const scalarEntries = Object.entries(value)
      .filter(([, entry]) => entry == null || ['string', 'number', 'boolean'].includes(typeof entry))
      .slice(0, 8)

    return {
      ...Object.fromEntries(scalarEntries),
      topLevelKeys: Object.keys(value).slice(0, 12),
    }
  }

  return String(value)
}

const getNodeDataContainer = (node: Record<string, unknown>) =>
  isRecord(node.data) ? node.data : null

const getNodeField = (node: Record<string, unknown>, key: string) => {
  const nodeData = getNodeDataContainer(node)
  return node[key] ?? nodeData?.[key]
}

const getNodeOutput = (node: Record<string, unknown>) => getNodeField(node, 'output')
const getNodeStatus = (node: Record<string, unknown>) => getNodeField(node, 'status')
const getNodeError = (node: Record<string, unknown>) => getNodeField(node, 'error')
const getNodeType = (node: Record<string, unknown>) => getNodeField(node, 'type')
const getNodeLabel = (node: Record<string, unknown>) =>
  getNodeField(node, 'label') ?? nodeFieldFallback(node, 'id')

const nodeFieldFallback = (node: Record<string, unknown>, key: string) => node[key]

const getNodeOutputSummary = (node: Record<string, unknown>, output: unknown) => {
  const explicitSummary = nodeFieldFallback(node, 'outputSummary')
  if (typeof explicitSummary === 'string' && explicitSummary.trim()) return explicitSummary

  if (isRecord(output)) {
    const payload = output.payload
    if (isRecord(payload)) {
      if (typeof payload.summary === 'string' && payload.summary.trim()) return payload.summary
      if (typeof payload.title === 'string' && payload.title.trim()) return payload.title
    }
  }

  const error = getNodeError(node)
  if (typeof error === 'string' && error.trim()) return error
  return ''
}

const buildArrayPreview = (items: unknown[], sampleSize: number, kind = 'table') => ({
  kind,
  rowCount: items.length,
  sampleRows: items.slice(0, sampleSize).map((item) => shallowCompactValue(item)) as Array<Record<string, unknown> | unknown>,
  sampleSize: Math.min(sampleSize, items.length),
  truncated: items.length > sampleSize,
})

const buildReportPreview = (payload: Record<string, unknown>, sampleSize: number) => {
  const recommendations = Array.isArray(payload.recommendations)
    ? payload.recommendations
      .filter((item): item is string => typeof item === 'string')
      .slice(0, sampleSize)
    : []
  const findings = Array.isArray(payload.findings)
    ? payload.findings
      .filter((item): item is string => typeof item === 'string')
      .slice(0, sampleSize)
    : []
  const sections = Array.isArray(payload.sections)
    ? payload.sections
      .filter(isRecord)
      .slice(0, sampleSize)
      .map((section) => {
        const items = Array.isArray(section.items) ? section.items : []
        return {
          key: typeof section.key === 'string' ? section.key : undefined,
          type: typeof section.type === 'string' ? section.type : undefined,
          itemCount: items.length,
          sampleItems: items.slice(0, sampleSize).map((item) => shallowCompactValue(item)),
          truncated: items.length > sampleSize,
        }
      })
    : []

  const totalSectionCount = Array.isArray(payload.sections) ? payload.sections.length : 0

  return {
    kind: 'report',
    title: typeof payload.title === 'string' ? payload.title : undefined,
    summary: typeof payload.summary === 'string' ? payload.summary : undefined,
    recommendations,
    findings,
    sectionCount: totalSectionCount,
    sections,
    sampleSize,
    truncated:
      recommendations.length < (Array.isArray(payload.recommendations) ? payload.recommendations.length : 0)
      || findings.length < (Array.isArray(payload.findings) ? payload.findings.length : 0)
      || sections.length < totalSectionCount
      || sections.some((section) => section.truncated),
  }
}

const buildChartPreview = (payload: Record<string, unknown>, sampleSize: number) => {
  const option = isRecord(payload.option) ? payload.option : null
  const series = Array.isArray(option?.series) ? option.series.filter(isRecord) : []
  return {
    kind: 'chart',
    chartType: typeof payload.chartType === 'string'
      ? payload.chartType
      : typeof series[0]?.type === 'string'
        ? series[0].type
        : undefined,
    seriesCount: series.length,
    seriesSummary: series.slice(0, sampleSize).map((item) => ({
      type: typeof item.type === 'string' ? item.type : undefined,
      dataPointCount: Array.isArray(item.data) ? item.data.length : undefined,
      name: typeof item.name === 'string' ? item.name : undefined,
    })),
    dimensions: isRecord(payload.dimensions) ? shallowCompactValue(payload.dimensions) : undefined,
    sampleSize,
    truncated: series.length > sampleSize || series.some((item) => Array.isArray(item.data) && item.data.length > sampleSize),
  }
}

const buildObjectPreview = (payload: Record<string, unknown>, kind: string, sampleSize: number) => ({
  kind,
  topLevelKeys: Object.keys(payload).slice(0, 12),
  scalarFields: Object.fromEntries(
    Object.entries(payload)
      .filter(([, value]) => value == null || ['string', 'number', 'boolean'].includes(typeof value))
      .slice(0, sampleSize),
  ),
  sampleSize,
  truncated: Object.keys(payload).length > 12,
})

const buildNodeOutputPreview = (output: unknown, sampleSize: number) => {
  if (!isRecord(output)) return null

  const kind = typeof output.kind === 'string' ? output.kind : 'unknown'
  const payload = output.payload

  if (Array.isArray(payload)) {
    return buildArrayPreview(payload, sampleSize, kind === 'unknown' ? 'table' : kind)
  }

  if (!isRecord(payload)) {
    return {
      kind,
      value: shallowCompactValue(payload),
      sampleSize: payload === undefined ? 0 : 1,
      truncated: false,
    }
  }

  if (kind === 'report') {
    return buildReportPreview(payload, sampleSize)
  }

  if (kind === 'chart') {
    return buildChartPreview(payload, sampleSize)
  }

  if (Array.isArray(payload.rows)) {
    return buildArrayPreview(payload.rows, sampleSize, kind)
  }

  return buildObjectPreview(payload, kind, sampleSize)
}

const buildExecutionSummary = (execution: ServerExecutionRecord) => {
  const nodes = execution.nodes as Array<Record<string, unknown>>
  const errorNodeCount = nodes.filter((node) => getNodeStatus(node) === 'error').length
  return {
    id: execution.id,
    workflowId: execution.workflowId,
    workflowName: execution.workflowName,
    startTime: execution.startTime,
    duration: execution.duration,
    status: execution.status,
    nodeCount: nodes.length,
    errorNodeCount,
  }
}

const buildExecutionNodeSummary = (
  node: Record<string, unknown>,
  options: { includePreview: boolean; sampleSize: number },
) => {
  const output = getNodeOutput(node)
  const resultKind = isRecord(output) && typeof output.kind === 'string' ? output.kind : 'unknown'
  const summary = {
    nodeId: String(nodeFieldFallback(node, 'id') ?? ''),
    nodeLabel: String(getNodeLabel(node) ?? ''),
    nodeType: typeof getNodeType(node) === 'string' ? String(getNodeType(node)) : undefined,
    status: typeof getNodeStatus(node) === 'string' ? String(getNodeStatus(node)) : undefined,
    resultKind,
    outputSummary: getNodeOutputSummary(node, output),
    error: typeof getNodeError(node) === 'string' ? String(getNodeError(node)) : undefined,
  }

  if (!options.includePreview || !output) {
    return summary
  }

  return {
    ...summary,
    preview: buildNodeOutputPreview(output, options.sampleSize),
  }
}

const getServerNodeCatalog = () => buildServerWorkflowAiNodeCatalog()

const buildSearchIndex = (): SearchableText[] =>
  getServerNodeCatalog().map((item) => {
    const hints = item.assistantHints as { keywords?: string[]; useCases?: string[] } | null | undefined
    const propertyText = item.properties
      .map((property: WorkflowAiNodeCatalogItem['properties'][number]) =>
        `${property.name} ${property.displayName} ${property.description ?? ''}`)
      .join(' ')
    const hintText = [...(hints?.keywords ?? []), ...(hints?.useCases ?? [])].join(' ')

    return {
      item,
      haystack: `${item.name} ${item.displayName} ${item.description} ${propertyText} ${hintText}`.toLowerCase(),
    }
  })

const getCatalogItem = (nodeType: string) =>
  getServerNodeCatalog().find((item) => item.name === nodeType) ?? null

const toWorkflowSnapshot = (workflow: SavedWorkflowLike | null): WorkflowSnapshot | null => {
  if (!workflow) return null
  return {
    name: workflow.name,
    nodes: cloneValue(workflow.nodes),
    edges: cloneValue(workflow.edges),
  }
}

const buildCreatePlanFromSnapshot = (snapshot: WorkflowSnapshot): WorkflowAiPlan => ({
  summary: snapshot.name || '工作流校验',
  assumptions: [],
  warnings: [],
  questions: [],
  operations: [
    ...(snapshot.nodes as SnapshotNodeLike[]).map((node) => ({
      id: String(node.id),
      type: 'createNode' as const,
      nodeType: String(node.type ?? ''),
      ...(node.label ? { nodeLabel: String(node.label) } : {}),
      ...(node.position ? { position: cloneValue(node.position as { x: number; y: number }) } : {}),
      ...(node.config ? { config: cloneValue(node.config as Record<string, unknown>) } : {}),
    })),
    ...(snapshot.edges as SnapshotEdgeLike[]).map((edge, index) => ({
      id: String(edge.id ?? `edge_${index + 1}`),
      type: 'connectNodes' as const,
      sourceRef: String(edge.source),
      targetRef: String(edge.target),
      ...(edge.sourceHandle ? { sourceHandle: String(edge.sourceHandle) } : {}),
      ...(edge.targetHandle ? { targetHandle: String(edge.targetHandle) } : {}),
    })),
  ],
})

const buildValidationResult = (snapshot: WorkflowSnapshot, nodeCatalog: WorkflowAiNodeCatalogItem[]) => {
  const existingNodeTypes = (snapshot.nodes as SnapshotNodeLike[]).map((node) => String(node.type ?? ''))
  const validationCatalog = buildServerWorkflowAiValidationCatalog(existingNodeTypes)

  return validateWorkflowAiPlanAgainstContext(buildCreatePlanFromSnapshot(snapshot), {
    nodeCatalog: validationCatalog.length ? validationCatalog : nodeCatalog,
  })
}

const ensureWorkflow = async (storage: WorkflowMcpStorageGateway, userId: string, workflowId: string) => {
  const workflow = await storage.getUserWorkflowById(userId, workflowId)
  if (!workflow) {
    throw new Error(`未找到工作流 ${workflowId}`)
  }
  return workflow as SavedWorkflowLike
}

const filterSnapshotToUpstream = (snapshot: WorkflowSnapshot, targetNodeId: string): WorkflowSnapshot => {
  const incomingByTarget = new Map<string, Array<Record<string, unknown>>>()
  ;(snapshot.edges as SnapshotEdgeLike[]).forEach((edge) => {
    const target = String(edge.target)
    const current = incomingByTarget.get(target) ?? []
    current.push(edge as Record<string, unknown>)
    incomingByTarget.set(target, current)
  })

  const visited = new Set<string>()
  const walk = (nodeId: string) => {
    if (visited.has(nodeId)) return
    visited.add(nodeId)
    for (const edge of incomingByTarget.get(nodeId) ?? []) {
      walk(String(edge.source))
    }
  }

  walk(targetNodeId)

  return {
    name: snapshot.name,
    nodes: (snapshot.nodes as SnapshotNodeLike[]).filter((node) => visited.has(String(node.id))),
    edges: (snapshot.edges as SnapshotEdgeLike[]).filter((edge) =>
      visited.has(String(edge.source)) && visited.has(String(edge.target))),
  }
}

const buildExecutionRecordFromResults = (
  workflow: SavedWorkflowLike,
  results: Awaited<ReturnType<typeof executeNodesForAgent>>,
) => {
  const resultMap = new Map(results.map((item) => [item.nodeId, item]))
  const nodes = workflow.nodes.map((node) => {
    const result = resultMap.get(String(node.id))
    return {
      ...cloneValue(node),
      output: result?.success
        ? { kind: result.resultKind ?? 'unknown', payload: result.result ?? result.sampleRows ?? [] }
        : null,
      status: result?.success ? 'success' : result ? 'error' : 'idle',
      error: result?.error,
      outputSummary: result?.resultSummary,
    }
  })

  return {
    id: `exec_${Date.now()}`,
    workflowId: workflow.id,
    workflowName: workflow.name,
    startTime: Date.now(),
    duration: 0,
    status: results.some((item) => !item.success) ? ('error' as const) : ('success' as const),
    nodes,
    edges: cloneValue(workflow.edges),
  }
}

export const createWorkflowMcpRuntime = (options: CreateWorkflowMcpRuntimeOptions) => {
  const { storage } = options

  return {
    searchNodes(query: string) {
      const normalizedQuery = normalizeString(query)
      const items = !normalizedQuery
        ? getServerNodeCatalog()
        : buildSearchIndex()
          .filter((entry) => entry.haystack.includes(normalizedQuery))
          .map((entry) => entry.item)

      return {
        total: items.length,
        items,
      }
    },

    getNode(
      nodeType: string,
      mode: 'info' | 'docs' | 'search_properties' | 'runtime_requirements' = 'info',
      propertyQuery?: string,
      config?: Record<string, unknown>,
    ) {
      const item = getCatalogItem(nodeType)
      const definition = getServerNodeCatalogItem(nodeType)
      if (!item || !definition) {
        return {
          found: false,
          message: `未找到节点定义: ${nodeType}`,
        }
      }

      if (mode === 'docs') {
        return {
          found: true,
          item,
          docs: [
            `# ${definition.displayName}`,
            '',
            definition.description,
            '',
            ...definition.properties.map((property) =>
              `- ${property.displayName}（${property.name}）: ${property.description ?? '无说明'}`),
          ].join('\n'),
        }
      }

      if (mode === 'search_properties') {
        const query = normalizeString(propertyQuery)
        const properties = item.properties.filter((property: WorkflowAiNodeCatalogItem['properties'][number]) =>
          `${property.name} ${property.displayName} ${property.description ?? ''}`.toLowerCase().includes(query))
        return {
          found: true,
          item,
          properties,
        }
      }

      if (mode === 'runtime_requirements') {
        const runtimeRequirements = definition.properties.map((property) => ({
          name: property.name,
          displayName: property.displayName,
          required: property.required ?? false,
          isRuntimeInput: property.isRuntimeInput ?? false,
          visible: !property.visibleWhen || property.visibleWhen(config ?? {}),
          dependsOn: property.dependsOn ?? [],
          type: property.type,
          description: property.description ?? '',
        }))
        return {
          found: true,
          item,
          runtimeRequirements,
        }
      }

      return {
        found: true,
        item,
      }
    },

    async getNodeOptions(
      nodeType: string,
      propertyName: string,
      config?: Record<string, unknown>,
      upstreamSample?: unknown,
    ) {
      return resolveServerNodePropertyOptions(nodeType, propertyName, config ?? {}, upstreamSample)
    },

    profileDataSource(sessionRequest: WorkflowAiPlanRequest, dataSourceId: string) {
      const item = (sessionRequest.dataSources ?? []).find((source) => source.id === dataSourceId)
      if (!item) {
        return {
          found: false,
          message: `未找到数据源: ${dataSourceId}`,
        }
      }

      const rows = Array.isArray(item.bindingPayload?.rows)
        ? item.bindingPayload.rows as Array<Record<string, unknown>>
        : []

      if (!rows.length) {
        return {
          found: false,
          dataSourceId,
          message: '当前数据源没有可画像的行数据',
        }
      }

      return {
        found: true,
        dataSourceId,
        profile: buildDataProfile(rows),
      }
    },

    recommendMethods(sessionRequest: WorkflowAiPlanRequest, dataSourceId: string) {
      const profiled = this.profileDataSource(sessionRequest, dataSourceId)
      const profile = 'profile' in profiled ? profiled.profile : null
      if (!profiled.found || !profile) {
        return profiled
      }

      return {
        found: true,
        dataSourceId,
        advice: recommendAnalysisMethods(profile),
      }
    },

    extractResultEvidence(execution: AgentExecutionRecord | null | undefined) {
      if (!execution) {
        return {
          found: false,
          message: '未找到执行记录',
          evidence: [],
        }
      }

      return {
        found: true,
        executionId: execution.executionId,
        evidence: extractResultEvidence(execution),
      }
    },

    async createWorkflow(userId: string, input?: { workflowId?: string; name?: string }) {
      const workflowId = input?.workflowId?.trim() || `workflow_${Date.now()}`
      const workflow = {
        id: workflowId,
        name: input?.name?.trim() || '未命名工作流',
        updatedAt: Date.now(),
        nodes: [],
        edges: [],
      }
      await storage.saveUserWorkflow(userId, workflow)
      return workflow
    },

    async getWorkflow(userId: string, workflowId: string, mode: 'full' | 'structure' | 'minimal' = 'full') {
      const workflow = await storage.getUserWorkflowById(userId, workflowId)
      if (!workflow) {
        return {
          found: false,
          message: `未找到工作流 ${workflowId}`,
        }
      }

      if (mode === 'minimal') {
        return {
          found: true,
          workflow: {
            id: workflow.id,
            name: workflow.name,
            updatedAt: workflow.updatedAt,
            nodeCount: workflow.nodes.length,
            edgeCount: workflow.edges.length,
          },
        }
      }

      if (mode === 'structure') {
        return {
          found: true,
          workflow: {
            id: workflow.id,
            name: workflow.name,
            updatedAt: workflow.updatedAt,
            nodes: (workflow.nodes as SnapshotNodeLike[]).map((node) => ({
              id: node.id,
              type: node.type,
              label: node.label,
            })),
            edges: (workflow.edges as SnapshotEdgeLike[]).map((edge) => ({
              id: edge.id,
              source: edge.source,
              target: edge.target,
            })),
          },
        }
      }

      return {
        found: true,
        workflow,
      }
    },

    async updatePartialWorkflow(
      userId: string,
      workflowId: string,
      operations: WorkflowAiOperation[],
      summary?: string,
      validateAfterApply = true,
    ) {
      const existing = await ensureWorkflow(storage, userId, workflowId)
      const draft = createDraftGraphFromWorkflowSnapshot(toWorkflowSnapshot(existing) ?? undefined)
      const mutations = buildDraftMutationsFromPlan({
        summary: summary ?? existing.name,
        assumptions: [],
        warnings: [],
        questions: [],
        operations,
      })
      const nextDraft = applyDraftMutations(draft, mutations)
      const materialized = materializeDraftGraphToWorkflowSnapshot(nextDraft, toWorkflowSnapshot(existing) ?? undefined)
      const updatedWorkflow = {
        ...existing,
        name: materialized.name || existing.name,
        updatedAt: Date.now(),
        nodes: materialized.nodes as Array<Record<string, unknown>>,
        edges: materialized.edges as Array<Record<string, unknown>>,
      }

      const validation = validateAfterApply
        ? buildValidationResult(
            {
              name: updatedWorkflow.name,
              nodes: updatedWorkflow.nodes,
              edges: updatedWorkflow.edges,
            },
            getServerNodeCatalog(),
          )
        : null

      await storage.saveUserWorkflow(userId, updatedWorkflow)

      return {
        ok: true,
        workflowId: updatedWorkflow.id,
        appliedOperations: operations.length,
        workflowSnapshot: {
          id: updatedWorkflow.id,
          name: updatedWorkflow.name,
          nodeCount: updatedWorkflow.nodes.length,
          edgeCount: updatedWorkflow.edges.length,
          updatedAt: updatedWorkflow.updatedAt,
        },
        ...(validation
          ? {
              validation: {
                valid: validation.valid,
                issues: validation.issues.map((issue) => ({
                  code: issue.stage,
                  message: issue.message,
                  level: issue.stage === 'validate' ? ('error' as const) : ('warn' as const),
                })),
              },
            }
          : {}),
      }
    },

    async updateFullWorkflow(userId: string, workflow: SavedWorkflowLike) {
      const nextWorkflow = {
        ...workflow,
        updatedAt: Date.now(),
      }
      await storage.saveUserWorkflow(userId, nextWorkflow)
      return {
        ok: true,
        workflowId: nextWorkflow.id,
        workflowSnapshot: {
          id: nextWorkflow.id,
          name: nextWorkflow.name,
          nodeCount: nextWorkflow.nodes.length,
          edgeCount: nextWorkflow.edges.length,
          updatedAt: nextWorkflow.updatedAt,
        },
      }
    },

    async validateWorkflow(userId: string, input: { workflowId?: string; workflowSnapshot?: WorkflowSnapshot }) {
      const workflow = input.workflowSnapshot
        ? input.workflowSnapshot
        : toWorkflowSnapshot(await ensureWorkflow(storage, userId, input.workflowId ?? ''))
      if (!workflow) {
        return {
          valid: false,
          issues: [{ code: 'not_found', message: '未找到待校验工作流', level: 'error' as const }],
        }
      }

      const validation = buildValidationResult(workflow, getServerNodeCatalog())
      return {
        valid: validation.valid,
        issues: validation.issues.map((issue) => ({
          code: issue.stage,
          message: issue.message,
          level: issue.stage === 'validate' ? ('error' as const) : ('warn' as const),
        })),
      }
    },

    async debugNode(
      userId: string,
      sessionRequest: WorkflowAiPlanRequest,
      input: {
        workflowId: string
        nodeId: string
        mode?: 'reuse_cached_upstream' | 'rerun_upstream'
        includeUpstreamTrace?: boolean
      },
    ) {
      const workflow = await ensureWorkflow(storage, userId, input.workflowId)
      const workflowSnapshot = toWorkflowSnapshot(workflow)
      if (!workflowSnapshot) {
        return {
          ok: false,
          nodeId: input.nodeId,
          error: {
            code: 'node_not_found',
            message: '未找到工作流快照',
          },
        }
      }

      const targetNode = workflow.nodes.find((node) => String(node.id) === input.nodeId)
      if (!targetNode) {
        return {
          ok: false,
          nodeId: input.nodeId,
          error: {
            code: 'node_not_found',
            message: `未找到节点 ${input.nodeId}`,
            actionableHint: '请先读取工作流结构，确认节点 ID 是否正确。',
          },
        }
      }

      const filteredSnapshot = filterSnapshotToUpstream(workflowSnapshot, input.nodeId)
      const plan = buildCreatePlanFromSnapshot(filteredSnapshot)
      const executionResults = await executeNodesForAgent(
        plan,
        {
          ...sessionRequest,
          workflowSnapshot: filteredSnapshot,
        },
        () => undefined,
      )

      const targetResult = executionResults.find((item) => item.nodeId === input.nodeId)
      const upstreamTrace = executionResults
        .filter((item) => item.nodeId !== input.nodeId)
        .map((item) => ({
          nodeId: item.nodeId,
          nodeLabel: item.nodeLabel,
          status: item.success ? ('success' as const) : ('failed' as const),
          resultSummary: item.resultSummary,
          ...(item.error ? { error: item.error } : {}),
        }))

      if (!targetResult) {
        return {
          ok: false,
          nodeId: input.nodeId,
          nodeLabel: String(targetNode.label ?? targetNode.type ?? input.nodeId),
          nodeType: String(targetNode.type ?? 'unknown'),
          reusedUpstream: false,
          sourceKind: 'draft-ephemeral-run' as const,
          error: {
            code: 'execution_failed',
            message: '未产生目标节点执行结果',
            actionableHint: '请检查节点是否在当前工作流中可达。',
          },
          ...(input.includeUpstreamTrace ? { upstreamTrace } : {}),
        }
      }

      if (!targetResult.success) {
        return {
          ok: false,
          nodeId: targetResult.nodeId,
          nodeLabel: targetResult.nodeLabel,
          nodeType: targetResult.nodeType,
          reusedUpstream: false,
          sourceKind: 'draft-ephemeral-run' as const,
          resultSummary: targetResult.resultSummary,
          error: {
            code: upstreamTrace.some((item) => item.status === 'failed') ? 'upstream_failed' : 'execution_failed',
            message: targetResult.error ?? targetResult.resultSummary,
            actionableHint: '请先根据 upstreamTrace 修复上游节点或当前节点配置。',
          },
          ...(input.includeUpstreamTrace ? { upstreamTrace } : {}),
        }
      }

      return {
        ok: true,
        nodeId: targetResult.nodeId,
        nodeLabel: targetResult.nodeLabel,
        nodeType: targetResult.nodeType,
        sourceKind: 'draft-ephemeral-run' as const,
        reusedUpstream: input.mode === 'reuse_cached_upstream',
        resultSummary: targetResult.resultSummary,
        resultKind: targetResult.resultKind,
        outputPreview: targetResult.result ?? targetResult.sampleRows ?? null,
        ...(input.includeUpstreamTrace ? { upstreamTrace } : {}),
      }
    },

    async testWorkflow(userId: string, sessionRequest: WorkflowAiPlanRequest, input: { workflowId: string }) {
      const workflow = await ensureWorkflow(storage, userId, input.workflowId)
      const workflowSnapshot = toWorkflowSnapshot(workflow)
      if (!workflowSnapshot) {
        throw new Error('未找到工作流快照')
      }

      const plan = buildCreatePlanFromSnapshot(workflowSnapshot)
      const results = await executeNodesForAgent(
        plan,
        {
          ...sessionRequest,
          workflowSnapshot,
        },
        () => undefined,
      )

      const record = buildExecutionRecordFromResults(workflow, results)
      await storage.saveUserHistory(userId, record)

      return {
        ok: true,
        executionId: record.id,
        status: record.status,
        nodeResults: results,
      }
    },

    async executions(
      userId: string,
      input: {
        mode?: 'list' | 'get' | 'node_result' | 'artifacts'
        executionId?: string
        nodeId?: string
        detailLevel?: 'summary' | 'sample'
        sampleSize?: number
        limit?: number
        offset?: number
      },
    ) {
      const mode = input.mode ?? 'list'
      const detailLevel = input.detailLevel ?? (mode === 'node_result' ? 'sample' : 'summary')
      const includePreview = detailLevel === 'sample'
      const sampleSize = resolveHistorySampleSize(input.sampleSize)
      const history = await storage.getUserHistory(userId)

      if (mode === 'list') {
        return paginateItems(history.map((item) => buildExecutionSummary(item)), input)
      }

      const execution = history.find((item) => item.id === input.executionId)
      if (!execution) {
        return {
          found: false,
          message: `未找到执行记录 ${input.executionId}`,
        }
      }

      if (mode === 'get') {
        return {
          found: true,
          execution: {
            ...buildExecutionSummary(execution),
            nodes: (execution.nodes as Array<Record<string, unknown>>).map((node) =>
              buildExecutionNodeSummary(node, { includePreview, sampleSize })),
          },
        }
      }

      if (mode === 'node_result') {
        const node = (execution.nodes as Array<Record<string, unknown>>).find((item) => String(item.id) === input.nodeId)
        return {
          found: Boolean(node),
          executionId: execution.id,
          ...(node ? { node: buildExecutionNodeSummary(node, { includePreview, sampleSize }) } : { node: null }),
        }
      }

      const artifacts = (execution.nodes as Array<Record<string, unknown>>)
        .filter((node) => getNodeOutput(node))
        .map((node) => ({
          artifactId: `${execution.id}:${String(node.id)}`,
          kind: 'node-result',
          label: String(getNodeLabel(node) ?? getNodeType(node) ?? node.id),
          nodeId: String(node.id),
          resultKind: buildExecutionNodeSummary(node, { includePreview: false, sampleSize }).resultKind,
        }))

      return {
        found: true,
        executionId: execution.id,
        artifacts,
      }
    },

    async listWorkflowVersions(
      userId: string,
      input: { workflowId: string; limit?: number; offset?: number },
    ) {
      const versions = await storage.getUserWorkflowVersions(userId, input.workflowId)
      return {
        workflowId: input.workflowId,
        ...paginateItems(versions, input),
      }
    },

    async getWorkflowVersion(
      userId: string,
      input: { workflowId: string; versionId: string },
    ) {
      return {
        workflowId: input.workflowId,
        versionId: input.versionId,
        version: await storage.getUserWorkflowVersion(userId, input.workflowId, input.versionId),
      }
    },

    async rollbackWorkflowVersion(
      userId: string,
      input: { workflowId: string; versionId: string },
    ) {
      return {
        workflowId: input.workflowId,
        versionId: input.versionId,
        result: await storage.rollbackUserWorkflowVersion(userId, input.workflowId, input.versionId),
      }
    },

    async workflowVersions(
      userId: string,
      input: {
        mode?: 'list' | 'get' | 'rollback'
        workflowId: string
        versionId?: string
        limit?: number
        offset?: number
      },
    ) {
      const mode = input.mode ?? 'list'

      if (mode === 'list') {
        return this.listWorkflowVersions(userId, input)
      }

      if (mode === 'get') {
        return this.getWorkflowVersion(userId, {
          workflowId: input.workflowId,
          versionId: input.versionId ?? '',
        })
      }

      return this.rollbackWorkflowVersion(userId, {
        workflowId: input.workflowId,
        versionId: input.versionId ?? '',
      })
    },
  }
}

export type WorkflowMcpRuntime = ReturnType<typeof createWorkflowMcpRuntime>
