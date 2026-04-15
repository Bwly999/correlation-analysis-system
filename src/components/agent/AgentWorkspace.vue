<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useWorkflowAiStore } from '@/stores/workflowAiStore'
import { useWorkflowStore } from '@/stores/workflowStore'
import AgentComposer from './AgentComposer.vue'
import AgentHeader from './AgentHeader.vue'
import AgentMessageList from './AgentMessageList.vue'
import AgentModelSettingsDialog from './AgentModelSettingsDialog.vue'
import AgentProgressBar from './AgentProgressBar.vue'

const props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  focusReport: []
}>()

const aiStore = useWorkflowAiStore()
const workflowStore = useWorkflowStore()

const session = computed(() => aiStore.analysisAgentSession)
const messages = computed(() => aiStore.agentMessages)
const approvalRequests = computed(() => session.value?.approvalRequests ?? [])
const progressHeadline = computed(() =>
  aiStore.streamHeadline
  || aiStore.agentTimeline.find((item) => item.status === 'running' || item.status === 'waiting' || item.status === 'failed')?.description
  || '',
)
const canSyncCanvas = computed(() =>
  Boolean(aiStore.activeSession && (aiStore.plan || aiStore.projectionSnapshot?.workflow.proposedPlan)),
)

const handleSubmit = async (value: string) => {
  aiStore.prompt = value
  if (!aiStore.selectedProfile) {
    aiStore.settingsVisible = true
    return
  }

  try {
    await aiStore.submitAgentMessage(workflowStore, value)
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

const openModelSettings = () => {
  aiStore.settingsVisible = true
}

const handleSyncCanvas = async () => {
  try {
    await aiStore.syncCanvas(workflowStore)
  } catch {
    // error handled in store
  }
}

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
        <AgentMessageList :messages="messages" />
      </div>
    </div>

    <AgentComposer
      :prompt="aiStore.prompt"
      :approval-requests="approvalRequests"
      :disabled="aiStore.isGenerating"
      :can-sync-canvas="canSyncCanvas"
      @submit="handleSubmit"
      @update-prompt="aiStore.prompt = $event"
      @open-model-settings="openModelSettings"
      @sync-canvas="handleSyncCanvas"
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
  grid-template-rows: auto auto 1fr auto;
  background:
    radial-gradient(circle at top left, rgba(191, 219, 254, 0.36), transparent 34%),
    linear-gradient(180deg, #f6f9fc 0%, #f8fbff 100%);
  border-right: 1px solid #dbe4ef;
  min-width: 0;
}

.agent-workspace.is-hidden {
  display: none;
}

.agent-workspace__body {
  min-height: 0;
}

.agent-workspace__main {
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
  padding: 18px;
}
</style>
