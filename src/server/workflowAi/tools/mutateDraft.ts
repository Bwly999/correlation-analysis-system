import {
  applyDraftMutations,
  buildDraftMutationsFromPlan,
  createDraftGraphFromPlan,
} from '../../../ai/draft/graph.js'
import type { AiDraftGraph, AiDraftMutation } from '../../../ai/draft/types.js'
import type { WorkflowAiPlan } from '../../../ai/types.js'

export const mutateDraftTool = (
  draftOrPlan: AiDraftGraph | WorkflowAiPlan,
  mutations?: AiDraftMutation[],
) => {
  if ('operations' in draftOrPlan) {
    const draft = createDraftGraphFromPlan(draftOrPlan)

    return {
      ok: true,
      message: `已根据计划生成草稿，当前包含 ${draft.nodes.length} 个节点、${draft.edges.length} 条连线`,
      data: draft,
      mutations: buildDraftMutationsFromPlan(draftOrPlan),
    }
  }

  const nextDraft = applyDraftMutations(draftOrPlan, mutations ?? [])

  return {
    ok: true,
    message: `已更新草稿，当前包含 ${nextDraft.nodes.length} 个节点、${nextDraft.edges.length} 条连线`,
    data: nextDraft,
  }
}
