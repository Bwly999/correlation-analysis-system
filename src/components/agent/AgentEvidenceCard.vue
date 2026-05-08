<script setup lang="ts">
import { FileCheck2 } from 'lucide-vue-next'
import type { AgentConversationEntry } from '@/ai/types'

defineProps<{
  message: AgentConversationEntry
}>()
</script>

<template>
  <article class="agent-evidence-card">
    <div class="agent-evidence-card__header">
      <span class="agent-evidence-card__icon">
        <FileCheck2 :size="15" />
      </span>
      <div>
        <strong>{{ message.title }}</strong>
        <p>已绑定执行证据</p>
      </div>
    </div>
    <p class="agent-evidence-card__statement">{{ message.content }}</p>
    <ul v-if="message.details?.length" class="agent-evidence-card__details">
      <li v-for="detail in message.details" :key="detail">{{ detail }}</li>
    </ul>
  </article>
</template>

<style scoped>
.agent-evidence-card {
  border-radius: 8px;
  border: 1px solid #bfdbfe;
  background: #f8fbff;
  padding: 14px 16px;
}

.agent-evidence-card__header {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.agent-evidence-card__icon {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: #eff6ff;
  color: #2563eb;
}

.agent-evidence-card__header strong {
  display: block;
  color: #0f172a;
  font-size: 13px;
}

.agent-evidence-card__header p,
.agent-evidence-card__statement,
.agent-evidence-card__details {
  margin: 0;
  font-size: 12px;
  line-height: 1.6;
}

.agent-evidence-card__header p {
  color: #64748b;
}

.agent-evidence-card__statement {
  margin-top: 10px;
  color: #1e293b;
}

.agent-evidence-card__details {
  margin-top: 10px;
  padding-left: 16px;
  color: #475569;
}
</style>
