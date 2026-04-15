<script setup lang="ts">
import type { AgentConversationEntry } from '@/ai/types'

const props = defineProps<{
  messages: AgentConversationEntry[]
}>()

const isBusinessCard = (kind: AgentConversationEntry['kind']) =>
  kind === 'workflow_projection'
  || kind === 'analysis_projection'
  || kind === 'execution_projection'
  || kind === 'canvas_sync'
  || kind === 'debug'
</script>

<template>
  <div data-testid="agent-workspace-messages" class="agent-message-list">
    <article
      v-for="message in props.messages"
      :key="message.id"
      class="agent-message-list__item"
      :class="`is-${message.kind}`"
    >
      <div v-if="message.kind === 'user' || message.kind === 'assistant'" class="agent-message-list__role">
        {{ message.kind === 'user' ? '你' : '分析代理' }}
      </div>

      <div
        class="agent-message-list__content"
        :class="{
          'is-business-card': isBusinessCard(message.kind),
          'is-streaming': message.status === 'streaming',
          'is-failed': message.status === 'failed',
        }"
      >
        <p class="agent-message-list__title">{{ message.title }}</p>
        <p class="agent-message-list__text">{{ message.content }}</p>
        <ul v-if="message.details?.length" class="agent-message-list__details">
          <li v-for="detail in message.details" :key="detail">{{ detail }}</li>
        </ul>
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

.agent-message-list__content {
  display: grid;
  gap: 8px;
  border-radius: 20px;
  border: 1px solid #dbe4ef;
  background: #ffffff;
  padding: 14px 16px;
  box-shadow: 0 18px 30px -28px rgba(15, 23, 42, 0.18);
}

.agent-message-list__content.is-business-card {
  background: linear-gradient(180deg, #fbfdff 0%, #ffffff 100%);
}

.agent-message-list__content.is-streaming {
  border-color: #93c5fd;
  background: #f8fbff;
}

.agent-message-list__content.is-failed {
  border-color: #fecaca;
  background: #fef2f2;
}

.is-user .agent-message-list__content {
  width: fit-content;
  max-width: min(82%, 720px);
  background: #0f172a;
  border-color: #0f172a;
  color: #f8fafc;
  box-shadow: 0 20px 30px -28px rgba(15, 23, 42, 0.78);
}

.agent-message-list__title {
  margin: 0;
  font-size: 11px;
  font-weight: 800;
  color: #2563eb;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.is-user .agent-message-list__title {
  color: #bfdbfe;
}

.agent-message-list__text {
  margin: 0;
  color: #0f172a;
  font-size: 13px;
  line-height: 1.7;
}

.is-user .agent-message-list__text {
  color: #f8fafc;
}

.agent-message-list__details {
  margin: 0;
  padding-left: 18px;
  color: #64748b;
  font-size: 12px;
  line-height: 1.6;
  display: grid;
  gap: 4px;
}

.is-user .agent-message-list__details {
  color: #dbeafe;
}
</style>
