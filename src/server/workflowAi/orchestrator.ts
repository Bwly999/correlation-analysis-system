import type {
  WorkflowAiContextUserAnswer,
  WorkflowAiGenerationDiagnostics,
  WorkflowAiMissingInfoItem,
  WorkflowAiPlanRequest,
  WorkflowAiSessionInputRequest,
  WorkflowAiSessionRunResponse,
  WorkflowAiSessionState,
  WorkflowAiStreamEvent,
  WorkflowAiToolTraceItem,
} from '../../ai/types.js'
import { streamWorkflowAiPlan as streamWorkflowAiPlanWithProfile } from './profiles.js'
import {
  finalizePlanTool,
  getNodeDefinitionTool,
  getWorkflowContextTool,
  inspectUpstreamSchemaTool,
  mutateDraftTool,
  searchNodesTool,
  searchRecipesTool,
  validateDraftTool,
} from './tools/index.js'
import {
  createWorkflowAiSession,
  getWorkflowAiSession,
  getWorkflowAiSessionRecord,
  updateWorkflowAiSession,
} from './sessionStore.js'

type WorkflowAiStreamEmitter = (event: WorkflowAiStreamEvent) => void

const createTraceId = (sessionId: string, toolName: string, index: number) =>
  `${sessionId}:${toolName}:${index}`

const applyTraceToSession = (
  sessionId: string,
  trace: WorkflowAiToolTraceItem,
  diagnostics?: {
    lastFailedTool?: string
  },
) => {
  updateWorkflowAiSession(sessionId, (record) => {
    record.state.trace = [...record.state.trace, trace]
    if (diagnostics?.lastFailedTool) {
      record.state.diagnostics.lastFailedTool = diagnostics.lastFailedTool
    }
  })
}

const runTool = async <T>(
  sessionId: string,
  toolName: string,
  summary: string,
  emitEvent: WorkflowAiStreamEmitter,
  runner: () =>
    | {
        ok: boolean
        message: string
        data?: T
      }
    | Promise<{
    ok: boolean
    message: string
    data?: T
  }>,
) => {
  const traceIndex = (getWorkflowAiSession(sessionId)?.trace.length ?? 0) + 1
  const traceId = createTraceId(sessionId, toolName, traceIndex)
  const startedAt = Date.now()

  emitEvent({
    type: 'tool_started',
    toolName,
    traceId,
    summary,
  })

  const result = await runner()
  const trace: WorkflowAiToolTraceItem = {
    id: traceId,
    toolName,
    summary: result.message,
    status: result.ok ? 'success' : 'failed',
    startedAt,
    finishedAt: Date.now(),
    inputSummary: summary,
    outputSummary: result.message,
  }

  applyTraceToSession(sessionId, trace, result.ok ? undefined : { lastFailedTool: toolName })

  emitEvent({
    type: 'tool_completed',
    toolName,
    traceId,
    summary: result.message,
  })

  return result
}

const buildMissingInfoItems = (session: WorkflowAiSessionState): WorkflowAiMissingInfoItem[] => {
  const planQuestions = session.finalizedPlan?.questions ?? []
  return planQuestions.map((question, index) => ({
    key: `question_${index + 1}`,
    label: `待确认项 ${index + 1}`,
    reason: question,
    blocking: true,
  }))
}

const mergeDiagnosticsIssues = (
  sessionId: string,
  diagnostics: WorkflowAiGenerationDiagnostics,
  lastFailedTool?: string,
) => {
  updateWorkflowAiSession(sessionId, (record) => {
    record.state.diagnostics = {
      issues: diagnostics.issues.map((issue, index) => ({
        code: `${issue.stage}_${index + 1}`,
        message: issue.message,
        level: 'warn',
      })),
      ...(lastFailedTool ? { lastFailedTool } : {}),
    }
  })
}

export const startWorkflowAiSession = (request: WorkflowAiPlanRequest): WorkflowAiSessionState =>
  createWorkflowAiSession(request)

const normalizeUserAnswers = (
  input: WorkflowAiSessionInputRequest,
  missingInfo: WorkflowAiMissingInfoItem[],
): WorkflowAiContextUserAnswer[] => {
  const knownMissingInfo = new Map(missingInfo.map((item) => [item.key, item]))

  return Object.entries(input.answers ?? {}).flatMap(([key, value]) => {
      const normalizedValue = typeof value === 'string' ? value.trim() : ''
      if (!normalizedValue) return []
      const matchedItem = knownMissingInfo.get(key)

      const normalizedAnswer: WorkflowAiContextUserAnswer = {
        key,
        value: normalizedValue,
        ...(matchedItem?.label ? { label: matchedItem.label } : {}),
        ...(matchedItem?.reason ? { reason: matchedItem.reason } : {}),
      }

      return [normalizedAnswer]
    })
}

export const submitWorkflowAiSessionInput = (
  sessionId: string,
  input: WorkflowAiSessionInputRequest,
): WorkflowAiSessionState => {
  const record = getWorkflowAiSessionRecord(sessionId)
  if (!record) {
    throw Object.assign(new Error('未找到 AI 编排会话'), {
      statusCode: 404,
    })
  }

  if (record.state.status !== 'waiting_user') {
    throw Object.assign(new Error('当前会话不处于待补充信息状态'), {
      statusCode: 409,
    })
  }

  const normalizedAnswers = normalizeUserAnswers(input, record.state.missingInfo)
  if (!normalizedAnswers.length) {
    throw Object.assign(new Error('缺少有效的补充信息内容'), {
      statusCode: 400,
    })
  }

  const mergedUserAnswers = new Map(
    (record.request.contextHints?.userAnswers ?? []).map((item) => [item.key, item] as const),
  )
  normalizedAnswers.forEach((item) => {
    mergedUserAnswers.set(item.key, item)
  })

  const nextContextHints = {
    ...(record.request.contextHints ?? {}),
    userAnswers: [...mergedUserAnswers.values()],
  }

  return updateWorkflowAiSession(sessionId, (nextRecord) => {
    nextRecord.request = {
      ...nextRecord.request,
      contextHints: nextContextHints,
    }
    nextRecord.state.contextHints = nextContextHints
    nextRecord.state.missingInfo = []
    nextRecord.state.status = 'idle'
  })
}

