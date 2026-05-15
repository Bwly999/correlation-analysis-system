/**
 * 工具注册入口 - 统一构建所有工具
 */
import type { WorkflowAiPlanRequest } from '../../../ai/types.js'
import { createContextTools } from './contextTools.js'
import { createSearchTools } from './searchTools.js'
import { createWorkflowTools } from './workflowTools.js'

interface BuildToolsOptions {
  request: WorkflowAiPlanRequest
  userId: string
}

export function buildAllTools(options: BuildToolsOptions) {
  const { request } = options

  return [
    ...createContextTools(request),
    ...createSearchTools(),
    ...createWorkflowTools(request),
  ]
}
