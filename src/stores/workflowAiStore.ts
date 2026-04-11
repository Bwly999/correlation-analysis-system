import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { buildWorkflowAiNodeCatalog, buildWorkflowAiSnapshot } from '@/ai/catalog'
import {
  buildAgentArtifacts,
  buildAgentMessages,
  buildAgentTimeline,
  buildAgentToolCalls,
  type AgentWorkspaceAutoApplyResult,
  type AgentWorkspaceStreamOutput,
} from '@/ai/agentWorkspaceAdapter'
import { buildLocalWorkflowAiContext } from '@/ai/tools/localContext'
import type {
  AnalysisAgentExecutionTab,
  AnalysisAgentSessionState,
  AnalysisAgentTimelineStep,
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
  runAnalysisAgentLoop,
  runWorkflowAiSession,
  startWorkflowAiSession,
  submitWorkflowAiSessionInput,
  testWorkflowAiModelProfile,
  type AgentLoopOutput,
} from '@/services/agentWorkspace'

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

type AgentLoopPresetId = 'standard' | 'deep'

type AgentLoopPresetOption = {
  id: AgentLoopPresetId
  label: string
  description: string
}

type AgentWorkspaceFlowState = {
  status: 'idle' | 'planning' | 'waiting' | 'ready' | 'running' | 'completed' | 'failed'
  title: string
  description: string
  badge: string
}

const AGENT_LOOP_PRESET_OPTIONS: AgentLoopPresetOption[] = [
  {
    id: 'standard',
    label: '标准分析',
    description: '单轮优先，适合先快速跑通主流程。',
  },
  {
    id: 'deep',
    label: '深入分析',
    description: '允许更多轮次，适合需要继续追问和补充分析的场景。',
  },
]

const AGENT_LOOP_PRESET_CONFIG: Record<AgentLoopPresetId, NonNullable<Parameters<typeof runAnalysisAgentLoop>[1]>> = {
  standard: {
    maxIterations: 1,
    autoExecute: true,
    generateConclusion: true,
  },
  deep: {
    maxIterations: 2,
    autoExecute: true,
    generateConclusion: true,
  },
}

