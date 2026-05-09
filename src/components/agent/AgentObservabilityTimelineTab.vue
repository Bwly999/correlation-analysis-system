<script setup lang="ts">
import type { AgentObservabilityDebugTraceResponse } from '@/ai/types'

defineProps<{
  trace: AgentObservabilityDebugTraceResponse | null
}>()

const emit = defineEmits<{
  jumpToSeq: [seq: number]
}>()
</script>

<template>
  <section class="agent-observability-tab">
    <button
      v-for="event in trace?.events ?? []"
      :key="event.seq"
      type="button"
      class="agent-observability-timeline-item"
      @click="emit('jumpToSeq', event.seq)"
    >
      <strong>#{{ event.seq }} · {{ event.kind }}</strong>
      <span>{{ event.summary }}</span>
    </button>
  </section>
</template>

<style scoped>
.agent-observability-tab {
  display: grid;
  gap: 8px;
}

.agent-observability-timeline-item {
  display: grid;
  gap: 4px;
  padding: 12px;
  text-align: left;
  border-radius: 14px;
  border: 1px solid #e2e8f0;
  background: #fff;
  cursor: pointer;
}

.agent-observability-timeline-item strong {
  color: #0f172a;
  font-size: 12px;
}

.agent-observability-timeline-item span {
  color: #475569;
  font-size: 12px;
}
</style>
