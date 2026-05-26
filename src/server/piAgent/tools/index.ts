import type { WorkflowAiPlanRequest } from '../../../ai/types.js'
import type { FrontendBridge } from '../frontendBridge.js'
import { createAtomicWorkflowTools } from './atomicWorkflowTools.js'
import { createSharedRuntimeTools } from './sharedRuntimeTools.js'
import type { WorkflowMcpRuntime } from '../../workflowMcp/workflowMcpRuntime.js'

interface BuildToolsOptions {
  request: WorkflowAiPlanRequest
  userId: string
  bridge?: FrontendBridge
  runtime: WorkflowMcpRuntime
}

export function buildAllTools(options: BuildToolsOptions) {
  const { request, bridge, runtime, userId } = options

  const tools = [
    ...(bridge ? createAtomicWorkflowTools(bridge) : []),
    ...createSharedRuntimeTools({
      request,
      runtime,
      userId,
    }),
  ]

  return tools
}
