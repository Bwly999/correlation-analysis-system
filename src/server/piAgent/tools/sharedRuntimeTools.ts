import { defineTool } from '@earendil-works/pi-coding-agent'
import { Type } from 'typebox'
import type { WorkflowAiPlanRequest } from '../../../ai/types.js'
import type { WorkflowMcpRuntime } from '../../opencode/workflowMcpRuntime.js'
import { getPiWorkflowToolSpecsByTarget } from '../../../shared/piWorkflowTools.js'
import { buildServerWorkflowAiNodeCatalog, getServerNodeCatalogItem } from '../../workflowAi/nodeCatalog.js'
import type { ExecutionRecord } from '../../../utils/storage/types.js'

const paginate = <T>(items: T[], input: { limit?: number; offset?: number } = {}) => {
  const limit = Math.min(Math.max(Math.floor(input.limit ?? 20), 1), 100)
  const offset = Math.max(Math.floor(input.offset ?? 0), 0)
  const pageItems = items.slice(offset, offset + limit)
  const nextOffset = offset + pageItems.length
  return {
    total: items.length,
    count: pageItems.length,
    offset,
    limit,
    hasMore: nextOffset < items.length,
    nextOffset: nextOffset < items.length ? nextOffset : null,
    items: pageItems,
  }
}

const buildResult = (structuredContent: Record<string, unknown>, isError = false) => ({
  content: [{ type: 'text' as const, text: JSON.stringify(structuredContent, null, 2) }],
  details: structuredContent,
  ...(isError ? { isError: true } : {}),
})

const buildPersistedExecutionEvidence = (execution: ExecutionRecord) => {
  const evidence = execution.nodes
    .filter((node) => node.data.status === 'success' && node.data.output && typeof node.data.output === 'object')
    .map((node) => {
      const output = node.data.output as Record<string, unknown>
      const payload = output.payload
      const rows =
        Array.isArray(payload)
          ? payload.filter((item) => item && typeof item === 'object').slice(0, 5)
          : undefined

      return {
        evidenceId: `${execution.id}:${node.id}`,
        executionId: execution.id,
        nodeId: node.id,
        nodeLabel: node.data.label,
        nodeType: node.data.type,
        statement: node.data.error || `${node.data.label} 已生成可引用执行证据`,
        resultKind: typeof output.kind === 'string' ? output.kind : 'unknown',
        metrics: {
          status: node.data.status,
        },
        ...(rows ? { previewRows: rows } : {}),
      }
    })

  return {
    found: evidence.length > 0,
    executionId: execution.id,
    evidence,
  }
}

export interface CreateSharedRuntimeToolsOptions {
  request: WorkflowAiPlanRequest
  runtime: WorkflowMcpRuntime
  userId: string
}

