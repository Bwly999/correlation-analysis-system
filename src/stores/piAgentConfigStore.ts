import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type { WorkflowAiContextHints, WorkflowAiModelProfile } from '@/ai/types'
import { buildLocalWorkflowAiContext } from '@/ai/tools/localContext'
import { fetchSystemModelProfiles } from '@/services/modelProfiles'

const CUSTOM_PROFILE_STORAGE_KEY = 'workflow_ai_custom_profiles'

const readCustomProfiles = (): WorkflowAiModelProfile[] => {
  try {
    const raw = localStorage.getItem(CUSTOM_PROFILE_STORAGE_KEY)
    if (!raw) return []
    return JSON.parse(raw) as WorkflowAiModelProfile[]
  } catch {
    return []
  }
}

export const usePiAgentConfigStore = defineStore('pi-agent-config', () => {
  const systemProfiles = ref<WorkflowAiModelProfile[]>([])
  const customProfiles = ref<WorkflowAiModelProfile[]>(readCustomProfiles())
  const selectedProfileId = ref('')
  const contextHints = ref<WorkflowAiContextHints | null>(null)
  const isLoadingProfiles = ref(false)
  const errorMessage = ref('')

  const profiles = computed(() => [...systemProfiles.value, ...customProfiles.value])
  const selectedProfile = computed(
    () => profiles.value.find((profile) => profile.id === selectedProfileId.value) ?? null,
  )

  const ensureSelectedProfile = () => {
    if (selectedProfile.value?.enabled) return
    const fallbackProfile = profiles.value.find((profile) => profile.enabled)
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
      errorMessage.value = error?.message ?? '加载模型配置失败'
    } finally {
      isLoadingProfiles.value = false
    }
  }

  const buildContextHints = async (workflowStore: {
    workflowName: string
    nodes: any[]
    edges: any[]
    executeForAiInspection?: (nodeId: string) => Promise<unknown>
  }, prompt: string) => {
    const canInspectCanvas =
      workflowStore.nodes.every((node) => typeof node === 'object' && node !== null && 'data' in node)
      && workflowStore.edges.every((edge) => typeof edge === 'object' && edge !== null)

    if (!canInspectCanvas) {
      contextHints.value = null
      return null
    }

    const localContext = await buildLocalWorkflowAiContext({
      mode: 'edit',
      prompt,
      workflowName: workflowStore.workflowName,
      nodes: workflowStore.nodes,
      edges: workflowStore.edges,
      inspectNode: workflowStore.executeForAiInspection,
    })

    contextHints.value = localContext.contextHints ?? null
    return contextHints.value
  }

  return {
    systemProfiles,
    customProfiles,
    selectedProfileId,
    selectedProfile,
    profiles,
    contextHints,
    isLoadingProfiles,
    errorMessage,
    loadProfiles,
    buildContextHints,
  }
})
