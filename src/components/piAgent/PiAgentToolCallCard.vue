<script setup lang="ts">
/**
 * Pi Agent 工具调用卡片
 */
import { ref } from 'vue'
import type { PiAgentToolCall } from '../../stores/piAgentStore'

defineProps<{
  toolCall: PiAgentToolCall
}>()

const expanded = ref(false)
</script>

<template>
  <div class="pi-agent-tool-card" :class="[`status-${toolCall.status}`]">
    <button class="tool-header" @click="expanded = !expanded">
      <span class="tool-status-dot" />
      <span class="tool-name">{{ toolCall.displayName }}</span>
      <span v-if="toolCall.status === 'running'" class="tool-spinner">⏳</span>
      <span v-else-if="toolCall.status === 'success'" class="tool-check">✓</span>
      <span v-else-if="toolCall.status === 'failed'" class="tool-error">✗</span>
      <span class="tool-arrow" :class="{ expanded }">▶</span>
    </button>
    <div v-if="expanded" class="tool-details">
      <div v-if="toolCall.args" class="tool-section">
        <div class="tool-section-label">参数</div>
        <pre class="tool-json">{{ JSON.stringify(toolCall.args, null, 2) }}</pre>
      </div>
      <div v-if="toolCall.result" class="tool-section">
        <div class="tool-section-label">结果</div>
        <pre class="tool-json" :class="{ error: toolCall.isError }">{{ toolCall.result }}</pre>
      </div>
    </div>
  </div>
</template>

<style scoped>
.pi-agent-tool-card {
  margin: 4px 0;
  border-radius: 6px;
  border: 1px solid var(--p-surface-200, #e2e8f0);
  overflow: hidden;
  font-size: 12px;
}

.tool-header {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 6px 10px;
  background: var(--p-surface-50, #f8fafc);
  border: none;
  cursor: pointer;
  text-align: left;
  color: var(--p-surface-700, #334155);
}

.tool-header:hover {
  background: var(--p-surface-100, #f1f5f9);
}

.tool-status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}

.status-running .tool-status-dot {
  background: #f59e0b;
  animation: pulse 1s infinite;
}

.status-success .tool-status-dot {
  background: #10b981;
}

.status-failed .tool-status-dot {
  background: #ef4444;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

.tool-name {
  flex: 1;
  font-weight: 500;
}

.tool-spinner {
  font-size: 12px;
}

.tool-check {
  color: #10b981;
  font-weight: bold;
}

.tool-error {
  color: #ef4444;
  font-weight: bold;
}

.tool-arrow {
  transition: transform 0.2s;
  font-size: 10px;
  color: var(--p-surface-400);
}

.tool-arrow.expanded {
  transform: rotate(90deg);
}

.tool-details {
  border-top: 1px solid var(--p-surface-200, #e2e8f0);
  padding: 8px 10px;
}

.tool-section {
  margin-bottom: 6px;
}

.tool-section:last-child {
  margin-bottom: 0;
}

.tool-section-label {
  font-size: 11px;
  color: var(--p-surface-500, #64748b);
  margin-bottom: 2px;
  font-weight: 500;
}

.tool-json {
  margin: 0;
  padding: 6px 8px;
  background: var(--p-surface-50, #f8fafc);
  border-radius: 4px;
  font-size: 11px;
  line-height: 1.4;
  overflow-x: auto;
  max-height: 150px;
  overflow-y: auto;
  white-space: pre-wrap;
  word-break: break-all;
}

.tool-json.error {
  background: #fef2f2;
  color: #dc2626;
}
</style>