export function createSharedRuntimeTools(options: CreateSharedRuntimeToolsOptions) {
  const { request, runtime, userId } = options
  const specs = getPiWorkflowToolSpecsByTarget('server_runtime')

  return specs.map((spec) => {
    switch (spec.name) {
      case 'workflow_get_session_context':
        return defineTool({
          name: spec.name,
          label: '读取分析上下文',
          description: spec.description,
          parameters: Type.Object({}),
          async execute() {
            return buildResult({
              mode: request.mode,
              prompt: request.prompt,
              workflowSnapshot: request.workflowSnapshot ?? null,
              contextHints: request.contextHints ?? null,
              dataSources: request.dataSources ?? [],
            })
          },
        })
      case 'workflow_get_node_catalog':
        return defineTool({
          name: spec.name,
          label: '读取节点目录',
          description: spec.description,
          parameters: Type.Object({
            limit: Type.Optional(Type.Number()),
            offset: Type.Optional(Type.Number()),
          }),
          async execute(_callId, params) {
            return buildResult(paginate(buildServerWorkflowAiNodeCatalog(), params))
          },
        })
      case 'workflow_list_data_sources':
        return defineTool({
          name: spec.name,
          label: '列出数据源',
          description: spec.description,
          parameters: Type.Object({
            limit: Type.Optional(Type.Number()),
            offset: Type.Optional(Type.Number()),
          }),
          async execute(_callId, params) {
            return buildResult(paginate(request.dataSources ?? [], params))
          },
        })
      case 'workflow_get_data_source_schema':
        return defineTool({
          name: spec.name,
          label: '读取字段摘要',
          description: spec.description,
          parameters: Type.Object({
            dataSourceId: Type.String(),
          }),
          async execute(_callId, params) {
            const item = (request.dataSources ?? []).find((source) => source.id === params.dataSourceId)
            return buildResult(item
              ? { found: true, item }
              : { found: false, message: `未找到数据源: ${params.dataSourceId}` })
          },
        })
      case 'workflow_search_nodes':
        return defineTool({
          name: spec.name,
          label: '搜索节点',
          description: spec.description,
          parameters: Type.Object({
            query: Type.Optional(Type.String()),
            limit: Type.Optional(Type.Number()),
            offset: Type.Optional(Type.Number()),
          }),
          async execute(_callId, params) {
            const result = runtime.searchNodes(params.query ?? '')
            return buildResult(paginate(result.items, params))
          },
        })
      case 'workflow_get_node':
        return defineTool({
          name: spec.name,
          label: '读取节点信息',
          description: spec.description,
          parameters: Type.Object({
            nodeType: Type.String(),
            mode: Type.Optional(Type.Union([
              Type.Literal('info'),
              Type.Literal('docs'),
              Type.Literal('search_properties'),
              Type.Literal('runtime_requirements'),
            ])),
            propertyQuery: Type.Optional(Type.String()),
            config: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
          }),
          async execute(_callId, params) {
            return buildResult(runtime.getNode(params.nodeType, params.mode, params.propertyQuery, params.config))
          },
        })
      case 'workflow_get_node_options':
        return defineTool({
          name: spec.name,
          label: '读取节点候选项',
          description: spec.description,
          parameters: Type.Object({
            nodeType: Type.String(),
            propertyName: Type.String(),
            config: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
            upstreamSample: Type.Optional(Type.Unknown()),
          }),
          async execute(_callId, params) {
            return buildResult(await runtime.getNodeOptions(
              params.nodeType,
              params.propertyName,
              params.config,
              params.upstreamSample,
            ))
          },
        })
      case 'workflow_profile_data_source':
        return defineTool({
          name: spec.name,
          label: '数据源画像',
          description: spec.description,
          parameters: Type.Object({
            dataSourceId: Type.String(),
          }),
          async execute(_callId, params) {
            return buildResult(runtime.profileDataSource(request, params.dataSourceId))
          },
        })
      case 'workflow_recommend_methods':
        return defineTool({
          name: spec.name,
          label: '推荐方法',
          description: spec.description,
          parameters: Type.Object({
            dataSourceId: Type.String(),
          }),
          async execute(_callId, params) {
            return buildResult(runtime.recommendMethods(request, params.dataSourceId))
          },
        })
      case 'workflow_create_workflow':
        return defineTool({
          name: spec.name,
          label: '创建工作流',
          description: spec.description,
          parameters: Type.Object({
            workflowId: Type.Optional(Type.String()),
            name: Type.Optional(Type.String()),
          }),
          async execute(_callId, params) {
            return buildResult({
              ok: true,
              workflow: await runtime.createWorkflow(userId, params),
            })
          },
        })
      case 'workflow_get_workflow':
        return defineTool({
          name: spec.name,
          label: '读取工作流',
          description: spec.description,
          parameters: Type.Object({
            workflowId: Type.String(),
            mode: Type.Optional(Type.Union([
              Type.Literal('full'),
              Type.Literal('structure'),
              Type.Literal('minimal'),
            ])),
          }),
          async execute(_callId, params) {
            return buildResult(await runtime.getWorkflow(userId, params.workflowId, params.mode))
          },
        })
      case 'workflow_update_partial_workflow':
        return defineTool({
          name: spec.name,
          label: '增量更新工作流',
          description: spec.description,
          parameters: Type.Object({
            workflowId: Type.String(),
            operations: Type.Array(Type.Any()),
            summary: Type.Optional(Type.String()),
            validateAfterApply: Type.Optional(Type.Boolean()),
          }),
          async execute(_callId, params) {
            return buildResult(await runtime.updatePartialWorkflow(
              userId,
              params.workflowId,
              params.operations as WorkflowAiPlan['operations'],
              params.summary,
              params.validateAfterApply,
            ))
          },
        })
      case 'workflow_update_full_workflow':
        return defineTool({
          name: spec.name,
          label: '整包更新工作流',
          description: spec.description,
          parameters: Type.Object({
            workflow: Type.Object({
              id: Type.String(),
              name: Type.String(),
              updatedAt: Type.Optional(Type.Number()),
              nodes: Type.Array(Type.Record(Type.String(), Type.Unknown())),
              edges: Type.Array(Type.Record(Type.String(), Type.Unknown())),
            }),
          }),
          async execute(_callId, params) {
            return buildResult(await runtime.updateFullWorkflow(userId, {
              ...params.workflow,
              updatedAt: params.workflow.updatedAt ?? Date.now(),
            }))
          },
        })
      case 'workflow_validate_workflow':
        return defineTool({
          name: spec.name,
          label: '校验工作流',
          description: spec.description,
          parameters: Type.Object({
            workflowId: Type.Optional(Type.String()),
            workflowSnapshot: Type.Optional(Type.Object({
              name: Type.String(),
              nodes: Type.Array(Type.Record(Type.String(), Type.Unknown())),
              edges: Type.Array(Type.Record(Type.String(), Type.Unknown())),
            })),
          }),
          async execute(_callId, params) {
            return buildResult(await runtime.validateWorkflow(userId, params))
          },
        })
      case 'workflow_executions':
        return defineTool({
          name: spec.name,
          label: '读取执行历史',
          description: spec.description,
          parameters: Type.Object({
            mode: Type.Optional(Type.Union([
              Type.Literal('list'),
              Type.Literal('get'),
              Type.Literal('node_result'),
              Type.Literal('artifacts'),
            ])),
            executionId: Type.Optional(Type.String()),
            nodeId: Type.Optional(Type.String()),
            limit: Type.Optional(Type.Number()),
            offset: Type.Optional(Type.Number()),
          }),
          async execute(_callId, params) {
            return buildResult(await runtime.executions(userId, params))
          },
        })
      case 'workflow_list_workflow_versions':
        return defineTool({
          name: spec.name,
          label: '读取版本列表',
          description: spec.description,
          parameters: Type.Object({
            workflowId: Type.String(),
            limit: Type.Optional(Type.Number()),
            offset: Type.Optional(Type.Number()),
          }),
          async execute(_callId, params) {
            return buildResult(await runtime.listWorkflowVersions(userId, params))
          },
        })
      case 'workflow_get_workflow_version':
        return defineTool({
          name: spec.name,
          label: '读取版本详情',
          description: spec.description,
          parameters: Type.Object({
            workflowId: Type.String(),
            versionId: Type.String(),
          }),
          async execute(_callId, params) {
            return buildResult(await runtime.getWorkflowVersion(userId, params))
          },
        })
      case 'workflow_rollback_workflow_version':
        return defineTool({
          name: spec.name,
          label: '回滚工作流版本',
          description: spec.description,
          parameters: Type.Object({
            workflowId: Type.String(),
            versionId: Type.String(),
          }),
          async execute(_callId, params) {
            return buildResult(await runtime.rollbackWorkflowVersion(userId, params))
          },
        })
      case 'workflow_get_execution_result':
        return defineTool({
          name: spec.name,
          label: '读取执行结果',
          description: spec.description,
          parameters: Type.Object({
            executionId: Type.String(),
          }),
          async execute(_callId, params) {
            const persisted = await runtime.executions(userId, {
              mode: 'get',
              executionId: params.executionId,
            })
            return buildResult({
              found: 'execution' in persisted && Boolean(persisted.execution),
              execution: 'execution' in persisted ? persisted.execution : null,
              ...(persisted && typeof persisted === 'object' ? persisted : {}),
            })
          },
        })
      case 'workflow_extract_result_evidence':
        return defineTool({
          name: spec.name,
          label: '抽取结果证据',
          description: spec.description,
          parameters: Type.Object({
            executionId: Type.String(),
          }),
          async execute(_callId, params) {
            const persisted = await runtime.executions(userId, {
              mode: 'get',
              executionId: params.executionId,
            })
            if (!('execution' in persisted) || !persisted.execution) {
              return buildResult({
                found: false,
                executionId: params.executionId,
                message: `未找到执行记录 ${params.executionId}`,
                evidence: [],
              })
            }
            return buildResult(buildPersistedExecutionEvidence(persisted.execution as ExecutionRecord))
          },
        })
      default:
        return null
    }
  }).filter((tool): tool is NonNullable<typeof tool> => tool !== null)
}
