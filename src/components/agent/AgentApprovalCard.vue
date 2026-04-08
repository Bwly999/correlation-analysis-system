<script setup lang="ts">
import { AlertTriangle } from 'lucide-vue-next'
import type { AnalysisAgentApprovalRequest } from '@/ai/types'

defineProps<{
  request: AnalysisAgentApprovalRequest
}>()
</script>

<template>
  <article class="agent-approval-card">
    <div class="agent-approval-card__header">
      <span class="agent-approval-card__icon">
        <AlertTriangle :size="14" />
      </span>
      <div>
        <strong>{{ request.label }}</strong>
        <p>{{ request.blocking ? '需要确认后继续执行' : '建议补充信息' }}</p>
      </div>
    </div>
    <div class="agent-approval-card__reason">{{ request.reason }}</div>
  </article>
</template>

<style scoped>
.agent-approval-card {
  border-radius: 16px;
  border: 1px solid #fed7aa;
  background: linear-gradient(180deg, #fff7ed 0%, #fffbeb 100%);
  padding: 14px 16px;
}

.agent-approval-card__header {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.agent-approval-card__icon {
  width: 26px;
  height: 26px;
  border-radius: 9px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: #ffffff;
  color: #ea580c;
}

.agent-approval-card__header strong {
  display: block;
  color: #9a3412;
  font-size: 13px;
}

.agent-approval-card__header p,
.agent-approval-card__reason {
  margin: 0;
  font-size: 12px;
  line-height: 1.6;
}

.agent-approval-card__header p {
  color: #c2410c;
}

.agent-approval-card__reason {
  margin-top: 10px;
  color: #7c2d12;
}
</style>
