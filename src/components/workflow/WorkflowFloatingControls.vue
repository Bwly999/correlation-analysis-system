<script setup lang="ts">
import { BarChart3, Play, Square } from 'lucide-vue-next'

const props = defineProps<{
  visible: boolean
  showRunActions?: boolean
  isRunning: boolean
  hasPendingExecution: boolean
  hasResultDashboard: boolean
  runBarBottom: number
  runButtonTitle: string
  runButtonSubtitle: string
  runBarState: 'idle' | 'running' | 'pending'
}>()

const emit = defineEmits<{
  run: []
  stop: []
  openDashboard: []
}>()
</script>

<template>
  <template v-if="visible">
    <div
      class="absolute left-1/2 -translate-x-1/2 z-[90] transition-all duration-500 flex items-center gap-3"
      :style="{ bottom: `${props.runBarBottom}px` }"
    >
      <div class="workflow-run-shell" :class="`workflow-run-shell--${props.runBarState}`">
        <template v-if="props.showRunActions !== false">
          <button
            type="button"
            :disabled="props.isRunning || props.hasPendingExecution"
            class="workflow-run-bar"
            :class="`workflow-run-bar--${props.runBarState}`"
            @click="emit('run')"
          >
            <span class="workflow-run-bar__icon">
              <Play :size="18" fill="currentColor" />
            </span>
            <span class="workflow-run-bar__copy">
              <strong>{{ props.runButtonTitle }}</strong>
              <span>{{ props.runButtonSubtitle }}</span>
            </span>
          </button>
          <button
            v-if="props.isRunning || props.hasPendingExecution"
            type="button"
            v-tooltip.top="'停止执行'"
            class="workflow-run-stop animate-in fade-in zoom-in-75 duration-300"
            @click="emit('stop')"
          >
            <Square :size="18" fill="currentColor" />
          </button>
        </template>
        <button
          v-if="props.hasResultDashboard"
          type="button"
          class="workflow-dashboard-entry"
          @click="emit('openDashboard')"
        >
          <BarChart3 :size="16" />
          <span>结果看板</span>
        </button>
      </div>
    </div>
  </template>
</template>

<style scoped>
.workflow-run-shell {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 28px;
  background: rgba(255, 255, 255, 0.9);
  border: 1px solid rgba(191, 219, 254, 0.78);
  box-shadow: 0 20px 54px rgba(37, 99, 235, 0.14);
  backdrop-filter: blur(10px);
}

.workflow-run-shell--idle {
  border-color: rgba(226, 232, 240, 0.95);
  box-shadow: 0 18px 42px rgba(15, 23, 42, 0.1);
}

.workflow-run-shell--running {
  border-color: rgba(191, 219, 254, 0.78);
  box-shadow: 0 20px 54px rgba(37, 99, 235, 0.14);
}

.workflow-run-shell--pending {
  border-color: rgba(253, 230, 138, 0.9);
  box-shadow: 0 20px 54px rgba(245, 158, 11, 0.16);
}

.workflow-run-bar {
  min-width: 244px;
  min-height: 54px;
  padding: 0 18px 0 16px;
  border-radius: 20px;
  display: inline-flex;
  align-items: center;
  justify-content: flex-start;
  gap: 12px;
  border: 1px solid transparent;
  color: #ffffff;
  box-shadow: 0 16px 34px rgba(37, 99, 235, 0.26);
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease,
    opacity 0.2s ease,
    background 0.2s ease,
    color 0.2s ease,
    border-color 0.2s ease;
  cursor: pointer;
}

.workflow-run-bar--idle {
  color: #0f172a;
  background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
  border-color: rgba(148, 163, 184, 0.22);
  box-shadow: 0 14px 28px rgba(15, 23, 42, 0.08);
}

.workflow-run-bar--running {
  color: #ffffff;
  background: linear-gradient(90deg, #2563eb 0 36%, #0f172a 36% 100%);
  box-shadow: 0 16px 34px rgba(37, 99, 235, 0.26);
}

.workflow-run-bar--pending {
  color: #422006;
  background: linear-gradient(180deg, #fffaf0 0%, #fef3c7 100%);
  border-color: rgba(245, 158, 11, 0.24);
  box-shadow: 0 16px 32px rgba(245, 158, 11, 0.16);
}

.workflow-run-bar:not(:disabled):hover {
  transform: translateY(-1px);
}

.workflow-run-bar--idle:not(:disabled):hover {
  box-shadow: 0 18px 32px rgba(15, 23, 42, 0.12);
}

.workflow-run-bar--running:not(:disabled):hover {
  box-shadow: 0 18px 38px rgba(37, 99, 235, 0.3);
}

.workflow-run-bar--pending:not(:disabled):hover {
  box-shadow: 0 18px 36px rgba(245, 158, 11, 0.22);
}

.workflow-run-bar__icon {
  width: 36px;
  height: 36px;
  border-radius: 9999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.16);
  flex: none;
}

.workflow-run-bar--idle .workflow-run-bar__icon {
  color: #ffffff;
  background: #2563eb;
  border: 1px solid rgba(37, 99, 235, 0.12);
}

.workflow-run-bar--running .workflow-run-bar__icon {
  color: #ffffff;
  background: rgba(255, 255, 255, 0.16);
  border: 1px solid rgba(255, 255, 255, 0.14);
}

.workflow-run-bar--pending .workflow-run-bar__icon {
  color: #ffffff;
  background: #f59e0b;
  border: 1px solid rgba(245, 158, 11, 0.18);
}

.workflow-run-bar__copy {
  display: inline-flex;
  flex-direction: column;
  align-items: flex-start;
  line-height: 1.1;
  text-align: left;
}

.workflow-run-bar__copy strong {
  font-size: 14px;
  font-weight: 900;
  letter-spacing: 0.01em;
}

.workflow-run-bar__copy span {
  margin-top: 2px;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.workflow-run-bar--idle .workflow-run-bar__copy span {
  color: #64748b;
}

.workflow-run-bar--running .workflow-run-bar__copy span {
  color: rgba(255, 255, 255, 0.72);
}

.workflow-run-bar--pending .workflow-run-bar__copy span {
  color: rgba(66, 32, 6, 0.72);
}

.workflow-run-bar:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  transform: none;
}

.workflow-run-stop {
  width: 54px;
  height: 54px;
  border-radius: 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #dc2626 !important;
  background: #ffffff !important;
  border: 1px solid rgba(148, 163, 184, 0.24) !important;
  box-shadow: none;
}

.workflow-dashboard-entry {
  min-height: 54px;
  padding: 0 16px;
  border-radius: 18px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border: 1px solid rgba(148, 163, 184, 0.24);
  background: rgba(255, 255, 255, 0.95);
  color: #0f172a;
  font-size: 12px;
  font-weight: 900;
  cursor: pointer;
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.08);
  transition:
    border-color 0.2s ease,
    color 0.2s ease,
    transform 0.2s ease;
}

.workflow-dashboard-entry:hover {
  border-color: rgba(37, 99, 235, 0.28);
  color: #2563eb;
  transform: translateY(-1px);
}
</style>
