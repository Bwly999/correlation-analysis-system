<script setup lang="ts">
import { computed } from 'vue'
import {
  CheckCircle2,
  ChevronRight,
  Circle,
  CircleAlert,
  CircleDotDashed,
  CirclePause,
} from 'lucide-vue-next'
import type { AnalysisAgentTimelineStep } from '@/ai/types'

const props = defineProps<{
  steps: AnalysisAgentTimelineStep[]
  headline: string
  autoApplyStatus: 'idle' | 'applied' | 'failed'
  autoApplyMessage: string
  hasAppliedSnapshot: boolean
}>()

const currentStepId = computed(() => {
  const activeStep = props.steps.find((step) => step.status === 'running' || step.status === 'waiting' || step.status === 'failed')
  if (activeStep) return activeStep.id

  const nextStep = props.steps.find(
    (step, index) => step.status === 'idle' && props.steps.slice(0, index).some((item) => item.status === 'completed'),
  )
  if (nextStep) return nextStep.id

  return [...props.steps].reverse().find((step) => step.status === 'completed')?.id ?? props.steps[0]?.id ?? ''
})

const currentHeadline = computed(() => {
  const headline = props.headline.trim()
  if (!headline || headline === '等待开始' || headline === '先描述你想处理的问题' || headline === '已记录当前消息') {
    return ''
  }
  return headline
})
const showApplyFeedback = computed(() => props.hasAppliedSnapshot || props.autoApplyStatus === 'failed')
const hasMeta = computed(() => Boolean(currentHeadline.value) || showApplyFeedback.value)
const applyFeedback = computed(() => {
  if (props.autoApplyStatus === 'failed') {
    return props.autoApplyMessage || '最终计划已生成，但同步到右侧画布失败。'
  }
  if (props.hasAppliedSnapshot) {
    return props.autoApplyMessage || '已自动同步到右侧画布。'
  }
  return ''
})

const getIcon = (status: AnalysisAgentTimelineStep['status']) => {
  if (status === 'completed') return CheckCircle2
  if (status === 'running') return CircleDotDashed
  if (status === 'waiting') return CirclePause
  if (status === 'failed') return CircleAlert
  return Circle
}
</script>

<template>
  <section data-testid="agent-progress-bar" class="agent-progress-bar" :class="{ 'has-meta': hasMeta }">
    <div class="agent-progress-bar__layout" :class="{ 'is-track-only': !hasMeta }">
      <ol
        data-testid="agent-progress-track"
        class="agent-progress-bar__track"
        :style="{ '--agent-progress-columns': String(Math.max(steps.length, 1)) }"
      >
        <li
          v-for="(step, index) in steps"
          :key="step.id"
          class="agent-progress-bar__segment"
        >
          <span
            class="agent-progress-bar__step"
            :class="[
              `is-${step.status}`,
              {
                'is-current': step.id === currentStepId,
              },
            ]"
          >
            <span class="agent-progress-bar__step-icon">
              <component :is="getIcon(step.status)" :size="10" :stroke-width="2.3" />
            </span>
            <span class="agent-progress-bar__step-label">{{ step.title }}</span>
          </span>

          <ChevronRight
            v-if="index < steps.length - 1"
            :size="11"
            class="agent-progress-bar__arrow"
            aria-hidden="true"
          />
        </li>
      </ol>

      <div v-if="hasMeta" class="agent-progress-bar__meta">
        <p v-if="currentHeadline" data-testid="agent-progress-current" class="agent-progress-bar__current">
          {{ currentHeadline }}
        </p>

        <p
          v-if="showApplyFeedback"
          data-testid="agent-auto-apply-feedback"
          class="agent-progress-bar__apply-feedback"
          :class="{ 'is-failed': autoApplyStatus === 'failed' }"
        >
          {{ applyFeedback }}
        </p>
      </div>
    </div>
  </section>
</template>

<style scoped>
.agent-progress-bar {
  padding: 6px 18px;
  border-bottom: 1px solid #dbe4ef;
  background: #fbfdff;
}

