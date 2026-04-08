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
          <span>{{ item.status === 'success' ? '成功' : item.status === 'failed' ? '失败' : '执行中' }}</span>
        </span>
      </div>
      <p>{{ item.summary || item.outputSummary || item.inputSummary || '已记录工具执行。' }}</p>
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
  background: #ffffff;
  padding: 14px;
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
  background: #eff6ff;
  color: #2563eb;
}

.agent-tool-call-list__meta {
  display: grid;
  gap: 2px;
}

.agent-tool-call-list__meta strong {
  color: #0f172a;
  font-size: 12px;
}

.agent-tool-call-list__meta span,
.agent-tool-call-list__card p {
  color: #475569;
  font-size: 12px;
}

.agent-tool-call-list__card p {
  margin: 0;
  line-height: 1.6;
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
