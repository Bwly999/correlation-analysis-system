import type {
  AgentLoopOutput,
  AnalysisAgentArtifact,
  AnalysisAgentMessage,
  AnalysisAgentMessageBlock,
  AnalysisAgentSessionState,
  AnalysisAgentTimelineStep,
  AnalysisAgentToolCall,
  WorkflowAiContextSchemaSummary,
  WorkflowAiPlan,
  WorkflowAiSessionState,
  WorkflowAiStreamEvent,
  WorkflowAiToolTraceItem,
} from './types'

export type AgentWorkspaceStreamOutput = {
  attempt: number
  trigger: 'initial' | 'repair'
  text: string
}

export type AgentWorkspaceAutoApplyResult = {
  status: 'idle' | 'applied' | 'failed'
  message: string
}

type BuildMessagesInput = {
  prompt: string
  conversation: Array<{ id: string; role: 'user' | 'assistant'; content: string }>
  toolCalls: AnalysisAgentToolCall[]
  timeline: AnalysisAgentTimelineStep[]
  streamOutputs: AgentWorkspaceStreamOutput[]
  streamEvents: WorkflowAiStreamEvent[]
  plan: WorkflowAiPlan | null
  loopOutput: AgentLoopOutput | null
  autoApplyResult: AgentWorkspaceAutoApplyResult
  session: WorkflowAiSessionState
}

const TOOL_LABEL_MAP: Record<string, string> = {
  get_workflow_context: '检查当前工作流上下文',
  search_recipes: '选择分析路径',
  inspect_cached_schema: '读取字段摘要',
  inspect_ephemeral_schema: '临时检查字段摘要',
  inspect_upstream_schema: '检查上游数据结构',
}

const TIMELINE_TEMPLATE: Array<{ id: string; title: string }> = [
  { id: 'intent', title: '理解问题' },
  { id: 'inspect', title: '检查数据' },
  { id: 'method', title: '选择方法' },
  { id: 'draft', title: '构建流程' },
  { id: 'execute', title: '执行分析' },
  { id: 'interpret', title: '解释结果' },
  { id: 'report', title: '输出结论' },
]

const getToolDisplayName = (toolName: string) => TOOL_LABEL_MAP[toolName] ?? toolName

const formatSchemaSummary = (summary: WorkflowAiContextSchemaSummary) => {
  const details: string[] = []

  if (summary.candidateTargetColumns.length > 0) {
    details.push(`目标候选：${summary.candidateTargetColumns.join('、')}`)
  }
  if (summary.candidateFeatureColumns.length > 0) {
    details.push(`特征候选：${summary.candidateFeatureColumns.slice(0, 3).join('、')}`)
  }
  if (summary.blockedReasons.length > 0) {
    details.push(`限制：${summary.blockedReasons.join('；')}`)
  }

  return `${summary.nodeLabel}: ${details.join('，') || `结果类型 ${summary.resultKind}`}`
}

const isLoopEvent = (event: WorkflowAiStreamEvent) =>
  [
    'loop_started',
    'loop_iteration_started',
    'node_execution_started',
    'node_execution_completed',
    'node_execution_failed',
    'interpretation_completed',
    'loop_iteration_completed',
    'conclusion_started',
    'conclusion_completed',
    'loop_completed',
  ].includes(event.type)

const formatExecutionSummary = (result: AgentLoopOutput['iterations'][number]['executionResults'][number]) =>
  `${result.nodeLabel}: ${result.success ? result.resultSummary : `失败 - ${result.error ?? '未知错误'}`}`

