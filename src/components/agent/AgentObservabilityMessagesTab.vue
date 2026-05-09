<script setup lang="ts">
import type { AgentObservabilityDebugTraceResponse } from '@/ai/types'

defineProps<{
  trace: AgentObservabilityDebugTraceResponse | null
}>()
</script>

<template>
  <section class="agent-observability-tab">
    <div
      v-for="message in trace?.rawMessages ?? []"
      :key="message.messageId"
      class="agent-observability-item"
    >
      <strong>{{ message.role }} · {{ message.messageId }}</strong>
      <span>{{ message.text || '无纯文本消息体' }}</span>
    </div>
    <div v-if="!(trace?.rawMessages?.length)" class="agent-observability-empty">
      当前没有原始消息
    </div>
  </section>
</template>

<style scoped>
.agent-observability-tab {
  display: grid;
  gap: 8px;
}

.agent-observability-item,
.agent-observability-empty {
  display: grid;
  gap: 4px;
  padding: 12px;
  border-radius: 14px;
  border: 1px solid #e2e8f0;
  background: #fff;
}

.agent-observability-item strong {
  color: #0f172a;
  font-size: 12px;
}

.agent-observability-item span,
.agent-observability-empty {
  color: #475569;
  font-size: 12px;
  white-space: pre-wrap;
}
</style>
