<script setup lang="ts">
/**
 * Pi Agent 思考块 - 可折叠的思考过程展示
 */
defineProps<{
  thinking: string
}>()

import { ref } from 'vue'

const expanded = ref(false)
</script>

<template>
  <div v-if="thinking" class="pi-agent-thinking">
    <button
      class="thinking-toggle"
      @click="expanded = !expanded"
    >
      <span class="thinking-icon">💭</span>
      <span class="thinking-label">思考过程</span>
      <span class="thinking-arrow" :class="{ expanded }">▶</span>
    </button>
    <div v-if="expanded" class="thinking-content">
      {{ thinking }}
    </div>
  </div>
</template>

<style scoped>
.pi-agent-thinking {
  margin: 4px 0;
  border-radius: 6px;
  background: var(--p-surface-50, #f8fafc);
  border: 1px solid var(--p-surface-200, #e2e8f0);
  overflow: hidden;
}

.thinking-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 6px 10px;
  background: none;
  border: none;
  cursor: pointer;
  font-size: 12px;
  color: var(--p-surface-500, #64748b);
  text-align: left;
}

.thinking-toggle:hover {
  background: var(--p-surface-100, #f1f5f9);
}

.thinking-icon {
  font-size: 14px;
}

.thinking-label {
  flex: 1;
}

.thinking-arrow {
  transition: transform 0.2s;
  font-size: 10px;
}

.thinking-arrow.expanded {
  transform: rotate(90deg);
}

.thinking-content {
  padding: 8px 10px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--p-surface-600, #475569);
  white-space: pre-wrap;
  border-top: 1px solid var(--p-surface-200, #e2e8f0);
  max-height: 200px;
  overflow-y: auto;
}
</style>
