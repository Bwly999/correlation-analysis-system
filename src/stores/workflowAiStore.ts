import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { buildWorkflowAiNodeCatalog, buildWorkflowAiSnapshot } from '@/ai/catalog'
import { buildLocalWorkflowAiContext } from '@/ai/tools/localContext'
import type {
  AnalysisAgentExecutionTab,
  AnalysisAgentMessage,
  AnalysisAgentMessageBlock,
  AnalysisAgentSessionState,
  AnalysisAgentTimelineStep,
  AnalysisAgentToolCall,
  WorkflowAiContextHints,
  WorkflowAiGenerationDiagnostics,
  WorkflowAiMissingInfoItem,
  WorkflowAiModelProfile,
  WorkflowAiModelTestResult,
  WorkflowAiPlan,
  WorkflowAiPlanMode,
  WorkflowAiSessionState,
  WorkflowAiStreamEvent,
  WorkflowAiToolTraceItem,
} from '@/ai/types'
import {
  WorkflowAiRequestError,
  fetchSystemModelProfiles,
  runWorkflowAiSession,
  startWorkflowAiSession,
  submitWorkflowAiSessionInput,
  testWorkflowAiModelProfile,
} from '@/services/workflowAi'

const CUSTOM_PROFILE_STORAGE_KEY = 'workflow_ai_custom_profiles'

type WorkflowStoreLike = {
  workflowName: string
  nodes: any[]
  edges: any[]
  logs?: Array<{ level: string; message: string }>
  addLog?: (message: string, level?: 'info' | 'warn' | 'error') => void
  applyWorkflowAiPlan: (plan: WorkflowAiPlan) => { snapshotId: string }
  restoreEditableSnapshot: (snapshotId: string) => boolean
  executeForAiInspection?: (nodeId: string) => Promise<unknown>
}

type WorkflowAiStreamOutput = {
  attempt: number
  trigger: 'initial' | 'repair'
  text: string
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

const mapSessionPhase = (status?: WorkflowAiSessionState['status']): AnalysisAgentSessionState['phase'] => {
  if (status === 'waiting_user') return 'waiting_for_input'
  if (status === 'completed') return 'completed'
  if (status === 'failed') return 'failed'
  if (status === 'running') return 'executing'
  return 'planning'
}

const getTimelineFocusId = (
  phase: AnalysisAgentSessionState['phase'],
  events: WorkflowAiStreamEvent[],
): string => {
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

const buildTimeline = (
  phase: AnalysisAgentSessionState['phase'],
  events: WorkflowAiStreamEvent[],
  toolCalls: AnalysisAgentToolCall[],
): AnalysisAgentTimelineStep[] => {
  const focusId = getTimelineFocusId(phase, events)
  const isCompleted = phase === 'completed'
  const isFailed = phase === 'failed'
  const isWaiting = phase === 'waiting_for_input'
  const focusIndex = TIMELINE_TEMPLATE.findIndex((step) => step.id === focusId)
  const lastStageEvent = [...events].reverse().find((event) => event.type === 'stage_changed')

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
      description:
        index === focusIndex && lastStageEvent?.type === 'stage_changed'
          ? (lastStageEvent.message ?? `当前阶段：${lastStageEvent.stage}`)
          : undefined,
      status,
      linkedToolCallIds: toolCalls.map((item) => item.id),
      linkedExecutionRef: step.id,
    }
  })
}

