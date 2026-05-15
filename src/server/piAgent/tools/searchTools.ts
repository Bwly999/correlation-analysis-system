/**
 * 搜索类工具
 */
import { defineTool } from '@earendil-works/pi-coding-agent'
import { Type } from 'typebox'
import {
  buildServerWorkflowAiNodeCatalog,
  getServerNodeCatalogItem,
} from '../../workflowAi/nodeCatalog.js'

const result = (text: string, isError = false) => ({
  content: [{ type: 'text' as const, text }],
  details: {},
  ...(isError ? { isError: true } : {}),
})

export function createSearchTools() {
  const searchNodes = defineTool({
    name: 'workflow_search_nodes',
    label: '搜索节点',
    description:
      '根据关键词搜索可用节点类型。支持按名称、描述、分类和用途搜索。返回匹配的节点列表。',
    parameters: Type.Object({
      query: Type.String({ description: '搜索关键词' }),
      category: Type.Optional(
        Type.String({ description: '按分类过滤：trigger / action / terminal' }),
      ),
    }),
    async execute(_callId, params, _signal, _onUpdate, _ctx) {
      const catalog = buildServerWorkflowAiNodeCatalog()
      const query = params.query.toLowerCase()

      let results = catalog.filter((item) => {
        const searchText =
          `${item.name} ${item.displayName} ${item.description} ${item.category}`.toLowerCase()
        return searchText.includes(query)
      })

      if (params.category) {
        results = results.filter((item) => item.category === params.category)
      }

      const summary = results.map((item) => ({
        name: item.name,
        displayName: item.displayName,
        category: item.category,
        description: item.description,
      }))

      return result(
        results.length
          ? JSON.stringify(summary, null, 2)
          : `未找到匹配 "${params.query}" 的节点`,
      )
    },
  })

  const getNodeDefinition = defineTool({
    name: 'workflow_get_node_definition',
    label: '读取节点定义',
    description:
      '获取指定节点类型的完整定义，包括所有属性、输入输出模式、连接规则等详细信息。',
    parameters: Type.Object({
      nodeType: Type.String({ description: '节点类型名称（如 pearson-correlation）' }),
    }),
    async execute(_callId, params, _signal, _onUpdate, _ctx) {
      const item = getServerNodeCatalogItem(params.nodeType)
      if (!item) {
        return result(`未找到节点类型: ${params.nodeType}`, true)
      }

      const publicItem = {
        name: item.name,
        displayName: item.displayName,
        category: item.category,
        description: item.description,
        inputMode: item.inputMode,
        minInputs: item.minInputs,
        maxInputs: item.maxInputs,
        allowedNextCategories: item.allowedNextCategories,
        properties: item.properties.map((p) => ({
          name: p.name,
          displayName: p.displayName,
          type: p.type,
          required: p.required,
          isRuntimeInput: p.isRuntimeInput,
          defaultValue: p.defaultValue,
          description: p.description,
          options: p.options || undefined,
        })),
        assistantHints: item.assistantHints,
      }

      return result(JSON.stringify(publicItem, null, 2))
    },
  })

  return [searchNodes, getNodeDefinition]
}
