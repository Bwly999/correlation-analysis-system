import { defineTool } from '@earendil-works/pi-coding-agent'
import { Type } from 'typebox'
import type { WorkflowAiPlanRequest } from '../../../ai/types.js'
import { getPiWorkflowToolSpecsByTarget } from '../../../shared/piWorkflowTools.js'
import { sanitizePiAgentDataSources } from '../safePayload.js'

const buildResult = (structuredContent: Record<string, unknown>, isError = false) => ({
  content: [{ type: 'text' as const, text: JSON.stringify(structuredContent, null, 2) }],
  details: structuredContent,
  ...(isError ? { isError: true } : {}),
})

export interface CreateSharedRuntimeToolsOptions {
  request: WorkflowAiPlanRequest
}

type SharedRuntimeToolFactory = (
  spec: ReturnType<typeof getPiWorkflowToolSpecsByTarget>[number],
  options: {
    request: WorkflowAiPlanRequest
    safeDataSources: ReturnType<typeof sanitizePiAgentDataSources>
  },
) => ReturnType<typeof defineTool>

export const sharedRuntimeToolFactories: Record<string, SharedRuntimeToolFactory> = {
  getSessionContext: (spec, options) =>
    defineTool({
      name: spec.name,
      label: '读取分析上下文',
      description: spec.description,
      promptSnippet: '读取当前工作流、数据源摘要和用户需求上下文',
      promptGuidelines: [
        '开始规划前先读取 workflow_get_session_context，确认当前画布、数据源摘要和用户目标。',
        '数据源信息已包含在 session context 中，不要再寻找独立的数据源列表工具。',
      ],
      parameters: Type.Object({}),
      async execute() {
        return buildResult({
          mode: options.request.mode,
          prompt: options.request.prompt,
          workflowSnapshotSummary: options.request.workflowSnapshot ?? null,
          contextHints: options.request.contextHints ?? null,
          dataSources: options.safeDataSources,
        })
      },
    }),
}

export function createSharedRuntimeTools(options: CreateSharedRuntimeToolsOptions) {
  const { request } = options
  const specs = getPiWorkflowToolSpecsByTarget('server_runtime')
  const safeDataSources = sanitizePiAgentDataSources(request.dataSources)

  return specs.map((spec) => {
    const factory = sharedRuntimeToolFactories[spec.executorKey]
    if (!factory) {
      throw new Error(`未注册 server_runtime tool factory: ${spec.executorKey}`)
    }
    return factory(spec, { request, safeDataSources })
  })
}
