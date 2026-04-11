<script setup lang="ts">
import { computed } from 'vue'
import { Hammer, CircleCheck, CircleDashed, CircleAlert } from 'lucide-vue-next'
import type { AnalysisAgentToolCall } from '@/ai/types'

const props = defineProps<{
  items: AnalysisAgentToolCall[]
}>()

const iconMap = computed(() => ({
  success: CircleCheck,
  running: CircleDashed,
  failed: CircleAlert,
}))

const formatDuration = (item: AnalysisAgentToolCall) => {
  if (!item.startedAt || !item.finishedAt) return ''
  const durationMs = Math.max(item.finishedAt - item.startedAt, 0)
  if (durationMs < 1000) return `${durationMs}ms`
  return `${(durationMs / 1000).toFixed(1)}s`
}
</script>

<template>
  <div data-testid="agent-workspace-tools" class="agent-tool-call-list">
    <article v-for="item in props.items" :key="item.id" class="agent-tool-call-list__card">
      <div class="agent-tool-call-list__header">
        <span class="agent-tool-call-list__badge">
          <Hammer :size="14" />
        </span>
        <div class="agent-tool-call-list__meta">
          <strong>{{ item.displayName }}</strong>
          <span>{{ item.toolName }}</span>
        </div>
        <span class="agent-tool-call-list__status" :class="`is-${item.status}`">
          <component :is="iconMap[item.status]" :size="14" />
          <span>
            {{ item.status === 'success' ? '成功' : item.status === 'failed' ? '失败' : '执行中' }}
            {{ formatDuration(item) ? `· ${formatDuration(item)}` : '' }}
          </span>
        </span>
      </div>
      <div class="agent-tool-call-list__body">
        <p v-if="item.inputSummary"><strong>输入</strong>{{ item.inputSummary }}</p>
        <p v-if="item.outputSummary || item.summary"><strong>输出</strong>{{ item.outputSummary || item.summary }}</p>
        <p v-if="!item.inputSummary && !item.outputSummary && !item.summary">已记录工具执行。</p>
      </div>
    </article>
  </div>
</template>

<style scoped>
.agent-tool-call-list {
  display: grid;
  gap: 10px;
}

.agent-tool-call-list__card {
  border-radius: 16px;
  border: 1px solid #dbe4ef;
  background: #f8fbff;
  padding: 14px;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.72);
}

.agent-tool-call-list__header {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 10px;
  align-items: center;
  margin-bottom: 8px;
}

.agent-tool-call-list__badge {
  width: 28px;
  height: 28px;
  border-radius: 10px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: #edf4ff;
  color: #1d4ed8;
}

.agent-tool-call-list__meta {
  display: grid;
  gap: 2px;
}

.agent-tool-call-list__meta strong {
  color: #0f172a;
  font-size: 12px;
  font-family: "Consolas", "SFMono-Regular", "Liberation Mono", monospace;
}

.agent-tool-call-list__meta span {
  color: #64748b;
  font-size: 11px;
}

.agent-tool-call-list__body {
  display: grid;
  gap: 6px;
}

.agent-tool-call-list__body p {
  margin: 0;
  color: #334155;
  font-size: 12px;
  line-height: 1.7;
  font-family: "Consolas", "SFMono-Regular", "Liberation Mono", monospace;
}

.agent-tool-call-list__body strong {
  margin-right: 8px;
  color: #64748b;
  font-size: 11px;
  font-family: "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
}

.agent-tool-call-list__status {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  font-weight: 700;
}

.is-success {
  color: #166534;
}

.is-running {
  color: #1d4ed8;
}

.is-failed {
  color: #b91c1c;
}
</style>
