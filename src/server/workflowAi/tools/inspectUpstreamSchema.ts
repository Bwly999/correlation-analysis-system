import { inspectAiSchemaSummary } from '../../../ai/schemaInspector/inspector.js'
import type { AiDraftGraph } from '../../../ai/draft/types.js'
import type { WorkflowAiContextSchemaSummary, WorkflowAiPlanRequest } from '../../../ai/types.js'
import { inspectWorkflowNodeResults } from '../inspectionRuntime.js'

const toContextSchemaSummary = (
  item: ReturnType<typeof inspectAiSchemaSummary>,
  nodeId: string,
  nodeLabel: string,
): WorkflowAiContextSchemaSummary => ({
  nodeId,
  nodeLabel,
  sourceKind: item.source.kind,
  resultKind: item.resultKind,
  rowCount: item.rowCount,
  numericColumns: item.summary.numericColumns,
  categoricalColumns: item.summary.categoricalColumns,
  datetimeColumns: item.summary.datetimeColumns,
  candidateTargetColumns: item.summary.candidateTargetColumns,
  candidateFeatureColumns: item.summary.candidateFeatureColumns,
  blockedReasons: item.summary.blockedReasons,
})

export const inspectUpstreamSchemaTool = async (
  request: WorkflowAiPlanRequest,
  options?: {
    draft?: AiDraftGraph
    targetNodeRefs?: string[]
    includeTerminalNodes?: boolean
  },
) => {
  const cachedSummaries = request.contextHints?.schemaSummaries ?? []
  if (!options?.draft && !options?.targetNodeRefs?.length && cachedSummaries.length > 0) {
    return {
      ok: true,
      message: `已读取 ${cachedSummaries.length} 个节点缓存摘要`,
      data: cachedSummaries,
    }
  }

  const results = await inspectWorkflowNodeResults(request, options)
  const summaries = results
    .filter((result): result is Extract<typeof result, { ok: true }> => result.ok)
    .map((result) =>
      toContextSchemaSummary(
        inspectAiSchemaSummary({
          value: result.value,
          source: {
            kind: result.sourceKind,
            nodeRef: result.nodeId,
          },
        }),
        result.nodeId,
        result.nodeLabel,
      ),
    )

  const issues = results
    .filter((result): result is Extract<typeof result, { ok: false }> => !result.ok)
    .map((result) => ({
      code: 'inspect_failed',
      message: result.message,
      level: 'warn' as const,
    }))

  return {
    ok: summaries.length > 0,
    message: summaries.length ? `已生成 ${summaries.length} 个字段摘要` : '当前没有可用字段摘要',
    data: summaries,
    issues,
  }
}