.agent-progress-bar__layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 14px;
  align-items: center;
}

.agent-progress-bar__layout.is-track-only {
  grid-template-columns: minmax(0, 1fr);
}

.agent-progress-bar__track {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(var(--agent-progress-columns), minmax(0, 1fr));
  gap: 14px;
  align-items: center;
  min-width: 0;
}

.agent-progress-bar__step {
  min-width: 0;
  min-height: 22px;
  display: flex;
  align-items: center;
  gap: 6px;
  color: #94a3b8;
  transition: all 0.18s ease;
}

.agent-progress-bar__segment {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  position: relative;
}

.agent-progress-bar__arrow {
  color: #cbd5e1;
  flex: 0 0 auto;
}

.agent-progress-bar__step-icon {
  width: 16px;
  height: 16px;
  border-radius: 999px;
  border: 1px solid #dbe4ef;
  background: rgba(255, 255, 255, 0.98);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: currentColor;
  box-shadow: 0 8px 16px -16px rgba(15, 23, 42, 0.55);
  flex: 0 0 auto;
}

.agent-progress-bar__step-label {
  min-width: 0;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.01em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.agent-progress-bar__step.is-current {
  color: #1d4ed8;
}

.agent-progress-bar__step.is-current .agent-progress-bar__step-icon {
  border-color: #93c5fd;
  background: linear-gradient(180deg, #eff6ff 0%, #dbeafe 100%);
  box-shadow:
    0 0 0 3px rgba(191, 219, 254, 0.35),
    0 14px 22px -20px rgba(37, 99, 235, 0.7);
}

.agent-progress-bar__step.is-running .agent-progress-bar__step-icon :deep(svg) {
  animation: agent-spin 2s linear infinite;
}

@keyframes agent-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.agent-progress-bar__step.is-completed {
  color: #2563eb;
}

.agent-progress-bar__step.is-completed .agent-progress-bar__step-icon {
  border-color: #bfdbfe;
  background: #eff6ff;
}

.agent-progress-bar__step.is-waiting {
  color: #b45309;
}

.agent-progress-bar__step.is-waiting .agent-progress-bar__step-icon {
  border-color: #fcd34d;
  background: #fffbeb;
}

.agent-progress-bar__step.is-failed {
  color: #b91c1c;
}

.agent-progress-bar__step.is-failed .agent-progress-bar__step-icon {
  border-color: #fecaca;
  background: #fef2f2;
}

.agent-progress-bar__meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  justify-self: end;
  min-width: 0;
}

.agent-progress-bar__current,
.agent-progress-bar__apply-feedback {
  margin: 0;
  font-size: 11px;
  line-height: 1.4;
}

.agent-progress-bar__current {
  max-width: min(320px, 48vw);
  padding: 4px 10px;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.24);
  background: #ffffff;
  color: #334155;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  box-shadow: 0 14px 24px -24px rgba(15, 23, 42, 0.55);
}

.agent-progress-bar__apply-feedback {
  padding: 4px 10px;
  border-radius: 999px;
  background: #ecfdf5;
  color: #047857;
  white-space: nowrap;
}

.agent-progress-bar__apply-feedback.is-failed {
  background: #fef2f2;
  color: #b91c1c;
}

@media (max-width: 1200px) {
  .agent-progress-bar__layout {
    grid-template-columns: minmax(0, 1fr);
    gap: 8px;
  }

  .agent-progress-bar__meta {
    justify-self: start;
  }
}

@media (max-width: 900px) {
  .agent-progress-bar {
    padding-inline: 14px;
  }

  .agent-progress-bar__track {
    display: flex;
    gap: 12px;
    overflow-x: auto;
    scrollbar-width: none;
  }

  .agent-progress-bar__track::-webkit-scrollbar {
    display: none;
  }

  .agent-progress-bar__segment {
    min-width: max-content;
  }

  .agent-progress-bar__current,
  .agent-progress-bar__apply-feedback {
    max-width: none;
    white-space: normal;
  }
}
</style>
