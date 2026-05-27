import type { WorkflowAiPlanRequest } from '../../../ai/types.js'
import type { FrontendBridge } from '../frontendBridge.js'
import { createAtomicWorkflowTools } from './atomicWorkflowTools.js'
import { createSharedRuntimeTools } from './sharedRuntimeTools.js'

interface BuildToolsOptions {
  request: WorkflowAiPlanRequest
  bridge?: FrontendBridge
}

export function buildAllTools(options: BuildToolsOptions) {
  const { request, bridge } = options

  const tools = [
    ...(bridge ? createAtomicWorkflowTools(bridge) : []),
    ...createSharedRuntimeTools({ request }),
  ]

  return tools
}
