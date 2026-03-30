import type { WorkflowAiPlanRequest } from '../../../ai/types.js'

export const getWorkflowContextTool = (request: WorkflowAiPlanRequest) => {
  const nodeCount = Array.isArray(request.workflowSnapshot?.nodes) ? request.workflowSnapshot?.nodes.length : 0
  const edgeCount = Array.isArray(request.workflowSnapshot?.edges) ? request.workflowSnapshot?.edges.length : 0
  const workflowName = request.workflowSnapshot?.name ?? '未命名工作流'

  return {
    ok: true,
    message:
      request.mode === 'edit'
        ? `已读取当前工作流「${workflowName}」，共 ${nodeCount} 个节点、${edgeCount} 条连线`
        : `当前为创建模式，工作流名「${workflowName}」`,
    data: {
      workflowName,
      nodeCount,
      edgeCount,
      mode: request.mode,
    },
  }
}
