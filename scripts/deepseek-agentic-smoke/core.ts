export type DeepSeekSmokeProjection = {
  analysis: {
    summary: string
  }
  execution: {
    status: string
    latestAction: string
    toolCalls: Array<{ toolName: string }>
  }
}

export type DeepSeekSmokeSession = {
  id: string
  status: string
}

export type DeepSeekSmokeResult = {
  ok: boolean
  sessionId?: string
  sessionStatus?: string
  executionStatus?: string
  latestAction?: string
  toolCallCount?: number
  toolNames?: string[]
  analysisSummary?: string
  missingChecks?: string[]
  error?: string
}

const REQUIRED_TOOL_GROUPS = [
  ['workflow_get_session_context', 'workflow_list_data_sources', 'workflow_get_data_source_schema'],
  ['workflow_profile_data_source', 'workflow_recommend_methods'],
  ['workflow_test_workflow', 'workflow_execute_plan'],
  ['workflow_extract_result_evidence'],
]

const containsChinese = (value: string) => /[\u4e00-\u9fa5]/.test(value)

export const evaluateDeepSeekAgenticSmoke = (input: {
  session: DeepSeekSmokeSession
  projection: DeepSeekSmokeProjection
}): DeepSeekSmokeResult => {
  const toolNames = [...new Set(input.projection.execution.toolCalls.map((item) => item.toolName))]
  const missingChecks: string[] = []

  if (input.session.status === 'failed' || input.projection.execution.status === 'failed') {
    missingChecks.push('执行状态不能为 failed')
  }

  for (const group of REQUIRED_TOOL_GROUPS) {
    if (!group.some((toolName) => toolNames.includes(toolName))) {
      missingChecks.push(`缺少关键工具调用：${group.join(' / ')}`)
    }
  }

  if (!containsChinese(input.projection.analysis.summary)) {
    missingChecks.push('分析摘要必须包含中文')
  }

  return {
    ok: missingChecks.length === 0,
    sessionId: input.session.id,
    sessionStatus: input.session.status,
    executionStatus: input.projection.execution.status,
    latestAction: input.projection.execution.latestAction,
    toolCallCount: input.projection.execution.toolCalls.length,
    toolNames,
    analysisSummary: input.projection.analysis.summary,
    ...(missingChecks.length > 0 ? { missingChecks } : {}),
  }
}