const buildToolCalls = (
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

const buildMessages = ({
  prompt,
  conversation,
  toolCalls,
  timeline,
  streamOutputs,
  plan,
  session,
}: {
  prompt: string
  conversation: Array<{ id: string; role: 'user' | 'assistant'; content: string }>
  toolCalls: AnalysisAgentToolCall[]
  timeline: AnalysisAgentTimelineStep[]
  streamOutputs: WorkflowAiStreamOutput[]
  plan: WorkflowAiPlan | null
  session: WorkflowAiSessionState
}): AnalysisAgentMessage[] => {
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

  ;(plan
    ? [
        {
          type: 'artifact' as const,
          artifactId: 'conclusion_card',
        },
      ]
    : []
  ).forEach((block) => assistantBlocks.push(block))

  session.missingInfo.forEach((item) => {
    assistantBlocks.push({
      type: 'approval_request',
      requestKey: item.key,
    })
  })

  if (assistantBlocks.length > 0) {
    messages.push({
      id: `assistant_state_${session.sessionId}`,
      role: 'assistant',
      createdAt: Date.now() + normalizedConversation.length + 1,
      blocks: assistantBlocks,
    })
  }

  return messages
}

const readCustomProfiles = (): WorkflowAiModelProfile[] => {
  try {
    const raw = localStorage.getItem(CUSTOM_PROFILE_STORAGE_KEY)
    if (!raw) return []
    return JSON.parse(raw) as WorkflowAiModelProfile[]
  } catch {
    return []
  }
}

const writeCustomProfiles = (profiles: WorkflowAiModelProfile[]) => {
  localStorage.setItem(CUSTOM_PROFILE_STORAGE_KEY, JSON.stringify(profiles))
}

export const useWorkflowAiStore = defineStore('workflow-ai', () => {
  const systemProfiles = ref<WorkflowAiModelProfile[]>([])
  const customProfiles = ref<WorkflowAiModelProfile[]>(readCustomProfiles())
  const selectedProfileId = ref('')
  const prompt = ref('')
  const mode = ref<WorkflowAiPlanMode>('create')
  const plan = ref<WorkflowAiPlan | null>(null)
  const isGenerating = ref(false)
  const isLoadingProfiles = ref(false)
  const errorMessage = ref('')
  const generationDiagnostics = ref<WorkflowAiGenerationDiagnostics | null>(null)
  const streamStatus = ref<'idle' | 'streaming' | 'completed' | 'failed'>('idle')
  const streamHeadline = ref('')
  const streamEvents = ref<WorkflowAiStreamEvent[]>([])
  const streamOutputs = ref<WorkflowAiStreamOutput[]>([])
  const contextHints = ref<WorkflowAiContextHints | null>(null)
  const toolTrace = ref<WorkflowAiToolTraceItem[]>([])
  const sessionState = ref<WorkflowAiSessionState | null>(null)
  const settingsVisible = ref(false)
  const lastAppliedSnapshotId = ref('')
  const lastTestResult = ref<WorkflowAiModelTestResult | null>(null)
  const analysisConversation = ref<Array<{ id: string; role: 'user' | 'assistant'; content: string }>>([])
  const workflowSummary = ref('')
  const activeExecutionTab = ref<AnalysisAgentExecutionTab>('execution')

  const profiles = computed(() => [...systemProfiles.value, ...customProfiles.value])
  const selectedProfile = computed(
    () => profiles.value.find((profile) => profile.id === selectedProfileId.value) ?? null,
  )
  const agentToolCalls = computed(() => buildToolCalls(toolTrace.value, streamEvents.value))
  const agentTimeline = computed(() =>
    sessionState.value
      ? buildTimeline(mapSessionPhase(sessionState.value.status), streamEvents.value, agentToolCalls.value)
      : [],
  )
  const agentMessages = computed(() =>
    sessionState.value
      ? buildMessages({
          prompt: prompt.value || sessionState.value.prompt,
          conversation: analysisConversation.value,
          toolCalls: agentToolCalls.value,
          timeline: agentTimeline.value,
          streamOutputs: streamOutputs.value,
          plan: plan.value,
          session: sessionState.value,
        })
      : [],
  )
  const analysisAgentSession = computed<AnalysisAgentSessionState | null>(() => {
    if (!sessionState.value) return null

    const phase = mapSessionPhase(sessionState.value.status)

    const baseConversation =
      analysisConversation.value.length > 0
        ? analysisConversation.value
        : [
            {
              id: 'user_goal',
              role: 'user' as const,
              content: prompt.value || sessionState.value.prompt,
            },
          ]

    const artifacts = plan.value
      ? [
          {
            id: 'conclusion_card',
            type: 'conclusion_card' as const,
            title: '分析结论',
            summary: plan.value.summary,
            bullets: [...plan.value.assumptions, ...plan.value.warnings],
          },
        ]
      : []

    const approvalRequests = sessionState.value.missingInfo.map((item) => ({
      key: item.key,
      label: item.label,
      reason: item.reason,
      blocking: item.blocking,
    }))

    return {
      sessionId: sessionState.value.sessionId,
      userGoal: prompt.value || sessionState.value.prompt,
      phase,
      workflowSummary: workflowSummary.value,
      conversation: baseConversation,
      messages: agentMessages.value,
      timeline: agentTimeline.value,
      toolCalls: agentToolCalls.value,
      artifacts,
      approvalRequests,
      workflowSession: sessionState.value,
    }
  })

  const ensureSelectedProfile = () => {
    if (selectedProfile.value) return
    const fallbackProfile = profiles.value.find((profile) => profile.enabled) ?? profiles.value[0]
    selectedProfileId.value = fallbackProfile?.id ?? ''
  }

  const loadProfiles = async () => {
    isLoadingProfiles.value = true
    errorMessage.value = ''
    try {
      systemProfiles.value = await fetchSystemModelProfiles()
      customProfiles.value = readCustomProfiles()
      ensureSelectedProfile()
    } catch (error: any) {
      errorMessage.value = error.message ?? '加载模型配置失败'
    } finally {
      isLoadingProfiles.value = false
    }
  }

  const setApplyError = (message: string) => {
    errorMessage.value = message
    streamStatus.value = 'failed'
    streamHeadline.value = message
    generationDiagnostics.value = {
      status: 'failed',
      stage: 'apply',
      attempts: [],
      issues: [
        {
          stage: 'apply',
          operationId: 'plan',
          message,
        },
      ],
    }
  }

  const appendStreamEvent = (event: WorkflowAiStreamEvent) => {
    streamEvents.value.push(event)

    if (event.type === 'started') {
      streamHeadline.value = event.message ?? 'AI 编排已开始'
      if (event.sessionId && sessionState.value) {
        sessionState.value = {
          ...sessionState.value,
          sessionId: event.sessionId,
          status: 'running',
        }
      }
      return
    }

    if (event.type === 'recipe_selected') {
      streamHeadline.value = `已选策略：${event.recipeName}`
      if (sessionState.value) {
        sessionState.value = {
          ...sessionState.value,
          selectedRecipe: {
            id: event.recipeId,
            name: event.recipeName,
            reason: event.reason,
          },
        }
      }
      return
    }

    if (event.type === 'tool_started') {
      streamHeadline.value = event.summary
      return
    }

    if (event.type === 'tool_completed') {
      streamHeadline.value = event.summary
      return
    }

    if (event.type === 'draft_updated') {
      streamHeadline.value = '草稿已更新'
      if (sessionState.value) {
        sessionState.value = {
          ...sessionState.value,
          draft: event.draft,
        }
      }
      return
    }

    if (event.type === 'missing_info') {
      streamHeadline.value = '需要补充信息后继续编排'
      if (sessionState.value) {
        sessionState.value = {
          ...sessionState.value,
          status: 'waiting_user',
          missingInfo: event.items as WorkflowAiMissingInfoItem[],
        }
      }
      return
    }

    if (event.type === 'attempt_started') {
      streamHeadline.value = event.message ?? (event.trigger === 'repair' ? '开始自动修复重试' : '开始首次生成')
      if (!streamOutputs.value.some((item) => item.attempt === event.attempt)) {
        streamOutputs.value.push({
          attempt: event.attempt,
          trigger: event.trigger,
          text: '',
        })
      }
      return
    }

    if (event.type === 'stage_changed') {
      streamHeadline.value = event.message ?? `当前阶段：${event.stage}`
      return
    }

    if (event.type === 'text_delta') {
      const currentOutput = streamOutputs.value.find((item) => item.attempt === event.attempt)
      if (currentOutput) {
        currentOutput.text += event.delta
      } else {
        streamOutputs.value.push({
          attempt: event.attempt,
          trigger: 'initial',
          text: event.delta,
        })
      }
      return
    }

    if (event.type === 'diagnostic') {
      generationDiagnostics.value = event.diagnostics
      streamHeadline.value = event.message ?? 'AI 编排返回诊断信息'
      if (sessionState.value) {
        sessionState.value = {
          ...sessionState.value,
          diagnostics: {
            issues: event.diagnostics.issues.map((issue, index) => ({
              code: `${issue.stage}_${index + 1}`,
              message: issue.message,
              level: 'warn',
            })),
          },
        }
      }
      return
    }

    if (event.type === 'completed') {
      plan.value = event.plan
      generationDiagnostics.value = event.diagnostics
      streamStatus.value = 'completed'
      streamHeadline.value = 'AI 编排生成成功'
      if (sessionState.value) {
        sessionState.value = {
          ...sessionState.value,
          status: sessionState.value.missingInfo.length ? 'waiting_user' : 'completed',
          finalizedPlan: event.plan,
          ...(event.draft ? { draft: event.draft } : {}),
        }
      }
      return
    }

    if (event.type === 'failed') {
      errorMessage.value = event.message
      generationDiagnostics.value = event.diagnostics ?? null
      streamStatus.value = 'failed'
      streamHeadline.value = event.message
      if (sessionState.value) {
        sessionState.value = {
          ...sessionState.value,
          status: 'failed',
        }
      }
    }
  }

  const resetStreamingState = (headline: string) => {
    errorMessage.value = ''
    generationDiagnostics.value = null
    streamStatus.value = 'streaming'
    streamHeadline.value = headline
    streamEvents.value = []
    streamOutputs.value = []
  }

  const seedAnalysisConversation = (userGoal: string) => {
    analysisConversation.value = userGoal
      ? [
          {
            id: 'user_goal',
            role: 'user',
            content: userGoal,
          },
        ]
      : []
  }

  const finalizeSessionRun = (response: Awaited<ReturnType<typeof runWorkflowAiSession>>) => {
    plan.value = response.plan
    generationDiagnostics.value = response.diagnostics
    streamStatus.value = 'completed'
    streamHeadline.value = 'AI 编排生成成功'
    if (sessionState.value) {
      sessionState.value = {
        ...sessionState.value,
        ...(response.draft ? { draft: response.draft } : {}),
        finalizedPlan: response.plan,
        status: sessionState.value.missingInfo.length ? 'waiting_user' : 'completed',
      }
    }
  }

  const runSessionWithEvents = async (
    workflowStore: WorkflowStoreLike,
    sessionId: string,
  ) => {
    const response = await runWorkflowAiSession(sessionId, {
      onEvent(event) {
        appendStreamEvent(event)
        if (event.type === 'attempt_started' && event.trigger === 'repair') {
          workflowStore.addLog?.('AI编排触发自动修复重试', 'warn')
        }
      },
    })

    finalizeSessionRun(response)
    return response.plan
  }

  const upsertCustomProfile = (profile: Omit<WorkflowAiModelProfile, 'source'>) => {
    const nextProfile: WorkflowAiModelProfile = {
      ...profile,
      source: 'custom',
    }
    const nextProfiles = customProfiles.value.filter((item) => item.id !== nextProfile.id).concat(nextProfile)
    customProfiles.value = nextProfiles
    writeCustomProfiles(nextProfiles)
    selectedProfileId.value = nextProfile.id
  }

  const removeCustomProfile = (profileId: string) => {
    customProfiles.value = customProfiles.value.filter((profile) => profile.id !== profileId)
    writeCustomProfiles(customProfiles.value)
    if (selectedProfileId.value === profileId) {
      selectedProfileId.value = ''
      ensureSelectedProfile()
    }
  }

  const testProfile = async (profile: WorkflowAiModelProfile) => {
    lastTestResult.value = await testWorkflowAiModelProfile(profile)
    return lastTestResult.value
  }

  const generatePlan = async (workflowStore: WorkflowStoreLike) => {
    const profile = selectedProfile.value
    if (!profile) {
      throw new Error('请先选择可用的模型配置')
    }

    isGenerating.value = true
    resetStreamingState('正在准备 AI 编排请求')
    contextHints.value = null
    toolTrace.value = []
    sessionState.value = null
    workflowSummary.value = ''
    seedAnalysisConversation(prompt.value)
    workflowStore.addLog?.('AI编排开始生成计划', 'info')

    try {
      const localContext = await buildLocalWorkflowAiContext({
        mode: mode.value,
        prompt: prompt.value,
        workflowName: workflowStore.workflowName,
        nodes: workflowStore.nodes,
        edges: workflowStore.edges,
        inspectNode: workflowStore.executeForAiInspection,
      })
      contextHints.value = localContext.contextHints
      toolTrace.value = localContext.toolTrace

      const requestPayload = {
        mode: mode.value,
        prompt: prompt.value,
        profile,
        workflowSnapshot:
          mode.value === 'edit'
            ? {
                name: workflowStore.workflowName,
                ...buildWorkflowAiSnapshot(workflowStore.nodes, workflowStore.edges),
              }
            : undefined,
        contextHints: localContext.contextHints,
        nodeCatalog: buildWorkflowAiNodeCatalog(),
      }

      const sessionStart = await startWorkflowAiSession(requestPayload)
      sessionState.value = sessionStart.session

      await runSessionWithEvents(workflowStore, sessionStart.session.sessionId)
      workflowStore.addLog?.('AI编排生成成功', 'info')
      return plan.value
    } catch (error: any) {
      errorMessage.value = error.message ?? '生成 AI 计划失败'
      generationDiagnostics.value =
        error instanceof WorkflowAiRequestError ? error.diagnostics ?? null : error?.diagnostics ?? null
      streamStatus.value = 'failed'
      streamHeadline.value = errorMessage.value
      workflowStore.addLog?.(`AI编排生成失败: ${errorMessage.value}`, 'error')
      throw error
    } finally {
      isGenerating.value = false
    }
  }

  const continueSession = async (
    workflowStore: WorkflowStoreLike,
    answers: Record<string, string>,
  ) => {
    const currentSession = sessionState.value
    if (!currentSession?.sessionId) {
      throw new Error('当前没有可继续的 AI 编排会话')
    }
    if (currentSession.status !== 'waiting_user') {
      throw new Error('当前会话不处于待补充信息状态')
    }

    const normalizedAnswers = Object.fromEntries(
      Object.entries(answers).map(([key, value]) => [key, typeof value === 'string' ? value.trim() : '']),
    )
    const missingBlockingItems = currentSession.missingInfo.filter(
      (item) => item.blocking && !normalizedAnswers[item.key],
    )

    if (missingBlockingItems.length > 0) {
      throw new Error(`请先补充：${missingBlockingItems.map((item) => item.label).join('、')}`)
    }

    isGenerating.value = true
    resetStreamingState('正在提交补充信息并继续编排')
    workflowStore.addLog?.('AI编排已接收补充信息，继续生成计划', 'info')

    try {
      const response = await submitWorkflowAiSessionInput(currentSession.sessionId, {
        answers: normalizedAnswers,
      })
      sessionState.value = response.session

      await runSessionWithEvents(workflowStore, currentSession.sessionId)
      workflowStore.addLog?.('AI编排继续生成成功', 'info')
      return plan.value
    } catch (error: any) {
      errorMessage.value = error.message ?? '继续 AI 编排失败'
      generationDiagnostics.value =
        error instanceof WorkflowAiRequestError ? error.diagnostics ?? null : error?.diagnostics ?? null
      streamStatus.value = 'failed'
      streamHeadline.value = errorMessage.value
      workflowStore.addLog?.(`AI编排继续生成失败: ${errorMessage.value}`, 'error')
      throw error
    } finally {
      isGenerating.value = false
    }
  }

  const applyCurrentPlan = (workflowStore: WorkflowStoreLike) => {
    if (!plan.value) {
      throw new Error('当前没有可应用的 AI 计划')
    }
    const result = workflowStore.applyWorkflowAiPlan(plan.value)
    lastAppliedSnapshotId.value = result.snapshotId
    return result
  }

  const restoreLastApplied = (workflowStore: WorkflowStoreLike) => {
    if (!lastAppliedSnapshotId.value) return false
    return workflowStore.restoreEditableSnapshot(lastAppliedSnapshotId.value)
  }

  const resetPlan = () => {
    plan.value = null
    errorMessage.value = ''
    generationDiagnostics.value = null
    streamStatus.value = 'idle'
    streamHeadline.value = ''
    streamEvents.value = []
    streamOutputs.value = []
    contextHints.value = null
    toolTrace.value = []
    sessionState.value = null
    analysisConversation.value = []
    workflowSummary.value = ''
    activeExecutionTab.value = 'execution'
  }

  const syncAnalysisCanvas = (workflowStore: WorkflowStoreLike) => {
    const summary = `当前画布共 ${workflowStore.nodes.length} 个节点、${workflowStore.edges.length} 条连线`
    workflowSummary.value = summary
    analysisConversation.value = [
      ...(analysisConversation.value.length
        ? analysisConversation.value
        : prompt.value
          ? [
              {
                id: 'user_goal',
                role: 'user' as const,
                content: prompt.value,
              },
            ]
          : []),
      {
        id: `sync_${Date.now()}`,
        role: 'assistant',
        content: `已同步当前画布，共 ${workflowStore.nodes.length} 个节点、${workflowStore.edges.length} 条连线。`,
      },
    ]
  }

  const setActiveExecutionTab = (tab: AnalysisAgentExecutionTab) => {
    activeExecutionTab.value = tab
  }

  return {
    systemProfiles,
    customProfiles,
    profiles,
    selectedProfileId,
    selectedProfile,
    prompt,
    mode,
    plan,
    isGenerating,
    isLoadingProfiles,
    errorMessage,
    generationDiagnostics,
    streamStatus,
    streamHeadline,
    streamEvents,
    streamOutputs,
    contextHints,
    toolTrace,
    sessionState,
    analysisAgentSession,
    agentMessages,
    agentTimeline,
    agentToolCalls,
    settingsVisible,
    activeExecutionTab,
    lastAppliedSnapshotId,
    lastTestResult,
    loadProfiles,
    upsertCustomProfile,
    removeCustomProfile,
    testProfile,
    generatePlan,
    continueSession,
    applyCurrentPlan,
    restoreLastApplied,
    syncAnalysisCanvas,
    setActiveExecutionTab,
    setApplyError,
    resetPlan,
  }
})
