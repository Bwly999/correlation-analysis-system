import { workflowRecipeCatalog } from './catalog.js'
import type { WorkflowRecipe, WorkflowRecipeMatch, WorkflowRecipeSearchInput } from './types.js'

const normalize = (value: string) => value.trim().toLowerCase()
const formatKeyword = (value: string) => (normalize(value) === 'json' ? 'JSON' : value)

export const searchWorkflowRecipes = ({
  prompt,
  mode,
}: WorkflowRecipeSearchInput): WorkflowRecipeMatch[] => {
  const normalizedPrompt = normalize(prompt)

  return workflowRecipeCatalog
    .filter((recipe: WorkflowRecipe) => recipe.appliesToModes.includes(mode))
    .map((recipe: WorkflowRecipe): WorkflowRecipeMatch => {
      let score = 0
      const matchedKeywords = recipe.keywords.filter((keyword: string) =>
        normalizedPrompt.includes(normalize(keyword)),
      )

      score += matchedKeywords.length * 3

      if (recipe.excludeKeywords?.some((keyword: string) => normalizedPrompt.includes(normalize(keyword)))) {
        score -= 100
      }

      if (recipe.id === 'quick-json-demo') {
        if (normalizedPrompt.includes('json')) score += 6
        if (normalizedPrompt.includes('快速') || normalizedPrompt.includes('演示')) score += 5
        if (normalizedPrompt.includes('最小')) score += 4
      }

      if (recipe.id === 'multi-source-merge-analysis') {
        if (normalizedPrompt.includes('合并')) score += 8
        if (normalizedPrompt.includes('sn')) score += 4
        if (normalizedPrompt.includes('两个来源') || normalizedPrompt.includes('多来源')) score += 5
      }

      if (recipe.id === 'single-table-regression') {
        if (normalizedPrompt.includes('回归')) score += 6
      }

      const reasons = matchedKeywords.slice(0, 3).map(formatKeyword)
      const reasonText =
        reasons.length > 0
          ? `命中关键词：${reasons.join('、')}`
          : `适合该需求的最小骨架：${recipe.minimalPattern.join(' -> ')}`

      return {
        id: recipe.id,
        name: recipe.name,
        score,
        reason: reasonText,
        minimalPattern: recipe.minimalPattern,
        preferredEntryNodes: recipe.preferredEntryNodes,
        preferredTerminalNodes: recipe.preferredTerminalNodes,
        requiresSchemaInspection: Boolean(recipe.requiresSchemaInspection),
      }
    })
    .filter((recipe: WorkflowRecipeMatch) => recipe.score > 0)
    .sort(
      (left: WorkflowRecipeMatch, right: WorkflowRecipeMatch) =>
        right.score - left.score || left.id.localeCompare(right.id),
    )
}
