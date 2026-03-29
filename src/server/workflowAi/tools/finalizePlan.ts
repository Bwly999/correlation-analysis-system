import { finalizeDraftGraphToPlan } from '../../../ai/draft/graph.js'
import type { AiDraftGraph } from '../../../ai/draft/types.js'

export const finalizePlanTool = (draft: AiDraftGraph) => ({
  ok: true,
  message: '已将草稿转换为最终计划',
  data: finalizeDraftGraphToPlan(draft),
})