const buildLoopMessages = (
  events: WorkflowAiStreamEvent[],
  autoApplyResult: AgentWorkspaceAutoApplyResult,
): AnalysisAgentMessage[] => {
  const loopEvents = events.filter(isLoopEvent)

  return loopEvents.map((event, index) => {
    const createdAt = Date.now() + 100 + index

    if (event.type === 'conclusion_completed') {
      return {
        id: `agent_loop_conclusion_${index}`,
        role: 'assistant',
        createdAt,
        blocks: [
          {
            type: 'text',
            content: event.conclusion.summary,
          },
        ],
      }
    }

    if (event.type === 'loop_iteration_completed') {
      const details = [
        event.plan.summary,
        ...event.executionResults.map((result) => formatExecutionSummary(result)),
        ...(event.interpretation?.text ? [event.interpretation.text] : []),
      ]
      return {
        id: `agent_loop_iteration_${event.iteration}`,
        role: 'assistant',
        createdAt,
        blocks: [
          {
            type: 'thinking',
            title: '轮次总结',
            summary: `第 ${event.iteration} 轮分析完成`,
            details,
            collapsed: true,
          },
          {
            type: 'artifact',
            artifactId: `iteration_summary_${event.iteration}`,
          },
        ],
      }
    }

    if (event.type === 'loop_completed') {
      return {
        id: `agent_loop_completed_${index}`,
        role: 'assistant',
        createdAt,
        blocks: [
          {
            type: 'thinking',
            title: '自动分析完成',
            summary:
              autoApplyResult.status === 'applied'
                ? '自动分析已完成，已自动同步最终计划'
                : autoApplyResult.status === 'failed'
                  ? '自动分析已完成，但自动同步失败'
                  : '自动分析已完成',
            details: [
              `共完成 ${event.totalIterations} 轮，耗时 ${(event.totalDurationMs / 1000).toFixed(1)} 秒。`,
              ...(autoApplyResult.message ? [autoApplyResult.message] : []),
            ],
            collapsed: true,
          },
        ],
      }
    }

    const summary =
      event.type === 'loop_started'
        ? `准备开始自动分析，最多 ${event.maxIterations} 轮`
        : event.type === 'loop_iteration_started'
          ? `第 ${event.iteration} 轮分析开始`
          : event.type === 'node_execution_started'
            ? `正在执行 ${event.nodeLabel}`
            : event.type === 'node_execution_completed'
              ? `${event.nodeLabel} 执行完成`
              : event.type === 'node_execution_failed'
                ? `${event.nodeLabel} 执行失败`
                : event.type === 'interpretation_completed'
                  ? event.shouldContinue
                    ? `第 ${event.iteration} 轮完成，准备继续分析`
                    : `第 ${event.iteration} 轮完成，准备生成结论`
                  : event.type === 'conclusion_started'
                    ? '正在生成分析结论'
                    : '自动分析正在工作'

    const details =
      event.type === 'node_execution_completed' || event.type === 'node_execution_failed'
        ? [event.summary]
        : event.type === 'conclusion_started'
          ? ['系统正在汇总各轮执行结果，并生成最终分析结论。']
          : event.type === 'loop_started'
            ? ['系统会基于当前已生成计划自动执行、判断是否继续，并在结束后自动同步最终计划。']
            : []

    return {
      id: `agent_loop_event_${index}_${event.type}`,
      role: 'assistant',
      createdAt,
      blocks: [
        {
          type: 'thinking',
          title: 'Agent 工作过程',
          summary,
          details,
          collapsed: true,
        },
      ],
    }
  })
}

const getTimelineFocusId = (
  phase: AnalysisAgentSessionState['phase'],
  events: WorkflowAiStreamEvent[],
): string => {
  const latestLoopEvent = [...events].reverse().find((event) => isLoopEvent(event))
  if (latestLoopEvent) {
    if (latestLoopEvent.type === 'conclusion_started' || latestLoopEvent.type === 'conclusion_completed' || latestLoopEvent.type === 'loop_completed') {
      return 'report'
    }
    if (latestLoopEvent.type === 'interpretation_completed') {
      return 'interpret'
    }
    if (
      latestLoopEvent.type === 'loop_started'
      || latestLoopEvent.type === 'loop_iteration_started'
      || latestLoopEvent.type === 'node_execution_started'
      || latestLoopEvent.type === 'node_execution_completed'
      || latestLoopEvent.type === 'node_execution_failed'
      || latestLoopEvent.type === 'loop_iteration_completed'
    ) {
      return 'execute'
    }
  }

  const latestStage = [...events].reverse().find((event) => event.type === 'stage_changed')
  if (latestStage?.type === 'stage_changed') {
    if (latestStage.stage === 'model_request') return 'method'
    if (latestStage.stage === 'parse') return 'draft'
    if (latestStage.stage === 'validate') return 'execute'
    if (latestStage.stage === 'apply') return 'report'
  }

  if (phase === 'waiting_for_input') return 'method'
  if (phase === 'completed') return 'report'
  if (phase === 'failed') return 'execute'
  return 'intent'
}

