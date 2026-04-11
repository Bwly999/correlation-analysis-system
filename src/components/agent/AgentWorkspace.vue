<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useWorkflowAiStore } from '@/stores/workflowAiStore'
import { useWorkflowStore } from '@/stores/workflowStore'
import AgentComposer from './AgentComposer.vue'
import AgentHeader from './AgentHeader.vue'
import AgentMessageList from './AgentMessageList.vue'
import AgentModelSettingsDialog from './AgentModelSettingsDialog.vue'
import AgentProgressBar from './AgentProgressBar.vue'
import AgentToolCallList from './AgentToolCallList.vue'

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
const progressHeadline = computed(() =>
  aiStore.streamHeadline
  || aiStore.agentTimeline.find((item) => item.status === 'running' || item.status === 'waiting' || item.status === 'failed')?.description
  || aiStore.agentWorkspaceSteps.find((item) => item.status === 'running' || item.status === 'waiting' || item.status === 'failed')?.description
  || '',
)

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

    <div class="agent-workspace__body" :class="{ 'has-tool-rail': hasToolRail }">
      <div class="agent-workspace__main">
        <AgentMessageList
          :messages="messages"
          :tool-calls="toolCalls"
          :artifacts="artifacts"
          :approval-requests="approvalRequests"
          :timeline="aiStore.agentTimeline"
        />
      </div>

      <div v-if="hasToolRail" class="agent-workspace__rail">
        <AgentToolCallList :items="railToolCalls" />
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
  grid-template-columns: 1fr;
}

.agent-workspace__body.has-tool-rail {
  grid-template-columns: minmax(0, 1fr) 260px;
}

.agent-workspace__main {
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
  padding: 18px;
}

.agent-workspace__rail {
  min-height: 0;
  overflow-y: auto;
  padding: 18px 18px 18px 0;
  display: grid;
  align-content: start;
  gap: 16px;
}

@media (max-width: 1440px) {
  .agent-workspace__body {
    grid-template-columns: 1fr;
  }

  .agent-workspace__rail {
    padding: 0 18px 18px;
  }
}
</style>
