<script setup lang="ts">
import { ScrollText } from 'lucide-vue-next'
import type { AgentConversationEntry } from '@/ai/types'

defineProps<{
  message: AgentConversationEntry
}>()
</script>

<template>
  <article class="agent-report-card">
    <div class="agent-report-card__header">
      <span class="agent-report-card__icon">
        <ScrollText :size="15" />
      </span>
      <div>
        <strong>{{ message.title }}</strong>
        <p>分析报告摘要</p>
      </div>
    </div>
    <p class="agent-report-card__summary">{{ message.content }}</p>
    <ul v-if="message.details?.length" class="agent-report-card__details">
      <li v-for="detail in message.details" :key="detail">{{ detail }}</li>
    </ul>
  </article>
</template>

<style scoped>
.agent-report-card {
  border-radius: 8px;
  border: 1px solid #cbd5e1;
  background: #ffffff;
  padding: 15px 16px;
  box-shadow: 0 6px 14px rgba(15, 23, 42, 0.06);
}

.agent-report-card__header {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.agent-report-card__icon {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: #f1f5f9;
  color: #0f172a;
}

.agent-report-card__header strong {
  display: block;
  color: #0f172a;
  font-size: 13px;
}

.agent-report-card__header p,
.agent-report-card__summary,
.agent-report-card__details {
  margin: 0;
  font-size: 12px;
  line-height: 1.6;
}

.agent-report-card__header p {
  color: #64748b;
}

.agent-report-card__summary {
  margin-top: 10px;
  color: #1e293b;
}

.agent-report-card__details {
  margin-top: 10px;
  padding-left: 16px;
  color: #475569;
}
</style>
