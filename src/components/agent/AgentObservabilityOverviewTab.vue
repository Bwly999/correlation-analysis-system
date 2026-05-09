<script setup lang="ts">
import type {
  AgentObservabilityDebugFilesResponse,
  AgentObservabilityDebugHealth,
  AgentObservabilityDebugTraceResponse,
} from '@/ai/types'

defineProps<{
  trace: AgentObservabilityDebugTraceResponse | null
  files: AgentObservabilityDebugFilesResponse | null
  health: AgentObservabilityDebugHealth | null
}>()
</script>

<template>
  <section class="agent-observability-tab">
    <div class="agent-observability-kv">
      <strong>当前会话</strong>
      <span>{{ trace?.sessionId || '未选择' }}</span>
    </div>
    <div class="agent-observability-kv">
      <strong>事件总数</strong>
      <span>{{ trace?.eventCount ?? 0 }}</span>
    </div>
    <div class="agent-observability-kv">
      <strong>最新状态</strong>
      <span>{{ trace?.latestStatus || '未知' }}</span>
    </div>
    <div class="agent-observability-kv">
      <strong>日志目录</strong>
      <span>{{ files?.rootDir || health?.logRootDir || '未生成' }}</span>
    </div>
  </section>
</template>

<style scoped>
.agent-observability-tab {
  display: grid;
  gap: 10px;
}

.agent-observability-kv {
  display: grid;
  gap: 4px;
  padding: 12px;
  border-radius: 14px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
}

.agent-observability-kv strong {
  color: #0f172a;
  font-size: 12px;
}

.agent-observability-kv span {
  color: #475569;
  font-size: 12px;
  word-break: break-all;
}
</style>
