<script setup lang="ts">
import { computed } from 'vue'
import type { AnalysisAgentTimelineStep } from '@/ai/types'

const props = defineProps<{
  stepIds: string[]
  timeline: AnalysisAgentTimelineStep[]
}>()

const steps = computed(() =>
  props.stepIds
    .map((id) => props.timeline.find((item) => item.id === id))
    .filter((item): item is AnalysisAgentTimelineStep => Boolean(item)),
)

const currentStep = computed(() =>
  steps.value.find((item) => item.status === 'running' || item.status === 'waiting' || item.status === 'failed') ?? null,
)
</script>

<template>
  <section data-testid="agent-step-group" class="agent-step-group">
    <div class="agent-step-group__track">
      <div
        v-for="step in steps"
        :key="step.id"
        class="agent-step-group__step"
        :class="`is-${step.status}`"
      >
        <span class="agent-step-group__dot" />
        <span class="agent-step-group__label">{{ step.title }}</span>
      </div>
    </div>
    <p v-if="currentStep?.description" class="agent-step-group__summary">{{ currentStep.description }}</p>
  </section>
</template>

<style scoped>
.agent-step-group {
  border: 1px solid #dbe4ef;
  border-radius: 16px;
  background: #fcfdff;
  padding: 14px 16px;
  display: grid;
  gap: 10px;
}

.agent-step-group__track {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 14px;
}

.agent-step-group__step {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: #94a3b8;
  font-size: 11px;
  font-weight: 700;
}

.agent-step-group__step:not(:last-child)::after {
  content: '';
  width: 18px;
  height: 1px;
  background: #cbd5e1;
  margin-left: 4px;
}

.agent-step-group__dot {
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: currentColor;
  box-shadow: 0 0 0 4px rgba(148, 163, 184, 0.12);
}

.agent-step-group__step.is-completed {
  color: #0f766e;
}

.agent-step-group__step.is-running {
  color: #2563eb;
}

.agent-step-group__step.is-waiting {
  color: #ca8a04;
}

.agent-step-group__step.is-failed {
  color: #b91c1c;
}

.agent-step-group__summary {
  margin: 0;
  color: #475569;
  font-size: 12px;
  line-height: 1.6;
}
</style>
