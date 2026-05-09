<script setup lang="ts">
import type { AgentObservabilityDebugReplayResponse, AgentObservabilityDebugTraceResponse } from '@/ai/types'

defineProps<{
  trace: AgentObservabilityDebugTraceResponse | null
  replay: AgentObservabilityDebugReplayResponse | null
}>()
</script>

<template>
  <section class="agent-observability-tab">
    <div class="agent-observability-item">
      <strong>当前投影快照</strong>
      <span>{{ replay?.state.latestProjection?.execution.latestAction || '暂无投影回放状态' }}</span>
    </div>
    <div
      v-for="snapshot in trace?.projectionSnapshots ?? []"
      :key="snapshot.seq"
      class="agent-observability-item"
    >
      <strong>#{{ snapshot.seq }} · {{ snapshot.changedDomains.join(' / ') }}</strong>
      <span>{{ snapshot.snapshot.execution.latestAction }}</span>
    </div>
  </section>
</template>

<style scoped>
.agent-observability-tab {
  display: grid;
  gap: 8px;
}

.agent-observability-item {
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

.agent-observability-item span {
  color: #475569;
  font-size: 12px;
}
</style>
