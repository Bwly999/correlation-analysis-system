import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'
import { buildWorkflowAiNodeCatalog, buildWorkflowAiSnapshot } from '@/ai/catalog'
import type {
  AgentConversationEntry,
  AgentProjectionSnapshot,
  AgentSessionEvent,
  AgentSessionMessage,
  AgentSessionState,
  AnalysisAgentArtifact,
  AnalysisAgentApprovalRequest,
  AnalysisAgentExecutionTab,
  AnalysisAgentSessionState,
  AnalysisAgentTimelineStep,
  AnalysisAgentToolCall,
  WorkflowAiContextHints,
  WorkflowAiModelProfile,
  WorkflowAiModelTestResult,
  WorkflowAiPlan,
  WorkflowAiPlanMode,
  WorkflowAiSessionState,
  WorkflowAiToolTraceItem,
} from '@/ai/types'
import { buildLocalWorkflowAiContext } from '@/ai/tools/localContext'
import {
  WorkflowAiRequestError,
  createAgentSession,
  fetchSystemModelProfiles,
  sendAgentSessionMessage,
  streamAgentSessionEvents,
  syncAgentCanvas,
  testWorkflowAiModelProfile,
} from '@/services/agentWorkspace'

const CUSTOM_PROFILE_STORAGE_KEY = 'workflow_ai_custom_profiles'
const GENERIC_AGENT_CAPABILITY = 'generic_read_write_lite' as const

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

