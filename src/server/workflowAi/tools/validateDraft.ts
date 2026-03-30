import { finalizeDraftGraphToPlan } from '../../../ai/draft/graph.js'
import type { AiDraftGraph } from '../../../ai/draft/types.js'
import type { WorkflowAiPlanRequest } from '../../../ai/types.js'
import { validateWorkflowAiPlanAgainstContext } from '../../../ai/planValidation.js'

export const validateDraftTool = (draft: AiDraftGraph, request: WorkflowAiPlanRequest) => {
  const plan = finalizeDraftGraphToPlan(draft)
  const validation = validateWorkflowAiPlanAgainstContext(plan, {
    nodeCatalog: request.nodeCatalog,
    existingNodes: (request.workflowSnapshot?.nodes ?? []) as Array<{
      id: string
      type: string
      config?: Record<string, unknown>
    }>,
    existingEdges: (request.workflowSnapshot?.edges ?? []) as Array<{
      id?: string
      source: string
      target: string
    }>,
  })

  return {
    ok: validation.valid,
    message: validation.valid ? '草稿校验通过' : validation.issues[0]?.message ?? '草稿校验失败',
    data: validation,
  }
}