const getTimelineFocusDescription = (events: WorkflowAiStreamEvent[]) => {
  const latestLoopEvent = [...events].reverse().find((event) => isLoopEvent(event))
  if (!latestLoopEvent) {
    const lastStageEvent = [...events].reverse().find((event) => event.type === 'stage_changed')
    return lastStageEvent?.type === 'stage_changed'
      ? (lastStageEvent.message ?? `当前阶段：${lastStageEvent.stage}`)
      : undefined
  }

  if (latestLoopEvent.type === 'loop_started') return `准备开始自动分析，最多 ${latestLoopEvent.maxIterations} 轮`
  if (latestLoopEvent.type === 'loop_iteration_started') return `第 ${latestLoopEvent.iteration} 轮分析开始`
  if (latestLoopEvent.type === 'node_execution_started') return `正在执行 ${latestLoopEvent.nodeLabel}`
  if (latestLoopEvent.type === 'node_execution_completed') return latestLoopEvent.summary
  if (latestLoopEvent.type === 'node_execution_failed') return latestLoopEvent.summary
  if (latestLoopEvent.type === 'interpretation_completed') {
    return latestLoopEvent.shouldContinue ? '当前轮已完成，准备进入下一轮分析' : '当前轮已完成，正在收敛最终结论'
  }
  if (latestLoopEvent.type === 'conclusion_started') return '正在汇总执行结果并生成最终结论'
  if (latestLoopEvent.type === 'conclusion_completed') return latestLoopEvent.conclusion.summary
  if (latestLoopEvent.type === 'loop_iteration_completed') return latestLoopEvent.plan.summary
  if (latestLoopEvent.type === 'loop_completed') {
    return `共 ${latestLoopEvent.totalIterations} 轮，耗时 ${(latestLoopEvent.totalDurationMs / 1000).toFixed(1)} 秒`
  }

  return undefined
}

export const buildAgentTimeline = (
  phase: AnalysisAgentSessionState['phase'],
  events: WorkflowAiStreamEvent[],
  toolCalls: AnalysisAgentToolCall[],
): AnalysisAgentTimelineStep[] => {
  const focusId = getTimelineFocusId(phase, events)
  const isCompleted = phase === 'completed'
  const isFailed = phase === 'failed'
  const isWaiting = phase === 'waiting_for_input'
  const focusIndex = TIMELINE_TEMPLATE.findIndex((step) => step.id === focusId)
  const focusDescription = getTimelineFocusDescription(events)

  return TIMELINE_TEMPLATE.map((step, index) => {
    let status: AnalysisAgentTimelineStep['status'] = 'idle'
    if (isCompleted) {
      status = 'completed'
    } else if (index < focusIndex) {
      status = 'completed'
    } else if (index === focusIndex) {
      status = isFailed ? 'failed' : isWaiting ? 'waiting' : 'running'
    }

    return {
      id: step.id,
      title: step.title,
      description: index === focusIndex ? focusDescription : undefined,
      status,
      linkedToolCallIds: toolCalls.map((item) => item.id),
      linkedExecutionRef: step.id,
    }
  })
}

