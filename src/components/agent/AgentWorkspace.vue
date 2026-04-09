<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useWorkflowAiStore } from '@/stores/workflowAiStore'
import { useWorkflowStore } from '@/stores/workflowStore'
import AgentComposer from './AgentComposer.vue'
import AgentHeader from './AgentHeader.vue'
import AgentMessageList from './AgentMessageList.vue'
import AgentTimeline from './AgentTimeline.vue'
import AgentToolCallList from './AgentToolCallList.vue'
import AgentArtifactCard from './AgentArtifactCard.vue'
import { Play, Loader2 } from 'lucide-vue-next'

const props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  focusReport: []
}>()

const aiStore = useWorkflowAiStore()
const workflowStore = useWorkflowStore()

const session = computed(() => aiStore.analysisAgentSession)
const timeline = computed(() => aiStore.agentTimeline)
const toolCalls = computed(() => aiStore.agentToolCalls)
const messages = computed(() => aiStore.agentMessages)
const artifacts = computed(() => session.value?.artifacts ?? [])
const approvalRequests = computed(() => session.value?.approvalRequests ?? [])

const canStartAgentLoop = computed(() =>
  aiStore.plan !== null
  && !aiStore.isGenerating
  && !aiStore.agentLoopRunning
  && aiStore.selectedProfile !== null,
)

const conclusion = computed(() => aiStore.agentLoopOutput?.conclusion ?? null)

const handleSubmit = async (value: string) => {
  aiStore.prompt = value
}

const handleClear = () => {
  aiStore.resetPlan()
}

const handleNewSession = () => {
  aiStore.resetPlan()
}

const handleStartAgentLoop = async () => {
  try {
    await aiStore.startAgentLoop(workflowStore)
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

    <div class="agent-workspace__body">
      <div class="agent-workspace__main">
        <AgentMessageList
          :messages="messages"
          :tool-calls="toolCalls"
          :artifacts="artifacts"
          :approval-requests="approvalRequests"
        />

        <!-- Agent Loop 控制按钮 -->
        <div v-if="canStartAgentLoop || aiStore.agentLoopRunning" class="agent-loop-control">
          <button
            v-if="canStartAgentLoop"
            type="button"
            class="agent-loop-control__btn"
            @click="handleStartAgentLoop"
          >
            <Play :size="14" />
            <span>自动执行并分析</span>
          </button>
          <span v-if="aiStore.agentLoopRunning" class="agent-loop-control__status">
            <Loader2 :size="14" class="agent-loop-control__spin" />
            <span>{{ aiStore.streamHeadline || 'Agent Loop 运行中...' }}</span>
          </span>
        </div>

        <!-- Agent Loop 结论卡片 -->
        <article v-if="conclusion" class="agent-conclusion">
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

      <div class="agent-workspace__rail">
        <AgentTimeline :items="timeline" @select="() => undefined" />
        <AgentToolCallList :items="toolCalls" />
      </div>
    </div>

    <AgentComposer
      :prompt="aiStore.prompt"
      :approval-requests="approvalRequests"
      :disabled="aiStore.isGenerating || aiStore.agentLoopRunning"
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

/* Agent Loop 控制按钮 */
.agent-loop-control {
  padding: 12px 0;
  display: flex;
  align-items: center;
  gap: 12px;
}

.agent-loop-control__btn {
  height: 36px;
  padding: 0 16px;
  border-radius: 12px;
  border: 1px solid #059669;
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  color: #ffffff;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
  transition: opacity 0.15s;
}

.agent-loop-control__btn:hover {
  opacity: 0.9;
}

.agent-loop-control__status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #475569;
}

.agent-loop-control__spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* 分析结论卡片 */
.agent-conclusion {
  border-radius: 18px;
  border: 1px solid #dbe4ef;
  background: linear-gradient(160deg, #0f172a 0%, #1e293b 100%);
  padding: 20px;
  color: #e2e8f0;
  margin-top: 12px;
}

.agent-conclusion__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.agent-conclusion__header strong {
  font-size: 14px;
  color: #ffffff;
}

.agent-conclusion__badge {
  border-radius: 999px;
  background: rgba(16, 185, 129, 0.18);
  color: #6ee7b7;
  padding: 4px 10px;
  font-size: 11px;
  font-weight: 700;
}

.agent-conclusion__summary {
  font-size: 13px;
  line-height: 1.7;
  margin: 0 0 14px;
  color: #cbd5e1;
}

.agent-conclusion__section {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
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
}

.agent-conclusion__section--warn strong {
  color: #fbbf24;
}
</style>
