<script setup lang="ts">
import type { AgentObservabilityDebugReplayResponse, AgentObservabilityDebugTraceResponse } from '@/ai/types'

defineProps<{
  trace: AgentObservabilityDebugTraceResponse | null
  replay: AgentObservabilityDebugReplayResponse | null
}>()
</script>

<template>
  <section class="agent-observability-tab">
    <div
      v-for="toolCall in replay?.state.latestToolCalls ?? []"
      :key="toolCall.id"
      class="agent-observability-item"
    >
      <strong>{{ toolCall.displayName }}</strong>
      <span>{{ toolCall.summary || toolCall.outputSummary || toolCall.inputSummary || toolCall.toolName }}</span>
    </div>
    <div v-if="!(replay?.state.latestToolCalls?.length)" class="agent-observability-empty">
      当前没有工具调用
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
}
</style>
