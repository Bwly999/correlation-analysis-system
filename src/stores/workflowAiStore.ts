import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { buildWorkflowAiNodeCatalog, buildWorkflowAiSnapshot } from '@/ai/catalog'
import type {
  WorkflowAiGenerationDiagnostics,
  WorkflowAiModelProfile,
  WorkflowAiModelTestResult,
  WorkflowAiPlan,
  WorkflowAiPlanMode,
  WorkflowAiStreamEvent,
} from '@/ai/types'
import {
  WorkflowAiRequestError,
  fetchSystemModelProfiles,
  streamWorkflowAiPlan,
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
      return
    }

    if (event.type === 'completed') {
      plan.value = event.plan
      generationDiagnostics.value = event.diagnostics
      streamStatus.value = 'completed'
      streamHeadline.value = 'AI 编排生成成功'
      return
    }

    if (event.type === 'failed') {
      errorMessage.value = event.message
      generationDiagnostics.value = event.diagnostics ?? null
      streamStatus.value = 'failed'
      streamHeadline.value = event.message
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

  const generatePlan = async (workflowStore: WorkflowStoreLike) => {
    const profile = selectedProfile.value
    if (!profile) {
      throw new Error('请先选择可用的模型配置')
    }

    isGenerating.value = true
    errorMessage.value = ''
    generationDiagnostics.value = null
    streamStatus.value = 'streaming'
    streamHeadline.value = '正在准备 AI 编排请求'
    streamEvents.value = []
    streamOutputs.value = []
    workflowStore.addLog?.('AI编排开始生成计划', 'info')

    try {
      const response = await streamWorkflowAiPlan({
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
        nodeCatalog: buildWorkflowAiNodeCatalog(),
      }, {
        onEvent(event) {
          appendStreamEvent(event)
          if (event.type === 'attempt_started' && event.trigger === 'repair') {
            workflowStore.addLog?.('AI编排触发自动修复重试', 'warn')
          }
        },
      })

      plan.value = response.plan
      generationDiagnostics.value = response.diagnostics
      streamStatus.value = 'completed'
      streamHeadline.value = 'AI 编排生成成功'
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
    settingsVisible,
    lastAppliedSnapshotId,
    lastTestResult,
    loadProfiles,
    upsertCustomProfile,
    removeCustomProfile,
    testProfile,
    generatePlan,
    applyCurrentPlan,
    restoreLastApplied,
    setApplyError,
    resetPlan,
  }
})
