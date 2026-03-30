import type { WorkflowAiPlanMode } from '../types.js'

export interface WorkflowRecipe {
  id: string
  name: string
  description: string
  appliesToModes: WorkflowAiPlanMode[]
  keywords: string[]
  excludeKeywords?: string[]
  minimalPattern: string[]
  preferredEntryNodes: string[]
  preferredTerminalNodes: string[]
  requiresSchemaInspection?: boolean
}

export interface WorkflowRecipeSearchInput {
  prompt: string
  mode: WorkflowAiPlanMode
}

export interface WorkflowRecipeMatch {
  id: string
  name: string
  score: number
  reason: string
  minimalPattern: string[]
  preferredEntryNodes: string[]
  preferredTerminalNodes: string[]
  requiresSchemaInspection: boolean
}
