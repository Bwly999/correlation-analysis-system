/**
 * 上下文读取类工具
 */
import { defineTool } from '@earendil-works/pi-coding-agent'
import { Type } from 'typebox'
import type { WorkflowAiPlanRequest } from '../../../ai/types.js'
import { buildServerWorkflowAiNodeCatalog } from '../../workflowAi/nodeCatalog.js'

const result = (text: string, isError = false) => ({
  content: [{ type: 'text' as const, text }],
  details: {},
  ...(isError ? { isError: true } : {}),
})

export function createContextTools(request: WorkflowAiPlanRequest) {
  const getSessionContext = defineTool({
    name: 'workflow_get_session_context',
    label: '读取分析上下文',
    description:
      '读取当前分析会话的完整上下文，包括模式、用户需求、数据源、已有工作流等信息。这是规划工作流的起点。',
    parameters: Type.Object({}),
    async execute(_callId, _params, _signal, _onUpdate, _ctx) {
      const context = {
        mode: request.mode,
        prompt: request.prompt,
        dataSources: (request.dataSources || []).map((ds) => ({
          id: ds.id,
          kind: ds.kind,
          label: ds.label,
          entryNodeType: ds.entryNodeType,
        })),
        existingWorkflow: request.workflowSnapshot
          ? {
              name: request.workflowSnapshot.name,
              nodeCount: request.workflowSnapshot.nodes.length,
              edgeCount: request.workflowSnapshot.edges.length,
            }
          : null,
        contextHints: request.contextHints || null,
      }
      return result(JSON.stringify(context, null, 2))
    },
  })

  const getNodeCatalog = defineTool({
    name: 'workflow_get_node_catalog',
    label: '读取节点目录',
    description:
      '获取所有可用节点类型的目录，包括名称、分类、描述、输入输出模式和属性列表。用于了解可以创建哪些节点。',
    parameters: Type.Object({}),
    async execute(_callId, _params, _signal, _onUpdate, _ctx) {
      const catalog = buildServerWorkflowAiNodeCatalog()
      return result(JSON.stringify(catalog, null, 2))
    },
  })

  const listDataSources = defineTool({
    name: 'workflow_list_data_sources',
    label: '列出数据源',
    description: '列出当前会话中可用的所有数据源，包括文件名、字段信息和绑定参数。',
    parameters: Type.Object({}),
    async execute(_callId, _params, _signal, _onUpdate, _ctx) {
      const dataSources = request.dataSources || []
      return result(JSON.stringify(dataSources, null, 2))
    },
  })

  const getDataSourceSchema = defineTool({
    name: 'workflow_get_data_source_schema',
    label: '读取字段摘要',
    description: '读取指定数据源的字段结构摘要，包括数值列、分类列、候选目标列和候选特征列。',
    parameters: Type.Object({
      dataSourceId: Type.String({ description: '数据源 ID' }),
    }),
    async execute(_callId, params, _signal, _onUpdate, _ctx) {
      const ds = (request.dataSources || []).find((d) => d.id === params.dataSourceId)
      if (!ds) {
        return result(`未找到数据源: ${params.dataSourceId}`, true)
      }
      return result(JSON.stringify(ds.schemaSummary, null, 2))
    },
  })

  return [getSessionContext, getNodeCatalog, listDataSources, getDataSourceSchema]
}
