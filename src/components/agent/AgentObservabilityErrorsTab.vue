<script setup lang="ts">
import type { AgentObservabilityDebugReplayResponse, AgentObservabilityDebugTraceResponse } from '@/ai/types'

defineProps<{
  trace: AgentObservabilityDebugTraceResponse | null
  replay: AgentObservabilityDebugReplayResponse | null
}>()
</script>

<template>
  <section class="agent-observability-tab">
    <div v-if="replay?.state.latestError" class="agent-observability-item agent-observability-item--error">
      <strong>最近错误</strong>
      <span>{{ replay.state.latestError.summary }}</span>
    </div>
    <div
      v-for="failure in trace?.parseFailures ?? []"
      :key="`${failure.timestamp}-${failure.reason}`"
      class="agent-observability-item"
    >
      <strong>解析失败</strong>
      <span>{{ failure.reason }}</span>
    </div>
    <div v-if="!replay?.state.latestError && !(trace?.parseFailures?.length)" class="agent-observability-empty">
      当前没有错误记录
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

.agent-observability-item--error {
  border-color: #fecaca;
  background: #fff1f2;
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
