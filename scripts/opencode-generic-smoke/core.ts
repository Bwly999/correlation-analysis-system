export type OpencodeGenericSmokeProjection = {
  analysis: {
    summary: string
  }
  execution: {
    status: string
    latestAction: string
    toolCalls: Array<{ toolName: string }>
  }
}

export type OpencodeGenericSmokeSession = {
  id: string
  status: string
}

export type OpencodeGenericSmokeResult = {
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

const containsChinese = (value: string) => /[\u4e00-\u9fa5]/.test(value)

export const evaluateOpencodeGenericSmoke = (input: {
  session: OpencodeGenericSmokeSession
  projection: OpencodeGenericSmokeProjection
}): OpencodeGenericSmokeResult => {
  const toolNames = [...new Set(input.projection.execution.toolCalls.map((item) => item.toolName))]
  const missingChecks: string[] = []

  if (input.session.status === 'failed' || input.projection.execution.status === 'failed') {
    missingChecks.push('执行状态不能为 failed')
  }

  if (!toolNames.some((toolName) => toolName.startsWith('workflow_') || toolName === 'list_workflow_tools')) {
    missingChecks.push('至少需要一次 workflow MCP 工具调用')
  }

  if (!containsChinese(input.projection.analysis.summary)) {
    missingChecks.push('助手回复必须包含中文')
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
