<script setup lang="ts">
import { FileText, Sparkles } from 'lucide-vue-next'
import type { AnalysisAgentArtifact } from '@/ai/types'

defineProps<{
  artifact: AnalysisAgentArtifact
}>()
</script>

<template>
  <article class="agent-artifact-card">
    <div class="agent-artifact-card__header">
      <span class="agent-artifact-card__icon">
        <Sparkles v-if="artifact.type === 'conclusion_card'" :size="14" />
        <FileText v-else :size="14" />
      </span>
      <strong>{{ artifact.title }}</strong>
    </div>
    <p>{{ artifact.summary }}</p>
    <ul v-if="artifact.bullets?.length">
      <li v-for="bullet in artifact.bullets" :key="bullet">{{ bullet }}</li>
    </ul>
  </article>
</template>

<style scoped>
.agent-artifact-card {
  border-radius: 18px;
  border: 1px solid #dbe4ef;
  background: linear-gradient(160deg, #0f172a 0%, #1e293b 100%);
  padding: 16px;
  color: #e2e8f0;
  box-shadow: 0 20px 40px -28px rgba(15, 23, 42, 0.72);
}

.agent-artifact-card__header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}

.agent-artifact-card__header strong {
  font-size: 13px;
}

.agent-artifact-card__icon {
  width: 26px;
  height: 26px;
  border-radius: 9px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: rgba(37, 99, 235, 0.18);
  color: #93c5fd;
}

.agent-artifact-card p,
.agent-artifact-card ul {
  margin: 0;
  font-size: 12px;
  line-height: 1.7;
}

.agent-artifact-card ul {
  margin-top: 10px;
  padding-left: 18px;
}
</style>
