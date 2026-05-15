/**
 * 工具注册入口 - 统一构建所有工具
 */
import type { WorkflowAiPlanRequest } from '../../../ai/types.js'
import type { FrontendBridge } from '../frontendBridge.js'
import { createContextTools } from './contextTools.js'
import { createSearchTools } from './searchTools.js'
import { createWorkflowTools } from './workflowTools.js'
import { createAtomicWorkflowTools } from './atomicWorkflowTools.js'

interface BuildToolsOptions {
  request: WorkflowAiPlanRequest
  userId: string
  /** 前端桥接实例（用于原子工作流工具的请求-响应转发） */
  bridge?: FrontendBridge
}

export function buildAllTools(options: BuildToolsOptions) {
  const { request, bridge } = options

  const tools = [
    ...createContextTools(request),
    ...createSearchTools(),
    // 原子工作流工具（需要 bridge 转发到前端执行）
    ...(bridge ? createAtomicWorkflowTools(bridge) : []),
    // 保留旧版粗粒度工具作为 fallback（当 bridge 不可用时）
    ...createWorkflowTools(request),
  ]

  return tools
}
