<script setup lang="ts">
import { CircleCheck, CircleDashed, CirclePause, CircleAlert, Circle } from 'lucide-vue-next'
import type { AnalysisAgentTimelineStep } from '@/ai/types'

defineProps<{
  items: AnalysisAgentTimelineStep[]
}>()

const emit = defineEmits<{
  select: [stepId: string]
}>()

const getIcon = (status: AnalysisAgentTimelineStep['status']) => {
  if (status === 'completed') return CircleCheck
  if (status === 'running') return CircleDashed
  if (status === 'waiting') return CirclePause
  if (status === 'failed') return CircleAlert
  return Circle
}
</script>

<template>
  <section data-testid="agent-workspace-timeline" class="agent-timeline">
    <header class="agent-timeline__header">
      <strong>执行阶段</strong>
      <span>透明展示当前分析进度</span>
    </header>
    <button
      v-for="item in items"
      :key="item.id"
      type="button"
      class="agent-timeline__item"
      :class="`is-${item.status}`"
      @click="emit('select', item.id)"
    >
      <span class="agent-timeline__icon">
        <component :is="getIcon(item.status)" :size="14" />
      </span>
      <span class="agent-timeline__content">
        <strong>{{ item.title }}</strong>
        <span>{{ item.description || '等待进入该阶段' }}</span>
      </span>
    </button>
  </section>
</template>

<style scoped>
.agent-timeline {
  display: grid;
  gap: 10px;
}

.agent-timeline__header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
}

.agent-timeline__header strong {
  color: #0f172a;
  font-size: 12px;
}

.agent-timeline__header span {
  color: #64748b;
  font-size: 11px;
}

.agent-timeline__item {
  width: 100%;
  border: 1px solid #dbe4ef;
  border-radius: 16px;
  background: #ffffff;
  padding: 12px 14px;
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 10px;
  text-align: left;
  cursor: pointer;
  transition: all 0.2s ease;
}

.agent-timeline__item:hover {
  border-color: #93c5fd;
  background: #f8fbff;
}

.agent-timeline__icon {
  width: 26px;
  height: 26px;
  border-radius: 10px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: #f8fafc;
}

.agent-timeline__content {
  display: grid;
  gap: 3px;
}

.agent-timeline__content strong {
  color: #0f172a;
  font-size: 12px;
}

.agent-timeline__content span {
  color: #64748b;
  font-size: 11px;
  line-height: 1.5;
}

.is-running {
  border-color: #bfdbfe;
  background: #eff6ff;
}

.is-running .agent-timeline__icon :deep(svg) {
  animation: agent-spin 2s linear infinite;
}

@keyframes agent-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.is-running .agent-timeline__icon,
.is-waiting .agent-timeline__icon {
  color: #2563eb;
}

.is-completed .agent-timeline__icon {
  color: #16a34a;
}

.is-failed .agent-timeline__icon {
  color: #dc2626;
}

.is-waiting {
  border-color: #fde68a;
  background: #fffbea;
}
</style>
