export type AgenticKernelSmokeProjection = {
  analysis: {
    summary: string
  }
  execution: {
    status: string
    latestAction: string
    toolCalls: Array<{ toolName: string; status: string }>
  }
  error?: { message: string; detail?: string } | null
}

export type AgenticKernelSmokeSession = {
  id: string
  status: string
}

export type AgenticKernelSmokeResult = {
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

const EXECUTION_TOOLS = new Set([
  'workflow_execute_plan',
  'workflow_test_workflow',
  'workflow_create_workflow',
  'workflow_update_partial_workflow',
])

export const evaluateAgenticKernelSmoke = (input: {
  session: AgenticKernelSmokeSession
  projection: AgenticKernelSmokeProjection
}): AgenticKernelSmokeResult => {
  const toolNames = [...new Set(input.projection.execution.toolCalls.map((item) => item.toolName))]
  const missingChecks: string[] = []

  // 如果明确 failed 且没有任何工具调用，才判定失败
  if (input.session.status === 'failed' && toolNames.length === 0) {
    missingChecks.push('执行状态为 failed 且无工具调用')
  }

  if (!toolNames.some((name) => name.startsWith('workflow_') || name === 'list_workflow_tools')) {
    missingChecks.push('至少需要一次 workflow MCP 工具调用')
  }

  // 核心判定：是否调用了执行类工具（说明 agent 完成了分析闭环）
  const hasExecutionTool = toolNames.some((name) => EXECUTION_TOOLS.has(name))
  if (!hasExecutionTool) {
    missingChecks.push('需要至少调用一个执行类工具（execute_plan/test_workflow/create_workflow/update_partial_workflow）')
  }

  if (input.projection.error?.message && input.session.status === 'failed') {
    missingChecks.push(`projection 存在错误：${input.projection.error.message}`)
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
