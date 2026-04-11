<script setup lang="ts">
import { computed } from 'vue'
import { FileText, Sparkles } from 'lucide-vue-next'
import type { AnalysisAgentArtifact } from '@/ai/types'

const props = defineProps<{
  artifact: AnalysisAgentArtifact
}>()

const typeLabel = computed(() => {
  if (props.artifact.type === 'conclusion_card') return '系统结论'
  if (props.artifact.type === 'workflow_summary') return '工作流计划'
  return '系统卡片'
})
</script>

<template>
  <article class="agent-artifact-card" :class="`is-${artifact.type}`">
    <div class="agent-artifact-card__header">
      <div class="agent-artifact-card__title">
        <span class="agent-artifact-card__icon">
          <Sparkles v-if="artifact.type === 'conclusion_card'" :size="14" />
          <FileText v-else :size="14" />
        </span>
        <strong>{{ artifact.title }}</strong>
      </div>
      <span class="agent-artifact-card__tag">{{ typeLabel }}</span>
    </div>
    <p>{{ artifact.summary }}</p>
    <ul v-if="artifact.bullets?.length">
      <li v-for="bullet in artifact.bullets" :key="bullet">{{ bullet }}</li>
    </ul>
  </article>
</template>

<style scoped>
.agent-artifact-card {
  position: relative;
  border-radius: 18px;
  border: 1px solid #dbe4ef;
  background: #fbfdff;
  padding: 16px;
  color: #1e293b;
  box-shadow: 0 18px 30px -30px rgba(15, 23, 42, 0.24);
}

.agent-artifact-card::before {
  content: '';
  position: absolute;
  inset: 0 auto 0 0;
  width: 4px;
  border-radius: 18px 0 0 18px;
  background: #bfd2f3;
}

.agent-artifact-card.is-conclusion_card::before {
  background: #7dd3fc;
}

.agent-artifact-card.is-workflow_summary::before {
  background: #86efac;
}

.agent-artifact-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}

.agent-artifact-card__title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.agent-artifact-card__header strong {
  font-size: 13px;
  color: #0f172a;
}

.agent-artifact-card__icon {
  width: 26px;
  height: 26px;
  border-radius: 9px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: #eef4ff;
  color: #2563eb;
}

.agent-artifact-card__tag {
  border-radius: 999px;
  background: #eef4ff;
  color: #2563eb;
  padding: 4px 8px;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.04em;
}

.agent-artifact-card p,
.agent-artifact-card ul {
  margin: 0;
  font-size: 12px;
  line-height: 1.7;
}

.agent-artifact-card p {
  color: #334155;
}

.agent-artifact-card ul {
  margin-top: 10px;
  padding-left: 18px;
  color: #475569;
}
</style>