type AutoApplyResult = {
  status: 'idle' | 'applied' | 'failed'
  message: string
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

const mapProjectionToArtifacts = (projection: AgentProjectionSnapshot): AnalysisAgentArtifact[] => {
  const artifacts: AnalysisAgentArtifact[] = [
    {
      id: 'workflow_projection',
      type: 'workflow_summary',
      title: '当前工作流草案',
      summary: projection.workflow.draftSummary,
      bullets: [
        `节点 ${projection.workflow.draftNodeCount} 个`,
        `连线 ${projection.workflow.draftEdgeCount} 条`,
      ],
    },
    {
      id: 'analysis_projection',
      type: 'workflow_summary',
      title: '当前分析状态',
      summary: projection.analysis.summary,
      bullets: [
        ...projection.analysis.methods.slice(0, 2),
        ...projection.analysis.risks.slice(0, 1),
        ...projection.analysis.recommendations.slice(0, 1),
      ],
    },
  ]

  if (projection.canvasSync.status !== 'idle') {
    artifacts.push({
      id: 'canvas_sync',
      type: 'workflow_summary',
      title: '画布同步状态',
      summary: projection.canvasSync.message,
      bullets: [],
    })
  }

  return artifacts
}

const mapProjectionPhase = (
  session: AgentSessionState | null,
  projection: AgentProjectionSnapshot | null,
): AnalysisAgentSessionState['phase'] => {
  if (!session) return 'intent'
  if (session.status === 'failed' || projection?.error) return 'failed'
  if (session.status === 'completed') return 'completed'
  if (session.status === 'running') return 'executing'
  return 'planning'
}

export const useWorkflowAiStore = defineStore('workflow-ai', () => {
  const systemProfiles = ref<WorkflowAiModelProfile[]>([])
  const customProfiles = ref<WorkflowAiModelProfile[]>(readCustomProfiles())
  const selectedProfileId = shallowRef('')
  const prompt = shallowRef('')
  const mode = shallowRef<WorkflowAiPlanMode>('create')
  const plan = ref<WorkflowAiPlan | null>(null)
  const isGenerating = shallowRef(false)
  const isLoadingProfiles = shallowRef(false)
  const errorMessage = shallowRef('')
  const generationDiagnostics = ref<any>(null)
  const streamStatus = shallowRef<'idle' | 'streaming' | 'completed' | 'failed'>('idle')
  const streamHeadline = shallowRef('')
  const streamEvents = ref<AgentSessionEvent[]>([])
  const streamOutputs = ref<Array<{ attempt: number; trigger: 'initial' | 'repair'; text: string }>>([])
  const contextHints = ref<WorkflowAiContextHints | null>(null)
  const toolTrace = ref<WorkflowAiToolTraceItem[]>([])
  const sessionState = ref<WorkflowAiSessionState | null>(null)
  const settingsVisible = shallowRef(false)
  const lastAppliedSnapshotId = shallowRef('')
  const lastTestResult = ref<WorkflowAiModelTestResult | null>(null)
  const activeExecutionTab = shallowRef<AnalysisAgentExecutionTab>('execution')

  const activeSession = ref<AgentSessionState | null>(null)
  const projectionSnapshot = ref<AgentProjectionSnapshot | null>(null)
  const sessionMessages = ref<AgentSessionMessage[]>([])
  const streamingMessage = shallowRef('')
  const workflowSummary = shallowRef('')
  const eventStreamConnected = shallowRef(false)
  const autoApplyResult = ref<AutoApplyResult>({
    status: 'idle',
    message: '',
  })

  const profiles = computed(() => [...systemProfiles.value, ...customProfiles.value])
  const selectedProfile = computed(
    () => profiles.value.find((profile) => profile.id === selectedProfileId.value) ?? null,
  )
  const canStartAgentLoop = computed(() => false)
  const hasBlockingMissingInfo = computed(() => false)
  const latestLoopIteration = computed(() => 0)
  const agentToolCalls = computed<AnalysisAgentToolCall[]>(() => projectionSnapshot.value?.execution.toolCalls ?? [])

  const agentTimeline = computed<AnalysisAgentTimelineStep[]>(() => {
    const projection = projectionSnapshot.value
    if (!projection) {
      return [
        {
          id: 'goal',
          title: '输入消息',
          description: prompt.value || '先描述你想处理的问题或任务',
          status: prompt.value ? 'completed' : 'running',
        },
        {
          id: 'analysis',
          title: '处理当前请求',
          description: '等待开始处理',
          status: 'idle',
        },
        {
          id: 'canvas',
          title: '同步画布',
          description: '等待生成工作流草案',
          status: 'idle',
        },
      ]
    }

    return [
      {
        id: 'goal',
        title: '输入消息',
        description: activeSession.value?.prompt,
        status: 'completed',
      },
      {
        id: 'analysis',
        title: '处理当前请求',
        description: projection.execution.latestAction,
        status:
          projection.execution.status === 'failed'
            ? 'failed'
            : projection.execution.status === 'running'
              ? 'running'
              : 'completed',
      },
      {
        id: 'canvas',
        title: '同步画布',
        description: projection.canvasSync.message,
        status:
          projection.canvasSync.status === 'failed'
            ? 'failed'
            : projection.canvasSync.status === 'synced'
              ? 'completed'
              : 'idle',
      },
    ]
  })

  const agentWorkspaceFlow = computed(() => {
    if (!selectedProfile.value) {
      return {
        status: 'idle' as const,
        title: '先选择可用模型配置',
        description: '需要先选择模型配置，才能开始对话。',
        badge: '待准备',
      }
    }

    if (errorMessage.value) {
      return {
        status: 'failed' as const,
        title: '当前请求失败',
        description: errorMessage.value,
        badge: '失败',
      }
    }

    if (streamStatus.value === 'streaming') {
      return {
        status: 'running' as const,
        title: '处理中',
        description: streamHeadline.value || '正在读取工作流上下文并处理当前请求。',
        badge: '执行中',
      }
    }

    if (projectionSnapshot.value) {
      return {
        status: 'completed' as const,
        title: '回复已就绪',
        description: projectionSnapshot.value.analysis.summary,
        badge: projectionSnapshot.value.canvasSync.status === 'synced' ? '已同步画布' : '已完成',
      }
    }

    return {
      status: 'idle' as const,
      title: '先描述你想处理的问题',
      description: '系统会结合当前工作流和数据上下文进行对话、调工具和返回结果。',
      badge: '待开始',
    }
  })

  const agentWorkspaceSteps = computed(() => agentTimeline.value)

  const upsertSessionMessage = (message: AgentSessionMessage) => {
    const index = sessionMessages.value.findIndex((item) => item.id === message.id)
    if (index >= 0) {
      sessionMessages.value.splice(index, 1, message)
      return
    }
    sessionMessages.value.push(message)
  }

  const syncPlanFromProjection = () => {
    plan.value = projectionSnapshot.value?.workflow.proposedPlan ?? null
  }

  const applyProjectionSnapshot = (projection: AgentProjectionSnapshot) => {
    projectionSnapshot.value = projection
    workflowSummary.value = `当前草案共 ${projection.workflow.draftNodeCount} 个节点、${projection.workflow.draftEdgeCount} 条连线`
    syncPlanFromProjection()
  }

  const applyAgentEvent = (event: AgentSessionEvent) => {
    streamEvents.value.push(event)

    if (event.type === 'session.status.updated') {
      activeSession.value = event.session
      if (event.session.status === 'running') {
        streamStatus.value = 'streaming'
      } else if (event.session.status === 'completed') {
        streamStatus.value = 'completed'
      } else if (event.session.status === 'failed') {
        streamStatus.value = 'failed'
      }
      return
    }

    if (event.type === 'projection.workflow.updated' && projectionSnapshot.value) {
      applyProjectionSnapshot({
        ...projectionSnapshot.value,
        workflow: event.projection,
        updatedAt: Date.now(),
      })
      return
    }

    if (event.type === 'projection.analysis.updated' && projectionSnapshot.value) {
      applyProjectionSnapshot({
        ...projectionSnapshot.value,
        analysis: event.projection,
        updatedAt: Date.now(),
      })
      streamHeadline.value = event.projection.summary
      return
    }

    if (event.type === 'projection.execution.updated' && projectionSnapshot.value) {
      applyProjectionSnapshot({
        ...projectionSnapshot.value,
        execution: event.projection,
        updatedAt: Date.now(),
      })
      streamHeadline.value = event.projection.latestAction
      streamStatus.value =
        event.projection.status === 'failed'
          ? 'failed'
          : event.projection.status === 'completed'
            ? 'completed'
            : 'streaming'
      return
    }

    if (event.type === 'projection.canvas_sync.updated' && projectionSnapshot.value) {
      applyProjectionSnapshot({
        ...projectionSnapshot.value,
        canvasSync: event.projection,
        updatedAt: Date.now(),
      })
      autoApplyResult.value = {
        status: event.projection.status === 'synced' ? 'applied' : 'failed',
        message: event.projection.message,
      }
      return
    }

    if (event.type === 'projection.error.updated' && projectionSnapshot.value) {
      applyProjectionSnapshot({
        ...projectionSnapshot.value,
        error: event.projection,
        updatedAt: Date.now(),
      })
      errorMessage.value = event.projection.message
      streamStatus.value = 'failed'
      return
    }

    if (event.type === 'message.delta') {
      streamingMessage.value += event.delta
      streamStatus.value = 'streaming'
      return
    }

    if (event.type === 'message.completed') {
      upsertSessionMessage(event.message)
      streamingMessage.value = ''
      if (streamStatus.value !== 'failed') {
        streamStatus.value = 'completed'
      }
      streamHeadline.value = event.message.content
      return
    }

    if (event.type === 'failed') {
      errorMessage.value = event.message
      streamStatus.value = 'failed'
    }
  }

  const ensureSelectedProfile = () => {
    if (selectedProfile.value?.enabled) return
    const fallbackProfile = profiles.value.find((profile) => profile.enabled)
    selectedProfileId.value = fallbackProfile?.id ?? ''
  }

  ensureSelectedProfile()

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

  const buildSessionRequest = async (workflowStore: WorkflowStoreLike) => {
    const profile = selectedProfile.value
    if (!profile) {
      throw new Error('请先选择可用的模型配置')
    }

    const canInspectCanvas =
      workflowStore.nodes.every((node) => typeof node === 'object' && node !== null && 'data' in node)
      && workflowStore.edges.every((edge) => typeof edge === 'object' && edge !== null)

    const localContext = canInspectCanvas
      ? await buildLocalWorkflowAiContext({
          mode: mode.value,
          prompt: prompt.value,
          workflowName: workflowStore.workflowName,
          nodes: workflowStore.nodes,
          edges: workflowStore.edges,
          inspectNode: workflowStore.executeForAiInspection,
        })
      : {
          contextHints: null,
          toolTrace: [],
        }
    contextHints.value = localContext.contextHints ?? null
    toolTrace.value = localContext.toolTrace

    return {
      request: {
        mode: mode.value,
        prompt: prompt.value,
        profile,
        agentCapability: GENERIC_AGENT_CAPABILITY,
        workflowSnapshot:
          mode.value === 'edit'
            ? {
                name: workflowStore.workflowName,
                ...buildWorkflowAiSnapshot(workflowStore.nodes, workflowStore.edges),
              }
            : undefined,
        contextHints: localContext.contextHints ?? undefined,
        nodeCatalog: buildWorkflowAiNodeCatalog(),
      },
      localContext,
    }
  }

  const ensureAgentSession = async (workflowStore: WorkflowStoreLike) => {
    if (activeSession.value) return activeSession.value

    const { request } = await buildSessionRequest(workflowStore)
    const response = await createAgentSession(request)
    activeSession.value = response.session
    applyProjectionSnapshot(response.projection)
    streamStatus.value = 'idle'
    streamHeadline.value = '通用助手会话已准备完成'
    return response.session
  }

  const ensureEventStream = (sessionId: string) => {
    if (eventStreamConnected.value) return
    eventStreamConnected.value = true
    void streamAgentSessionEvents(sessionId, {
      onEvent: applyAgentEvent,
    }).catch((error: any) => {
      errorMessage.value = error.message ?? '读取 Agent 事件流失败'
      eventStreamConnected.value = false
    })
  }

  const submitAgentMessage = async (
    workflowStore: WorkflowStoreLike,
    content?: string,
  ) => {
    const message = (content ?? prompt.value).trim()
    if (!message) {
      throw new Error('请先输入要处理的内容')
    }

    prompt.value = message
    errorMessage.value = ''
    streamStatus.value = 'streaming'
    streamHeadline.value = '正在发送当前消息'
    isGenerating.value = true

    try {
      const session = await ensureAgentSession(workflowStore)
      upsertSessionMessage({
        id: `user_${Date.now()}`,
        role: 'user',
        content: message,
        status: 'completed',
        createdAt: Date.now(),
      })
      ensureEventStream(session.id)

      const response = await sendAgentSessionMessage(session.id, {
        content: message,
        skillId: 'generic',
      })
      if (!activeSession.value || activeSession.value.id !== response.session.id || activeSession.value.status === 'idle') {
        activeSession.value = response.session
      }
      if (!projectionSnapshot.value) {
        applyProjectionSnapshot(response.projection)
      }
      if (response.assistantMessage) {
        upsertSessionMessage(response.assistantMessage)
      }
      if (!streamHeadline.value || streamHeadline.value === '正在发送当前消息') {
        streamHeadline.value = response.projection.execution.latestAction
      }
      workflowStore.addLog?.('通用助手消息发送成功', 'info')
      return response
    } catch (error: any) {
      errorMessage.value = error.message ?? '发送消息失败'
      streamStatus.value = 'failed'
      workflowStore.addLog?.(`通用助手消息发送失败: ${errorMessage.value}`, 'error')
      throw error
    } finally {
      isGenerating.value = false
    }
  }

  const startAnalysisSession = async (workflowStore: WorkflowStoreLike) => {
    isGenerating.value = true
    try {
      return await ensureAgentSession(workflowStore)
    } finally {
      isGenerating.value = false
    }
  }

  const generatePlan = async (workflowStore: WorkflowStoreLike) => {
    await submitAgentMessage(workflowStore)
    return plan.value
  }

  const continueSession = async (
    workflowStore: WorkflowStoreLike,
    answers: Record<string, string>,
  ) => {
    const answerText = Object.entries(answers)
      .map(([key, value]) => `${key}: ${value}`)
      .join('\n')
    await submitAgentMessage(workflowStore, answerText)
    return plan.value
  }

  const applyCurrentPlan = (workflowStore: WorkflowStoreLike) => {
    if (!plan.value) {
      throw new Error('当前没有可应用的工作流草案')
    }
    const result = workflowStore.applyWorkflowAiPlan(plan.value)
    lastAppliedSnapshotId.value = result.snapshotId
    autoApplyResult.value = {
      status: 'applied',
      message: '已将当前草案同步到画布',
    }
    return result
  }

  const restoreLastApplied = (workflowStore: WorkflowStoreLike) => {
    if (!lastAppliedSnapshotId.value) return false
    return workflowStore.restoreEditableSnapshot(lastAppliedSnapshotId.value)
  }

  const syncCanvas = async (workflowStore: WorkflowStoreLike) => {
    if (!activeSession.value) {
      throw new Error('当前没有可同步的 Agent 会话')
    }
    const currentPlan = plan.value ?? projectionSnapshot.value?.workflow.proposedPlan ?? null
    if (!currentPlan) {
      throw new Error('当前没有可同步的工作流草案')
    }

    const applyResult = workflowStore.applyWorkflowAiPlan(currentPlan)
    lastAppliedSnapshotId.value = applyResult.snapshotId
    const result = await syncAgentCanvas(activeSession.value.id, {
      workflowSnapshot: {
        name: workflowStore.workflowName,
        nodes: workflowStore.nodes,
        edges: workflowStore.edges,
      },
    })

    applyProjectionSnapshot(result.projection)
    autoApplyResult.value = {
      status: 'applied',
      message: result.syncSummary,
    }
    return result
  }

  const syncAnalysisCanvas = (workflowStore: WorkflowStoreLike) => {
    workflowSummary.value = `当前画布共 ${workflowStore.nodes.length} 个节点、${workflowStore.edges.length} 条连线`
  }

  const setActiveExecutionTab = (tab: AnalysisAgentExecutionTab) => {
    activeExecutionTab.value = tab
  }

  const setApplyError = (message: string) => {
    errorMessage.value = message
    autoApplyResult.value = {
      status: 'failed',
      message,
    }
  }

  const resetPlan = () => {
    plan.value = null
    activeSession.value = null
    projectionSnapshot.value = null
    sessionMessages.value = []
    streamingMessage.value = ''
    streamStatus.value = 'idle'
    streamHeadline.value = ''
    streamEvents.value = []
    streamOutputs.value = []
    contextHints.value = null
    toolTrace.value = []
    errorMessage.value = ''
    workflowSummary.value = ''
    autoApplyResult.value = {
      status: 'idle',
      message: '',
    }
    lastAppliedSnapshotId.value = ''
    eventStreamConnected.value = false
  }

  const analysisAgentSession = computed<AnalysisAgentSessionState | null>(() => {
    if (!activeSession.value || !projectionSnapshot.value) return null

    const conversation = sessionMessages.value.map((item) => ({
      id: item.id,
      role: item.role,
      content: item.content,
    }))

    return {
      sessionId: activeSession.value.id,
      userGoal: activeSession.value.prompt,
      phase: mapProjectionPhase(activeSession.value, projectionSnapshot.value),
      workflowSummary: workflowSummary.value || projectionSnapshot.value.workflow.draftSummary,
      conversation,
      messages: [],
      timeline: agentTimeline.value,
      toolCalls: agentToolCalls.value,
      artifacts: mapProjectionToArtifacts(projectionSnapshot.value),
      approvalRequests: projectionSnapshot.value.execution.pendingApprovals as AnalysisAgentApprovalRequest[],
      workflowSession: sessionState.value ?? ({
        sessionId: activeSession.value.id,
        mode: activeSession.value.mode,
        status: activeSession.value.status === 'idle' ? 'idle' : activeSession.value.status === 'failed' ? 'failed' : 'completed',
        prompt: activeSession.value.prompt,
        draft: {
          summary: projectionSnapshot.value.workflow.draftSummary,
          assumptions: [],
          warnings: [],
          questions: [],
          nodes: [],
          edges: [],
        },
        trace: [],
        diagnostics: {
          issues: [],
        },
        missingInfo: [],
      } as WorkflowAiSessionState),
    }
  })

  const agentMessages = computed<AgentConversationEntry[]>(() => {
    const items: AgentConversationEntry[] = []

    for (const message of sessionMessages.value) {
      items.push({
        id: message.id,
        kind: message.role === 'user' ? 'user' : 'assistant',
        title: message.role === 'user' ? '你' : '通用助手',
        content: message.content,
        status: message.status,
      })
    }

    if (projectionSnapshot.value) {
      if (projectionSnapshot.value.canvasSync.status !== 'idle') {
        items.push({
          id: 'canvas_sync',
          kind: 'canvas_sync',
          title: '画布同步状态',
          content: projectionSnapshot.value.canvasSync.message,
          details: [],
        })
      }

      for (const toolCall of projectionSnapshot.value.execution.toolCalls) {
        items.push({
          id: `tool_${toolCall.id}`,
          kind: 'tool_call',
          title: toolCall.displayName || toolCall.toolName,
          content: toolCall.summary || toolCall.outputSummary || toolCall.inputSummary || '工具调用已记录',
          details: [
            `状态：${toolCall.status === 'running' ? '执行中' : toolCall.status === 'failed' ? '失败' : '成功'}`,
            toolCall.linkedExecutionRef ? `执行记录：${toolCall.linkedExecutionRef}` : '',
          ].filter(Boolean),
          status:
            toolCall.status === 'running'
              ? 'streaming'
              : toolCall.status === 'failed'
                ? 'failed'
                : 'completed',
        })
      }

      for (const approval of projectionSnapshot.value.execution.pendingApprovals) {
        items.push({
          id: `approval_${approval.key}`,
          kind: 'approval',
          title: approval.label,
          content: approval.reason,
          details: [
            approval.blocking ? '需要确认后继续执行' : '建议补充信息',
          ],
          status: approval.blocking ? 'streaming' : 'completed',
        })
      }

      for (const evidence of projectionSnapshot.value.analysis.evidence ?? []) {
        items.push({
          id: `evidence_${evidence.evidenceId.replace(/[^a-zA-Z0-9_-]/g, '_')}`,
          kind: 'evidence',
          title: `证据：${evidence.nodeLabel}`,
          content: evidence.statement,
          details: [
            `证据 ID：${evidence.evidenceId}`,
            `执行记录：${evidence.executionId}`,
            `节点 ID：${evidence.nodeId}`,
          ],
          status: 'completed',
        })
      }

      if (projectionSnapshot.value.analysis.report) {
        const report = projectionSnapshot.value.analysis.report
        items.push({
          id: 'analysis_report',
          kind: 'report',
          title: report.title,
          content: report.summary,
          details: [
            ...(report.recommendations ?? []).map((item) => `建议：${item}`),
            ...(report.evidenceIds ?? []).map((item) => `证据：${item}`),
          ],
          status: 'completed',
        })
      }

      if (projectionSnapshot.value.error) {
        items.push({
          id: 'projection_error',
          kind: 'debug',
          title: '运行异常',
          content: projectionSnapshot.value.error.message,
          details: projectionSnapshot.value.error.detail ? [projectionSnapshot.value.error.detail] : [],
          status: 'failed',
        })
      }
    }

    if (streamingMessage.value) {
      items.push({
        id: 'streaming_message',
        kind: 'assistant',
        title: '通用助手',
        content: streamingMessage.value,
        status: 'streaming',
      })
    }

    return items
  })

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
    agentWorkspaceFlow,
    agentWorkspaceSteps,
    autoApplyResult,
    settingsVisible,
    activeExecutionTab,
    lastAppliedSnapshotId,
    lastTestResult,
    activeSession,
    projectionSnapshot,
    sessionMessages,
    streamingMessage,
    loadProfiles,
    upsertCustomProfile,
    removeCustomProfile,
    testProfile,
    generatePlan,
    startAnalysisSession,
    continueSession,
    applyCurrentPlan,
    restoreLastApplied,
    syncAnalysisCanvas,
    syncCanvas,
    setActiveExecutionTab,
    setApplyError,
    resetPlan,
    submitAgentMessage,
    applyAgentEvent,
  }
})
