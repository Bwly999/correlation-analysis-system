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
const messages = computed(() => aiStore.agentMessages)
const hasToolRail = computed(() => toolCalls.value.length > 0)
const artifacts = computed(() => session.value?.artifacts ?? [])
const approvalRequests = computed(() => session.value?.approvalRequests ?? [])
const conclusion = computed(() => aiStore.agentLoopOutput?.conclusion ?? null)
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
        />

        <article v-if="conclusion" data-testid="agent-conclusion-card" class="agent-conclusion">
          <div class="agent-conclusion__header">
            <strong>分析结论</strong>
            <span class="agent-conclusion__badge">{{ aiStore.agentLoopOutput?.totalIterations ?? 0 }} 轮分析</span>
          </div>
          <p class="agent-conclusion__summary">{{ conclusion.summary }}</p>
          <div v-if="conclusion.findings.length" class="agent-conclusion__section">
            <strong>关键发现</strong>
            <ul>
              <li v-for="(f, i) in conclusion.findings" :key="i">{{ f }}</li>
            </ul>
          </div>
          <div v-if="conclusion.recommendations.length" class="agent-conclusion__section">
            <strong>建议</strong>
            <ul>
              <li v-for="(r, i) in conclusion.recommendations" :key="i">{{ r }}</li>
            </ul>
          </div>
          <div v-if="conclusion.caveats.length" class="agent-conclusion__section agent-conclusion__section--warn">
            <strong>注意事项</strong>
            <ul>
              <li v-for="(c, i) in conclusion.caveats" :key="i">{{ c }}</li>
            </ul>
          </div>
        </article>
      </div>

      <div v-if="hasToolRail" class="agent-workspace__rail">
        <AgentToolCallList :items="toolCalls" />
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

/* 分析结论卡片 */
.agent-conclusion {
  border-radius: 18px;
  border: 1px solid #dbe4ef;
  background: #ffffff;
  padding: 20px;
  color: #1e293b;
  margin-top: 12px;
  box-shadow: 0 20px 34px -32px rgba(15, 23, 42, 0.24);
}

.agent-conclusion__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.agent-conclusion__header strong {
  font-size: 14px;
  color: #0f172a;
}

.agent-conclusion__badge {
  border-radius: 999px;
  background: #eef4ff;
  color: #2563eb;
  padding: 4px 10px;
  font-size: 11px;
  font-weight: 700;
}

.agent-conclusion__summary {
  font-size: 13px;
  line-height: 1.7;
  margin: 0 0 14px;
  color: #334155;
}

.agent-conclusion__section {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid #e2e8f0;
}

.agent-conclusion__section strong {
  display: block;
  font-size: 12px;
  color: #94a3b8;
  margin-bottom: 6px;
}

.agent-conclusion__section ul {
  margin: 0;
  padding-left: 18px;
  font-size: 12px;
  line-height: 1.7;
  color: #475569;
}

.agent-conclusion__section--warn strong {
  color: #fbbf24;
}
</style>