export const buildAgentToolCalls = (
  trace: WorkflowAiToolTraceItem[],
  events: WorkflowAiStreamEvent[],
): AnalysisAgentToolCall[] => {
  const items = new Map<string, AnalysisAgentToolCall>()

  trace.forEach((item, index) => {
    const id = item.id ?? `${item.toolName}_${index}`
    items.set(id, {
      id,
      toolName: item.toolName,
      displayName: getToolDisplayName(item.toolName),
      status: item.status,
      inputSummary: item.inputSummary,
      outputSummary: item.outputSummary,
      summary: item.summary,
      startedAt: item.startedAt,
      finishedAt: item.finishedAt,
    })
  })

  events.forEach((event, index) => {
    if (event.type === 'tool_started') {
      const existing = items.get(event.traceId)
      items.set(event.traceId, {
        id: event.traceId,
        toolName: event.toolName,
        displayName: getToolDisplayName(event.toolName),
        status: 'running',
        summary: event.summary,
        startedAt: existing?.startedAt ?? Date.now() + index,
        inputSummary: existing?.inputSummary,
        outputSummary: existing?.outputSummary,
      })
      return
    }

    if (event.type === 'tool_completed') {
      const existing = items.get(event.traceId)
      items.set(event.traceId, {
        id: event.traceId,
        toolName: event.toolName,
        displayName: getToolDisplayName(event.toolName),
        status: 'success',
        summary: event.summary,
        startedAt: existing?.startedAt,
        finishedAt: Date.now() + index,
        inputSummary: existing?.inputSummary,
        outputSummary: event.summary,
      })
    }
  })

  return [...items.values()]
}

export const buildAgentArtifacts = ({
  plan,
  loopOutput,
  autoApplyResult,
  session,
}: {
  plan: WorkflowAiPlan | null
  loopOutput: AgentLoopOutput | null
  autoApplyResult: AgentWorkspaceAutoApplyResult
  session: WorkflowAiSessionState
}): AnalysisAgentArtifact[] => {
  const artifacts: AnalysisAgentArtifact[] = []

  if (plan) {
    artifacts.push({
      id: 'workflow_summary',
      type: 'workflow_summary',
      title: '计划已生成',
      summary: plan.summary,
      bullets: [...plan.assumptions, ...plan.warnings].slice(0, 4),
    })
  }

  if (session.contextHints?.schemaSummaries?.length) {
    artifacts.push({
      id: 'data_understanding',
      type: 'workflow_summary',
      title: '数据理解完成',
      summary: `已检查 ${session.contextHints.schemaSummaries.length} 个节点的数据结构，并提炼出候选字段。`,
      bullets: session.contextHints.schemaSummaries.slice(0, 3).map((item) => formatSchemaSummary(item)),
    })
  }

  if (session.missingInfo.length) {
    artifacts.push({
      id: 'missing_info_summary',
      type: 'workflow_summary',
      title: '待确认信息',
      summary: `还需要补充 ${session.missingInfo.length} 项关键信息后，系统才能继续后续分析。`,
      bullets: session.missingInfo.slice(0, 4).map((item) => `${item.label}: ${item.reason}`),
    })
  }

  if (loopOutput?.iterations.length) {
    const latestIteration = loopOutput.iterations[loopOutput.iterations.length - 1]
    if (latestIteration) {
      artifacts.push({
        id: `iteration_summary_${latestIteration.iteration}`,
        type: 'workflow_summary',
        title: `执行结果快照 · 第 ${latestIteration.iteration} 轮`,
        summary: latestIteration.plan.summary,
        bullets: latestIteration.executionResults.map((result) => formatExecutionSummary(result)).slice(0, 4),
      })
    }
  }

  if (loopOutput?.conclusion) {
    artifacts.push({
      id: 'conclusion_card',
      type: 'conclusion_card',
      title: '自动分析结论',
      summary: loopOutput.conclusion.summary,
      bullets: [...loopOutput.conclusion.findings, ...loopOutput.conclusion.caveats].slice(0, 6),
    })
  } else if (plan) {
    artifacts.push({
      id: 'conclusion_card',
      type: 'conclusion_card',
      title: '分析结论',
      summary: plan.summary,
      bullets: [...plan.assumptions, ...plan.warnings].slice(0, 6),
    })
  }

  if (autoApplyResult.status !== 'idle') {
    artifacts.push({
      id: 'canvas_sync',
      type: 'workflow_summary',
      title: autoApplyResult.status === 'applied' ? '画布同步完成' : '画布同步异常',
      summary: autoApplyResult.message || (autoApplyResult.status === 'applied' ? '最终计划已写入右侧画布。' : '自动同步到右侧画布失败。'),
      bullets: autoApplyResult.status === 'applied'
        ? ['右侧工作流画布已切换到当前自动分析生成的最终计划。']
        : ['最终计划已经生成，但需要手动检查并应用到右侧工作流画布。'],
    })
  }

  return artifacts
}

