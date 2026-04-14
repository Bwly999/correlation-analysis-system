<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useWorkflowAiStore } from '@/stores/workflowAiStore'
import { useWorkflowStore } from '@/stores/workflowStore'
import AgentComposer from './AgentComposer.vue'
import AgentHeader from './AgentHeader.vue'
import AgentMessageList from './AgentMessageList.vue'
import AgentModelSettingsDialog from './AgentModelSettingsDialog.vue'
import AgentProgressBar from './AgentProgressBar.vue'
import AgentRuntimePanel from './AgentRuntimePanel.vue'
import AgentToolCallList from './AgentToolCallList.vue'
import AgentVersionPanel from './AgentVersionPanel.vue'

const props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  focusReport: []
}>()

const aiStore = useWorkflowAiStore()
const workflowStore = useWorkflowStore()

const session = computed(() => aiStore.analysisAgentSession)
const toolCalls = computed(() => aiStore.agentToolCalls)
const railToolCalls = computed(() => toolCalls.value.filter((item) => item.status === 'running' || item.status === 'failed'))
const messages = computed(() => aiStore.agentMessages)
const hasToolRail = computed(() => railToolCalls.value.length > 0)
const artifacts = computed(() => session.value?.artifacts ?? [])
const approvalRequests = computed(() => session.value?.approvalRequests ?? [])
const workflowId = computed(() => workflowStore.currentWorkflowId)
const workflowVersions = computed(() => workflowStore.workflowVersions)
const selectedWorkflowVersionDetail = computed(() => workflowStore.selectedWorkflowVersionDetail)
const progressHeadline = computed(() =>
  aiStore.streamHeadline
  || aiStore.agentTimeline.find((item) => item.status === 'running' || item.status === 'waiting' || item.status === 'failed')?.description
  || aiStore.agentWorkspaceSteps.find((item) => item.status === 'running' || item.status === 'waiting' || item.status === 'failed')?.description
  || '',
)
const versionsLoading = ref(false)
const versionDetailLoading = ref(false)
const rollbackingVersionId = ref('')

const ensureWorkflowVersionsLoaded = async (targetWorkflowId: string) => {
  const hasLoadedCurrentWorkflowVersions =
    workflowVersions.value.length > 0
    && workflowVersions.value.every((version) => version.workflowId === targetWorkflowId)

  if (hasLoadedCurrentWorkflowVersions) {
    return
  }

  versionsLoading.value = true
  try {
    await workflowStore.loadWorkflowVersions(targetWorkflowId)
  } finally {
    versionsLoading.value = false
  }
}

const handleSubmit = async (value: string) => {
  aiStore.prompt = value
  if (!aiStore.selectedProfile) {
    aiStore.settingsVisible = true
    return
  }

  try {
    await aiStore.generatePlan(workflowStore)
    if (!aiStore.hasBlockingMissingInfo && aiStore.canStartAgentLoop) {
      await aiStore.startAgentLoop(workflowStore)
    }
  } catch {
    // error handled in store
  }
}

const handleClear = () => {
  aiStore.resetPlan()
  aiStore.settingsVisible = false
}

const handleNewSession = () => {
  aiStore.resetPlan()
  aiStore.settingsVisible = false
}

const handleSelectAgentLoopPreset = (preset: 'standard' | 'deep') => {
  aiStore.setAgentLoopPreset(preset)
}

const openModelSettings = () => {
  aiStore.settingsVisible = true
}

const handleSelectVersion = async (versionId: string) => {
  if (!workflowId.value) return

  versionDetailLoading.value = true
  try {
    await workflowStore.loadWorkflowVersionDetail(versionId, workflowId.value)
  } finally {
    versionDetailLoading.value = false
  }
}

const handleRollbackVersion = async (versionId: string) => {
  if (!workflowId.value) return

  rollbackingVersionId.value = versionId
  try {
    const result = await workflowStore.rollbackWorkflowVersion(versionId, workflowId.value)
    if (result?.version?.id) {
      await workflowStore.loadWorkflowVersionDetail(result.version.id, result.workflow.id)
    }
  } finally {
    rollbackingVersionId.value = ''
  }
}

