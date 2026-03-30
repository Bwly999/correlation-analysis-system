import { searchWorkflowRecipes } from '../../../ai/recipes/search.js'
import type { WorkflowAiPlanRequest } from '../../../ai/types.js'

export const searchRecipesTool = (request: WorkflowAiPlanRequest) => {
  const recipes =
    request.contextHints?.recipes?.length
      ? request.contextHints.recipes
      : searchWorkflowRecipes({
          prompt: request.prompt,
          mode: request.mode,
        }).slice(0, 3)

  return {
    ok: true,
    message: recipes.length ? `已召回 ${recipes.length} 个候选模板` : '未召回到明确模板',
    data: recipes,
  }
}