export const buildAgentMessages = ({
  prompt,
  conversation,
  toolCalls,
  timeline,
  streamOutputs,
  streamEvents,
  plan,
  loopOutput,
  autoApplyResult,
  session,
}: BuildMessagesInput): AnalysisAgentMessage[] => {
  const messages: AnalysisAgentMessage[] = []

  const normalizedConversation =
    conversation.length > 0
      ? conversation
      : prompt
        ? [{ id: 'user_goal', role: 'user' as const, content: prompt }]
        : []

  normalizedConversation.forEach((item, index) => {
    messages.push({
      id: item.id,
      role: item.role,
      createdAt: Date.now() + index,
      blocks: [{ type: 'text', content: item.content }],
    })
  })

  const assistantBlocks: AnalysisAgentMessageBlock[] = []

  if (session.draft.summary || plan?.summary) {
    assistantBlocks.push({
      type: 'text',
      content: plan?.summary ?? session.draft.summary,
    })
  }

  if (timeline.length > 0) {
    assistantBlocks.push({
      type: 'step_group',
      stepIds: timeline.map((item) => item.id),
    })
  }

  if (session.contextHints?.schemaSummaries?.length) {
    assistantBlocks.push({
      type: 'artifact',
      artifactId: 'data_understanding',
    })
  }

  streamOutputs.forEach((output) => {
    assistantBlocks.push({
      type: 'stream',
      content: output.text,
      status: output.text && session.status !== 'completed' ? 'streaming' : 'completed',
    })
  })

  toolCalls.forEach((toolCall) => {
    assistantBlocks.push({
      type: 'tool_call',
      toolCallId: toolCall.id,
    })
  })

  if (session.draft.summary || plan?.assumptions?.length || plan?.warnings?.length) {
    const details = [
      ...(session.draft.summary ? [session.draft.summary] : []),
      ...(plan?.assumptions ?? []),
      ...(plan?.warnings ?? []),
    ]
    assistantBlocks.push({
      type: 'thinking',
      title: '分析思考',
      summary: session.draft.summary || plan?.summary || '已形成当前分析路径',
      details,
      collapsed: true,
    })
  }

  if (plan) {
    assistantBlocks.push({
      type: 'artifact',
      artifactId: 'workflow_summary',
    })
  }

  if (session.missingInfo.length) {
    assistantBlocks.push({
      type: 'artifact',
      artifactId: 'missing_info_summary',
    })

    session.missingInfo.forEach((item) => {
      assistantBlocks.push({
        type: 'approval_request',
        requestKey: item.key,
      })
    })
  }

  if (assistantBlocks.length > 0) {
    messages.push({
      id: `assistant_state_${session.sessionId}`,
      role: 'assistant',
      createdAt: Date.now() + normalizedConversation.length + 1,
      blocks: assistantBlocks,
    })
  }

  const loopMessages = buildLoopMessages(streamEvents, autoApplyResult)

  if (loopOutput?.conclusion && loopMessages.every((message) =>
    !message.blocks.some((block) => block.type === 'text' && block.content === loopOutput.conclusion?.summary),
  )) {
    loopMessages.push({
      id: `agent_loop_conclusion_output_${session.sessionId}`,
      role: 'assistant',
      createdAt: Date.now() + normalizedConversation.length + 2 + loopMessages.length,
      blocks: [
        {
          type: 'artifact',
          artifactId: 'conclusion_card',
        },
      ],
    })
  }

  if (autoApplyResult.status !== 'idle') {
    loopMessages.push({
      id: `agent_loop_canvas_sync_${session.sessionId}`,
      role: 'assistant',
      createdAt: Date.now() + normalizedConversation.length + 3 + loopMessages.length,
      blocks: [
        {
          type: 'artifact',
          artifactId: 'canvas_sync',
        },
      ],
    })
  }

  return messages.concat(loopMessages)
}
