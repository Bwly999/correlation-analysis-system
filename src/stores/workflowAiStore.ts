import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { buildWorkflowAiNodeCatalog, buildWorkflowAiSnapshot } from '@/ai/catalog'
import { buildLocalWorkflowAiContext } from '@/ai/tools/localContext'
import type {
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

  const profiles = computed(() => [...systemProfiles.value, ...customProfiles.value])
  const selectedProfile = computed(
    () => profiles.value.find((profile) => profile.id === selectedProfileId.value) ?? null,
  )

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
    settingsVisible,
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
    setApplyError,
    resetPlan,
  }
})
