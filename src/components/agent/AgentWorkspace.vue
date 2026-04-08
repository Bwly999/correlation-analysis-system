<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useWorkflowAiStore } from '@/stores/workflowAiStore'
import AgentComposer from './AgentComposer.vue'
import AgentHeader from './AgentHeader.vue'
import AgentMessageList from './AgentMessageList.vue'
import AgentTimeline from './AgentTimeline.vue'
import AgentToolCallList from './AgentToolCallList.vue'

const props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  focusReport: []
}>()

const aiStore = useWorkflowAiStore()

const session = computed(() => aiStore.analysisAgentSession)
const timeline = computed(() => aiStore.agentTimeline)
const toolCalls = computed(() => aiStore.agentToolCalls)
const messages = computed(() => aiStore.agentMessages)
const artifacts = computed(() => session.value?.artifacts ?? [])
const approvalRequests = computed(() => session.value?.approvalRequests ?? [])

const handleSubmit = async (value: string) => {
  aiStore.prompt = value
}

const handleClear = () => {
  aiStore.resetPlan()
}

const handleNewSession = () => {
  aiStore.resetPlan()
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

    <div class="agent-workspace__body">
      <div class="agent-workspace__main">
        <AgentMessageList
          :messages="messages"
          :tool-calls="toolCalls"
          :artifacts="artifacts"
          :approval-requests="approvalRequests"
        />
      </div>

      <div class="agent-workspace__rail">
        <AgentTimeline :items="timeline" @select="() => undefined" />
        <AgentToolCallList :items="toolCalls" />
      </div>
    </div>

    <AgentComposer
      :prompt="aiStore.prompt"
      :approval-requests="approvalRequests"
      :disabled="aiStore.isGenerating"
      @submit="handleSubmit"
      @update-prompt="aiStore.prompt = $event"
    />
  </aside>
</template>

<style scoped>
.agent-workspace {
  height: 100%;
  display: grid;
  grid-template-rows: auto 1fr auto;
  background:
    radial-gradient(120% 120% at 100% 0%, rgba(37, 99, 235, 0.08) 0%, rgba(255, 255, 255, 0) 48%),
    linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
  border-right: 1px solid #dbe4ef;
  min-width: 0;
}

.agent-workspace.is-hidden {
  display: none;
}

.agent-workspace__body {
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 280px;
  gap: 0;
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
