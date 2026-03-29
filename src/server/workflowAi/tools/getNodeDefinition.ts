import type { WorkflowAiNodeCatalogItem } from '../../../ai/types.js'

export const getNodeDefinitionTool = (
  nodeCatalog: WorkflowAiNodeCatalogItem[],
  nodeNames: string[],
) => ({
  ok: true,
  message: nodeNames.length ? `已读取 ${nodeNames.length} 个节点定义` : '未指定节点定义',
  data: nodeCatalog.filter((item) => nodeNames.includes(item.name)),
})