export const runWorkflowAiSession = async (
  sessionId: string,
  emitEvent: WorkflowAiStreamEmitter,
): Promise<WorkflowAiSessionRunResponse> => {
  const record = getWorkflowAiSessionRecord(sessionId)
  if (!record) {
    throw Object.assign(new Error('未找到 AI 编排会话'), {
      statusCode: 404,
    })
  }

  updateWorkflowAiSession(sessionId, (nextRecord) => {
    nextRecord.state.status = 'running'
  })

  emitEvent({
    type: 'started',
    sessionId,
    message: 'AI 编排会话已开始',
  })

  await runTool(
    sessionId,
    'get_workflow_context',
    '读取当前工作流上下文',
    emitEvent,
    () => getWorkflowContextTool(record.request),
  )

  const recipeResult = await runTool(
    sessionId,
    'search_recipes',
    '召回候选编排模板',
    emitEvent,
    () => searchRecipesTool(record.request),
  )

  const selectedRecipe = recipeResult.data?.[0]
  if (selectedRecipe) {
    updateWorkflowAiSession(sessionId, (nextRecord) => {
      nextRecord.state.selectedRecipe = {
        id: selectedRecipe.id,
        name: selectedRecipe.name,
        reason: selectedRecipe.reason,
      }
    })

    emitEvent({
      type: 'recipe_selected',
      recipeId: selectedRecipe.id,
      recipeName: selectedRecipe.name,
      reason: selectedRecipe.reason,
    })

    await runTool(
      sessionId,
      'search_nodes',
      '基于候选模板匹配节点',
      emitEvent,
      () =>
        searchNodesTool(record.request.nodeCatalog, {
          keywords: [selectedRecipe.name],
          preferredNodeNames: selectedRecipe.minimalPattern,
        }),
    )

    await runTool(
      sessionId,
      'get_node_definition',
      '读取候选节点定义',
      emitEvent,
      () => getNodeDefinitionTool(record.request.nodeCatalog, selectedRecipe.minimalPattern),
    )
  }

  const inspectionResult = await runTool(
    sessionId,
    'inspect_upstream_schema',
    '读取上游字段摘要',
    emitEvent,
    () => inspectUpstreamSchemaTool(record.request),
  )

  if (inspectionResult.data?.length) {
    updateWorkflowAiSession(sessionId, (nextRecord) => {
      nextRecord.request = {
        ...nextRecord.request,
        contextHints: {
          ...(nextRecord.request.contextHints ?? {}),
          schemaSummaries: inspectionResult.data,
        },
      }
      nextRecord.state.contextHints = nextRecord.request.contextHints
    })
  }

  const updatedRecord = getWorkflowAiSessionRecord(sessionId)
  if (!updatedRecord) {
    throw new Error('AI 会话上下文更新失败')
  }

  const response = await streamWorkflowAiPlanWithProfile(updatedRecord.request, (event) => {
    emitEvent(event)
  })

  const draftResult = await runTool(
    sessionId,
    'mutate_draft',
    '将最终计划写入草稿',
    emitEvent,
    () => mutateDraftTool(response.plan),
  )

  const draft = draftResult.data
  if (!draft) {
    throw new Error('AI 草稿构建失败')
  }

  updateWorkflowAiSession(sessionId, (nextRecord) => {
    nextRecord.state.draft = draft
  })

  emitEvent({
    type: 'draft_updated',
    draft,
  })

  const validationResult = await runTool(
    sessionId,
    'validate_draft',
    '校验当前草稿',
    emitEvent,
    () => validateDraftTool(draft, updatedRecord.request),
  )

  const finalizedResult = await runTool(
    sessionId,
    'finalize_plan',
    '将草稿转换为最终计划',
    emitEvent,
    () => finalizePlanTool(draft),
  )

  mergeDiagnosticsIssues(sessionId, response.diagnostics, validationResult.ok ? undefined : 'validate_draft')

  const finalizedPlan = finalizedResult.data ?? response.plan

  updateWorkflowAiSession(sessionId, (nextRecord) => {
    nextRecord.state.finalizedPlan = finalizedPlan
  })

  const missingInfo = buildMissingInfoItems({
    ...record.state,
    finalizedPlan,
  })

  if (missingInfo.length > 0) {
    updateWorkflowAiSession(sessionId, (nextRecord) => {
      nextRecord.state.missingInfo = missingInfo
      nextRecord.state.status = 'waiting_user'
    })
    emitEvent({
      type: 'missing_info',
      items: missingInfo,
    })
  } else {
    updateWorkflowAiSession(sessionId, (nextRecord) => {
      nextRecord.state.missingInfo = []
      nextRecord.state.status = response.diagnostics.status === 'failed' ? 'failed' : 'completed'
    })
  }

  const finalDraft = getWorkflowAiSession(sessionId)?.draft ?? draft

  emitEvent({
    type: 'completed',
    plan: finalizedPlan,
    draft: finalDraft,
    diagnostics: response.diagnostics,
  })

  return {
    plan: finalizedPlan,
    draft: finalDraft,
    diagnostics: response.diagnostics,
  }
}

export { getWorkflowAiSession }