watch(
  [() => props.visible, workflowId],
  async ([visible, currentWorkflowId]) => {
    if (!visible || !currentWorkflowId) return
    await ensureWorkflowVersionsLoaded(currentWorkflowId)
  },
  { immediate: true },
)

onMounted(async () => {
  if (!aiStore.profiles.length) {
    await aiStore.loadProfiles()
  }
})
</script>

<template>
  <aside
    class="agent-workspace"
    :class="{ 'is-hidden': !props.visible }"
    :data-visible="props.visible"
  >
    <AgentHeader
      :session="session"
      @clear="handleClear"
      @new-session="handleNewSession"
      @focus-report="emit('focusReport')"
    />

    <AgentProgressBar
      :steps="aiStore.agentWorkspaceSteps"
      :headline="progressHeadline"
      :auto-apply-status="aiStore.autoApplyResult.status"
      :auto-apply-message="aiStore.autoApplyResult.message"
      :has-applied-snapshot="Boolean(aiStore.lastAppliedSnapshotId)"
    />

    <div class="agent-workspace__body">
      <div class="agent-workspace__main">
        <AgentMessageList
          :messages="messages"
          :tool-calls="toolCalls"
          :artifacts="artifacts"
          :approval-requests="approvalRequests"
          :timeline="aiStore.agentTimeline"
        />
      </div>

      <div class="agent-workspace__rail">
        <AgentRuntimePanel
          :flow="aiStore.agentWorkspaceFlow"
          :workflow-name="workflowStore.workflowName"
          :workflow-id="workflowId"
          :headline="progressHeadline"
          :approval-requests="approvalRequests"
          :tool-calls="toolCalls"
          :version-count="workflowVersions.length"
          :loop-running="aiStore.agentLoopRunning"
          :auto-apply-status="aiStore.autoApplyResult.status"
        />

        <AgentVersionPanel
          :workflow-id="workflowId"
          :workflow-name="workflowStore.workflowName"
          :versions="workflowVersions"
          :selected-version-detail="selectedWorkflowVersionDetail"
          :loading="versionsLoading"
          :detail-loading="versionDetailLoading"
          :rollbacking="rollbackingVersionId !== ''"
          @select-version="handleSelectVersion"
          @rollback="handleRollbackVersion"
        />

        <AgentToolCallList v-if="hasToolRail" :items="railToolCalls" />
      </div>
    </div>

    <AgentComposer
      :prompt="aiStore.prompt"
      :approval-requests="approvalRequests"
      :preset="aiStore.agentLoopPreset"
      :preset-options="aiStore.agentLoopPresetOptions"
      :disabled="aiStore.isGenerating || aiStore.agentLoopRunning"
      @submit="handleSubmit"
      @update-prompt="aiStore.prompt = $event"
      @update-preset="handleSelectAgentLoopPreset"
      @open-model-settings="openModelSettings"
    />

    <AgentModelSettingsDialog
      :visible="aiStore.settingsVisible"
      @close="aiStore.settingsVisible = false"
    />
  </aside>
</template>

<style scoped>
.agent-workspace {
  height: 100%;
  display: grid;
  grid-template-rows: auto 1fr auto;
  background: #f4f7fb;
  border-right: 1px solid #dbe4ef;
  min-width: 0;
}

.agent-workspace.is-hidden {
  display: none;
}

.agent-workspace__body {
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 300px;
  gap: 16px;
}

.agent-workspace__main {
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
  padding: 18px 0 18px 18px;
}

.agent-workspace__rail {
  min-height: 0;
  overflow-y: auto;
  padding: 18px 18px 18px 0;
  display: grid;
  align-content: start;
  gap: 16px;
}

@media (max-width: 1560px) {
  .agent-workspace__body {
    grid-template-columns: minmax(0, 1fr);
  }

  .agent-workspace__rail {
    padding: 0 18px 18px;
  }

  .agent-workspace__main {
    padding-right: 18px;
  }
}
</style>
