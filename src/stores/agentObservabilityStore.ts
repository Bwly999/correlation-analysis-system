import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type {
  AgentObservabilityDebugFilesResponse,
  AgentObservabilityDebugHealth,
  AgentObservabilityDebugReplayResponse,
  AgentObservabilityDebugTraceResponse,
} from '@/ai/types'
import {
  getAgentObservabilityDebugFiles,
  getAgentObservabilityDebugHealth,
  getAgentObservabilityDebugReplay,
  getAgentObservabilityDebugTrace,
} from '@/services/agentWorkspace'

export const useAgentObservabilityStore = defineStore('agent-observability', () => {
  const drawerVisible = ref(false)
  const lockedSessionId = ref('')
  const activeSessionId = ref('')
  const loading = ref(false)
  const replayLoading = ref(false)
  const errorMessage = ref('')
  const health = ref<AgentObservabilityDebugHealth | null>(null)
  const trace = ref<AgentObservabilityDebugTraceResponse | null>(null)
  const replay = ref<AgentObservabilityDebugReplayResponse | null>(null)
  const files = ref<AgentObservabilityDebugFilesResponse | null>(null)

  const effectiveSessionId = computed(() => lockedSessionId.value || activeSessionId.value)
  const isLocked = computed(() => Boolean(lockedSessionId.value))

  const setActiveSessionId = (sessionId: string | null | undefined) => {
    activeSessionId.value = sessionId?.trim() ?? ''
  }

  const toggleDrawer = () => {
    drawerVisible.value = !drawerVisible.value
  }

  const setDrawerVisible = (visible: boolean) => {
    drawerVisible.value = visible
  }

  const toggleLockCurrentSession = () => {
    if (lockedSessionId.value) {
      lockedSessionId.value = ''
      return
    }
    lockedSessionId.value = activeSessionId.value
  }

  const loadHealth = async () => {
    health.value = await getAgentObservabilityDebugHealth()
    return health.value
  }

  const loadTrace = async (options: { limit?: number, offset?: number } = {}) => {
    if (!effectiveSessionId.value) return null
    loading.value = true
    errorMessage.value = ''
    try {
      const [nextTrace, nextFiles] = await Promise.all([
        getAgentObservabilityDebugTrace(effectiveSessionId.value, options),
        getAgentObservabilityDebugFiles(effectiveSessionId.value),
      ])
      trace.value = nextTrace
      files.value = nextFiles
      return nextTrace
    } catch (error: any) {
      errorMessage.value = error.message ?? '读取 Agent 调试 Trace 失败'
      throw error
    } finally {
      loading.value = false
    }
  }

  const loadReplay = async (seq?: number) => {
    if (!effectiveSessionId.value) return null
    replayLoading.value = true
    errorMessage.value = ''
    try {
      const nextReplay = await getAgentObservabilityDebugReplay(effectiveSessionId.value, seq)
      replay.value = nextReplay
      return nextReplay
    } catch (error: any) {
      errorMessage.value = error.message ?? '读取 Agent 调试回放失败'
      throw error
    } finally {
      replayLoading.value = false
    }
  }

  const jumpToSeq = async (seq: number) => {
    return await loadReplay(seq)
  }

  return {
    drawerVisible,
    lockedSessionId,
    activeSessionId,
    effectiveSessionId,
    isLocked,
    loading,
    replayLoading,
    errorMessage,
    health,
    trace,
    replay,
    files,
    setActiveSessionId,
    toggleDrawer,
    setDrawerVisible,
    toggleLockCurrentSession,
    loadHealth,
    loadTrace,
    loadReplay,
    jumpToSeq,
  }
})