const mapSessionPhase = (status?: WorkflowAiSessionState['status']): AnalysisAgentSessionState['phase'] => {
  if (status === 'waiting_user') return 'waiting_for_input'
  if (status === 'completed') return 'completed'
  if (status === 'failed') return 'failed'
  if (status === 'running') return 'executing'
  return 'planning'
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
  const streamOutputs = ref<AgentWorkspaceStreamOutput[]>([])
  const contextHints = ref<WorkflowAiContextHints | null>(null)
  const toolTrace = ref<WorkflowAiToolTraceItem[]>([])
  const sessionState = ref<WorkflowAiSessionState | null>(null)
  const settingsVisible = ref(false)
  const lastAppliedSnapshotId = ref('')
  const lastTestResult = ref<WorkflowAiModelTestResult | null>(null)
  const analysisConversation = ref<Array<{ id: string; role: 'user' | 'assistant'; content: string }>>([])
  const workflowSummary = ref('')
  const activeExecutionTab = ref<AnalysisAgentExecutionTab>('execution')
  const agentLoopRunning = ref(false)
  const agentLoopOutput = ref<AgentLoopOutput | null>(null)
  const agentLoopPreset = ref<AgentLoopPresetId>('standard')
  const autoApplyResult = ref<AgentWorkspaceAutoApplyResult>({
    status: 'idle',
    message: '',
  })
  const resetAgentLoopState = (resetPreset = false) => {
    agentLoopRunning.value = false
    agentLoopOutput.value = null
    autoApplyResult.value = {
      status: 'idle',
      message: '',
    }
    lastAppliedSnapshotId.value = ''
    if (resetPreset) {
      agentLoopPreset.value = 'standard'
    }
  }

  const profiles = computed(() => [...systemProfiles.value, ...customProfiles.value])
  const selectedProfile = computed(
    () => profiles.value.find((profile) => profile.id === selectedProfileId.value) ?? null,
  )
  const hasBlockingMissingInfo = computed(() =>
    sessionState.value?.missingInfo.some((item) => item.blocking) ?? false,
  )
  const canStartAgentLoop = computed(() =>
    plan.value !== null
    && !isGenerating.value
    && !agentLoopRunning.value
    && selectedProfile.value !== null
    && !hasBlockingMissingInfo.value,
  )
  const latestLoopIteration = computed(() => {
    const lastIterationEvent = [...streamEvents.value]
      .reverse()
      .find((event): event is Extract<WorkflowAiStreamEvent, { type: 'loop_iteration_started' }> => event.type === 'loop_iteration_started')
    if (lastIterationEvent) return lastIterationEvent.iteration
    return agentLoopOutput.value?.totalIterations ?? 0
  })
  const agentLoopPresetOptions = computed(() => AGENT_LOOP_PRESET_OPTIONS)
  const agentToolCalls = computed(() => buildAgentToolCalls(toolTrace.value, streamEvents.value))
  const agentPhase = computed<AnalysisAgentSessionState['phase']>(() => {
    if (agentLoopRunning.value) return 'executing'
    if (autoApplyResult.value.status === 'failed') return 'failed'
    if (agentLoopOutput.value?.conclusion || autoApplyResult.value.status === 'applied') return 'completed'
    return mapSessionPhase(sessionState.value?.status)
  })
  const agentTimeline = computed(() =>
    sessionState.value
      ? buildAgentTimeline(agentPhase.value, streamEvents.value, agentToolCalls.value)
      : [],
  )
  const agentWorkspaceFlow = computed<AgentWorkspaceFlowState>(() => {
    if (!selectedProfile.value) {
      return {
        status: 'idle',
        title: '先选择可用模型配置',
        description: '需要先选择模型配置，才能生成计划并启动自动分析。',
        badge: '待准备',
      }
    }

    if (isGenerating.value) {
      return {
        status: 'planning',
        title: '正在生成工作流计划',
        description: streamHeadline.value || '系统正在理解目标、生成计划并检查缺失信息。',
        badge: '规划中',
      }
    }

    if (hasBlockingMissingInfo.value) {
      return {
        status: 'waiting',
        title: '需要补充信息后才能继续',
        description: '先回答当前阻塞问题，系统再继续生成或执行完整分析流程。',
        badge: '待补充',
      }
    }

    if (agentLoopRunning.value) {
      return {
        status: 'running',
        title: '自动分析运行中',
        description: streamHeadline.value || '系统正在自动执行计划、判断是否继续，并准备输出结论。',
        badge: `第 ${Math.max(1, latestLoopIteration.value)} 轮`,
      }
    }

    if (autoApplyResult.value.status === 'failed') {
      return {
        status: 'failed',
        title: '自动分析已完成，但同步画布失败',
        description: autoApplyResult.value.message || '最终计划已生成，请检查画布同步结果并手动处理。',
        badge: '需处理',
      }
    }

    if (agentLoopOutput.value?.conclusion) {
      return {
        status: 'completed',
        title: '自动分析已完成',
        description: agentLoopOutput.value.conclusion.summary,
        badge: autoApplyResult.value.status === 'applied' ? '已同步画布' : '已完成',
      }
    }

    if (plan.value) {
      return {
        status: 'ready',
        title: '已生成计划，可开始自动分析',
        description: plan.value.summary,
        badge: '可运行',
      }
    }

    if (errorMessage.value) {
      return {
        status: 'failed',
        title: '当前流程未能完成',
        description: errorMessage.value,
        badge: '失败',
      }
    }

    return {
      status: 'idle',
      title: '先描述你的分析目标',
      description: '系统会先生成计划，再自动执行自动分析，最后把最终计划同步到右侧画布。',
      badge: '待开始',
    }
  })
  const agentWorkspaceSteps = computed<AnalysisAgentTimelineStep[]>(() => {
    const planningStatus: AnalysisAgentTimelineStep['status'] =
      isGenerating.value
        ? 'running'
        : hasBlockingMissingInfo.value
          ? 'waiting'
          : plan.value
            ? 'completed'
            : errorMessage.value && !agentLoopOutput.value
              ? 'failed'
              : 'idle'
    const executionStatus: AnalysisAgentTimelineStep['status'] =
      agentLoopRunning.value
        ? 'running'
        : agentLoopOutput.value
          ? 'completed'
          : plan.value
            ? 'idle'
            : 'idle'
    const conclusionStatus: AnalysisAgentTimelineStep['status'] =
      streamEvents.value.some((event) => event.type === 'conclusion_started') && agentLoopRunning.value
        ? 'running'
        : agentLoopOutput.value?.conclusion
          ? 'completed'
          : executionStatus === 'completed'
            ? 'idle'
            : 'idle'
    const syncStatus: AnalysisAgentTimelineStep['status'] =
      autoApplyResult.value.status === 'applied'
        ? 'completed'
        : autoApplyResult.value.status === 'failed'
          ? 'failed'
          : 'idle'

    return [
      {
        id: 'goal',
        title: '输入目标',
        description: prompt.value ? '已记录本次分析目标' : '先描述你想解决的分析问题',
        status: prompt.value ? 'completed' : 'running',
      },
      {
        id: 'plan',
        title: '生成计划',
        description: agentWorkspaceFlow.value.status === 'planning'
          ? agentWorkspaceFlow.value.description
          : plan.value
            ? '已生成最小可运行计划'
            : hasBlockingMissingInfo.value
              ? '需要先补充阻塞信息'
              : '尚未生成计划',
        status: planningStatus,
      },
      {
        id: 'loop',
        title: '自动分析',
        description: agentLoopRunning.value
          ? (streamHeadline.value || '系统正在自动执行当前计划')
          : agentLoopOutput.value
            ? `共完成 ${agentLoopOutput.value.totalIterations} 轮分析`
            : '生成计划后即可启动自动分析',
        status: executionStatus,
      },
      {
        id: 'conclusion',
        title: '输出结论',
        description: agentLoopOutput.value?.conclusion?.summary ?? '自动分析结束后输出最终结论',
        status: conclusionStatus,
      },
      {
        id: 'apply',
        title: '同步画布',
        description:
          autoApplyResult.value.message
          || '完成后默认自动应用最终计划到右侧画布',
        status: syncStatus,
      },
    ]
  })
  const agentMessages = computed(() =>
    sessionState.value
      ? buildAgentMessages({
          prompt: prompt.value || sessionState.value.prompt,
          conversation: analysisConversation.value,
          toolCalls: agentToolCalls.value,
          timeline: agentTimeline.value,
          streamOutputs: streamOutputs.value,
          streamEvents: streamEvents.value,
          plan: plan.value,
          loopOutput: agentLoopOutput.value,
          autoApplyResult: autoApplyResult.value,
          session: sessionState.value,
        })
      : [],
  )
  const analysisAgentSession = computed<AnalysisAgentSessionState | null>(() => {
    if (!sessionState.value) return null

    const phase = agentPhase.value

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

    const artifacts = buildAgentArtifacts({
      plan: plan.value,
      loopOutput: agentLoopOutput.value,
      autoApplyResult: autoApplyResult.value,
      session: sessionState.value,
    })

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
      return
    }

    // ── Agent Loop 事件处理 ──

    if (event.type === 'loop_started') {
      streamHeadline.value = `自动分析已启动，最多 ${event.maxIterations} 轮`
      return
    }

    if (event.type === 'loop_iteration_started') {
      streamHeadline.value = `第 ${event.iteration} 轮分析开始`
      return
    }

    if (event.type === 'node_execution_started') {
      streamHeadline.value = `正在执行节点：${event.nodeLabel}`
      return
    }

    if (event.type === 'node_execution_completed') {
      streamHeadline.value = `${event.nodeLabel} 执行完成`
      return
    }

    if (event.type === 'node_execution_failed') {
      streamHeadline.value = `${event.nodeLabel} 执行失败：${event.summary}`
      return
    }

    if (event.type === 'interpretation_delta') {
      return
    }

    if (event.type === 'interpretation_completed') {
      streamHeadline.value = event.shouldContinue
        ? `第 ${event.iteration} 轮分析完成，准备追加分析`
        : `第 ${event.iteration} 轮分析完成，准备生成结论`
      return
    }

    if (event.type === 'conclusion_started') {
      streamHeadline.value = '正在生成分析结论...'
      return
    }

    if (event.type === 'conclusion_delta') {
      return
    }

    if (event.type === 'conclusion_completed') {
      streamHeadline.value = event.conclusion
        ? `结论：${event.conclusion.summary.slice(0, 60)}`
        : '结论已生成'
      return
    }

    if (event.type === 'loop_completed') {
      streamHeadline.value = `自动分析完成，共 ${event.totalIterations} 轮 (${(event.totalDurationMs / 1000).toFixed(1)}s)`
      return
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

  const setAgentLoopPreset = (preset: AgentLoopPresetId) => {
    if (preset in AGENT_LOOP_PRESET_CONFIG) {
      agentLoopPreset.value = preset
    }
  }

  const generatePlan = async (workflowStore: WorkflowStoreLike) => {
    const profile = selectedProfile.value
    if (!profile) {
      throw new Error('请先选择可用的模型配置')
    }

    isGenerating.value = true
    resetStreamingState('正在准备 AI 编排请求')
    resetAgentLoopState()
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
    resetAgentLoopState()
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

  const startAgentLoop = async (
    workflowStore: WorkflowStoreLike,
    config?: { maxIterations?: number; autoExecute?: boolean; generateConclusion?: boolean },
  ) => {
    const profile = selectedProfile.value
    if (!profile) {
      throw new Error('请先选择可用的模型配置')
    }
    if (!sessionState.value?.sessionId) {
      throw new Error('请先生成工作流计划后再启动自动分析')
    }

    const resolvedConfig = config ?? AGENT_LOOP_PRESET_CONFIG[agentLoopPreset.value]

    agentLoopRunning.value = true
    agentLoopOutput.value = null
    autoApplyResult.value = {
      status: 'idle',
      message: '',
    }
    lastAppliedSnapshotId.value = ''
    resetStreamingState('自动分析正在启动')
    workflowStore.addLog?.('自动分析开始运行', 'info')

    try {
      const output = await runAnalysisAgentLoop(
        sessionState.value.sessionId,
        resolvedConfig,
        {
          onEvent(event) {
            appendStreamEvent(event)
          },
        },
      )
      agentLoopOutput.value = output

      // 自动应用最后一轮的计划
      const lastIteration = output.iterations[output.iterations.length - 1]
      if (lastIteration?.plan) {
        plan.value = lastIteration.plan
        try {
          const applyResult = workflowStore.applyWorkflowAiPlan(lastIteration.plan)
          lastAppliedSnapshotId.value = applyResult.snapshotId
          autoApplyResult.value = {
            status: 'applied',
            message: '已自动同步到右侧画布，可直接继续检查最终计划。',
          }
          workflowStore.addLog?.('自动分析已自动应用最终计划', 'info')
        } catch {
          lastAppliedSnapshotId.value = ''
          autoApplyResult.value = {
            status: 'failed',
            message: '最终计划已生成，但自动同步到右侧画布失败，请手动应用。',
          }
          workflowStore.addLog?.('自动分析计划应用失败，请手动应用', 'warn')
        }
      }

      streamStatus.value = 'completed'
      streamHeadline.value = output.conclusion
        ? `自动分析完成：${output.conclusion.summary}`
        : `自动分析完成，共 ${output.totalIterations} 轮`
      workflowStore.addLog?.(`自动分析运行成功，共 ${output.totalIterations} 轮`, 'info')
    } catch (error: any) {
      errorMessage.value = error.message ?? '自动分析运行失败'
      streamStatus.value = 'failed'
      streamHeadline.value = errorMessage.value
      workflowStore.addLog?.(`自动分析运行失败: ${errorMessage.value}`, 'error')
      throw error
    } finally {
      agentLoopRunning.value = false
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
    resetAgentLoopState(true)
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
    canStartAgentLoop,
    hasBlockingMissingInfo,
    latestLoopIteration,
    agentLoopPreset,
    agentLoopPresetOptions,
    agentWorkspaceFlow,
    agentWorkspaceSteps,
    autoApplyResult,
    settingsVisible,
    activeExecutionTab,
    agentLoopRunning,
    agentLoopOutput,
    lastAppliedSnapshotId,
    lastTestResult,
    loadProfiles,
    upsertCustomProfile,
    removeCustomProfile,
    testProfile,
    setAgentLoopPreset,
    generatePlan,
    continueSession,
    applyCurrentPlan,
    restoreLastApplied,
    syncAnalysisCanvas,
    setActiveExecutionTab,
    setApplyError,
    resetPlan,
    startAgentLoop,
  }
})
