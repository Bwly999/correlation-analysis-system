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
} from '../../ai/types.js'
import { executeNodesForAgent } from '../agentLoop/nodeExecutor.js'
import {
  buildServerWorkflowAiNodeCatalog,
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

const buildValidationResult = (snapshot: WorkflowSnapshot, nodeCatalog: WorkflowAiNodeCatalogItem[]) =>
  validateWorkflowAiPlanAgainstContext(buildCreatePlanFromSnapshot(snapshot), {
    nodeCatalog,
  })

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
        limit?: number
        offset?: number
      },
    ) {
      const mode = input.mode ?? 'list'
      const history = await storage.getUserHistory(userId)

      if (mode === 'list') {
        return paginateItems(history, input)
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
          execution,
        }
      }

      if (mode === 'node_result') {
        const node = (execution.nodes as Array<Record<string, unknown>>).find((item) => String(item.id) === input.nodeId)
        return {
          found: Boolean(node),
          executionId: execution.id,
          node,
        }
      }

      const artifacts = (execution.nodes as Array<Record<string, unknown>>)
        .filter((node) => node.output)
        .map((node) => ({
          artifactId: `${execution.id}:${String(node.id)}`,
          kind: 'node-result',
          label: String(node.label ?? node.type ?? node.id),
          nodeId: String(node.id),
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
