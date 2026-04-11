<script setup lang="ts">
import type {
  AnalysisAgentApprovalRequest,
  AnalysisAgentArtifact,
  AnalysisAgentMessage,
  AnalysisAgentToolCall,
} from '@/ai/types'
import AgentThinkingBlock from './AgentThinkingBlock.vue'
import AgentToolCallList from './AgentToolCallList.vue'
import AgentArtifactCard from './AgentArtifactCard.vue'
import AgentApprovalCard from './AgentApprovalCard.vue'

const props = defineProps<{
  messages: AnalysisAgentMessage[]
  toolCalls: AnalysisAgentToolCall[]
  artifacts: AnalysisAgentArtifact[]
  approvalRequests: AnalysisAgentApprovalRequest[]
}>()

const findToolCall = (toolCallId: string) => props.toolCalls.find((item) => item.id === toolCallId)
const findArtifact = (artifactId: string) => props.artifacts.find((item) => item.id === artifactId)
const findApproval = (requestKey: string) => props.approvalRequests.find((item) => item.key === requestKey)
</script>

<template>
  <div data-testid="agent-workspace-messages" class="agent-message-list">
    <article
      v-for="message in messages"
      :key="message.id"
      class="agent-message-list__item"
      :class="`is-${message.role}`"
    >
      <div class="agent-message-list__role">{{ message.role === 'user' ? '你' : '分析代理' }}</div>
      <div class="agent-message-list__blocks">
        <template v-for="(block, blockIndex) in message.blocks" :key="`${message.id}-${block.type}-${blockIndex}`">
          <p v-if="block.type === 'text'" class="agent-message-list__text">{{ block.content }}</p>
          <div v-else-if="block.type === 'stream'" data-testid="agent-workspace-stream" class="agent-message-list__stream">
            {{ block.content }}
          </div>
          <AgentToolCallList
            v-else-if="block.type === 'tool_call' && findToolCall(block.toolCallId)"
            :items="[findToolCall(block.toolCallId)!]"
          />
          <AgentThinkingBlock
            v-else-if="block.type === 'thinking'"
            :title="block.title"
            :summary="block.summary"
            :details="block.details"
            :collapsed="block.collapsed"
          />
          <AgentArtifactCard
            v-else-if="block.type === 'artifact' && findArtifact(block.artifactId)"
            :artifact="findArtifact(block.artifactId)!"
          />
          <AgentApprovalCard
            v-else-if="block.type === 'approval_request' && findApproval(block.requestKey)"
            :request="findApproval(block.requestKey)!"
          />
        </template>
      </div>
    </article>
  </div>
</template>

<style scoped>
.agent-message-list {
  display: grid;
  gap: 16px;
}

.agent-message-list__item {
  display: grid;
  gap: 10px;
}

.agent-message-list__role {
  font-size: 11px;
  font-weight: 800;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.agent-message-list__blocks {
  display: grid;
  gap: 12px;
}

.agent-message-list__text,
.agent-message-list__stream {
  margin: 0;
  border-radius: 18px;
  padding: 14px 16px;
  font-size: 13px;
  line-height: 1.8;
}

.is-user .agent-message-list__text {
  background: #0f172a;
  color: #f8fafc;
  width: fit-content;
  max-width: min(82%, 720px);
  box-shadow: 0 20px 30px -28px rgba(15, 23, 42, 0.78);
}

.is-assistant .agent-message-list__text {
  border: 1px solid #dbe4ef;
  background: #ffffff;
  color: #0f172a;
  box-shadow: 0 18px 30px -28px rgba(15, 23, 42, 0.18);
}

.agent-message-list__stream {
  border: 1px solid #dbe4ef;
  background: #fbfdff;
  color: #1e293b;
  position: relative;
  padding-left: 18px;
  font-family: "Consolas", "SFMono-Regular", "Liberation Mono", monospace;
  font-size: 12px;
}

.agent-message-list__stream::before {
  content: '';
  position: absolute;
  top: 16px;
  left: 8px;
  width: 4px;
  height: calc(100% - 32px);
  min-height: 18px;
  border-radius: 999px;
  background: #2563eb;
}
</style>
