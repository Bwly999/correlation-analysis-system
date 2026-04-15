<script setup lang="ts">
import type { AgentConversationEntry } from '@/ai/types'
import AgentThinkingBlock from './AgentThinkingBlock.vue'

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

        <AgentThinkingBlock
          v-if="message.details?.length"
          title="执行细节"
          :summary="message.status === 'streaming' ? '正在处理...' : '处理完成'"
          :details="message.details"
          :collapsed="message.status !== 'streaming'"
        />
      </div>
    </article>
  </div>
</template>

<style scoped>
.agent-message-list {
  display: flex;
  flex-direction: column;
  gap: 28px;
}

.agent-message-list__item {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-width: 92%;
}

.agent-message-list__item.is-user {
  align-self: flex-end;
  max-width: 82%;
}

.agent-message-list__role {
  font-size: 11px;
  font-weight: 700;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  padding-left: 4px;
}

.is-user .agent-message-list__role {
  text-align: right;
  padding-left: 0;
  padding-right: 4px;
}

.agent-message-list__content {
  display: flex;
  flex-direction: column;
  gap: 10px;
  border-radius: 20px;
  border: 1px solid #e2e8f0;
  background: #ffffff;
  padding: 16px 20px;
  box-shadow: 
    0 4px 6px -1px rgba(0, 0, 0, 0.05),
    0 2px 4px -2px rgba(0, 0, 0, 0.05);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
}

.agent-message-list__content.is-business-card {
  background: linear-gradient(135deg, #f8fafc 0%, #ffffff 100%);
  border-color: #cbd5e1;
}

.agent-message-list__content.is-streaming {
  border-color: #3b82f6;
  background: #f0f7ff;
  animation: agent-pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}

@keyframes agent-pulse {
  0%, 100% {
    box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.1);
  }
  50% {
    box-shadow: 0 0 0 6px rgba(59, 130, 246, 0.05);
  }
}

.agent-message-list__content.is-streaming .agent-message-list__text::after {
  content: '▋';
  display: inline-block;
  margin-left: 4px;
  vertical-align: baseline;
  animation: agent-blink 1s step-start infinite;
  color: #2563eb;
}

@keyframes agent-blink {
  50% { opacity: 0; }
}

.agent-message-list__content.is-failed {
  border-color: #fecaca;
  background: #fffafb;
  box-shadow: 0 4px 6px -1px rgba(220, 38, 38, 0.05);
}

.is-user .agent-message-list__content {
  background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
  border-color: #1e293b;
  color: #f8fafc;
  border-bottom-right-radius: 4px;
  box-shadow: 
    0 10px 15px -3px rgba(15, 23, 42, 0.2),
    0 4px 6px -4px rgba(15, 23, 42, 0.2);
}

.agent-message-list__title {
  margin: 0;
  font-size: 11px;
  font-weight: 800;
  color: #3b82f6;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.is-user .agent-message-list__title {
  color: #93c5fd;
}

.agent-message-list__text {
  margin: 0;
  color: #1e293b;
  font-size: 14px;
  line-height: 1.6;
  font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
}

.is-user .agent-message-list__text {
  color: #f1f5f9;
}

.is-user .agent-message-list__content.is-streaming .agent-message-list__text::after {
  color: #93c5fd;
}
</style>
