import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { buildWorkflowAiNodeCatalog, buildWorkflowAiSnapshot } from '@/ai/catalog'
import type { WorkflowAiModelProfile, WorkflowAiModelTestResult, WorkflowAiPlanMode } from '@/ai/types'
import { fetchSystemModelProfiles, requestWorkflowAiPlan, testWorkflowAiModelProfile } from '@/services/workflowAi'

const CUSTOM_PROFILE_STORAGE_KEY = 'workflow_ai_custom_profiles'

type WorkflowStoreLike = {
  workflowName: string
  nodes: any[]
  edges: any[]
  applyWorkflowAiPlan: (plan: any) => { snapshotId: string }
  restoreEditableSnapshot: (snapshotId: string) => boolean
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
  const plan = ref<any | null>(null)
  const isGenerating = ref(false)
  const isLoadingProfiles = ref(false)
  const errorMessage = ref('')
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
    try {
      plan.value = await requestWorkflowAiPlan({
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
      })
      return plan.value
    } catch (error: any) {
      errorMessage.value = error.message ?? '生成 AI 计划失败'
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
    resetPlan,
  }
})



