<script setup lang="ts">
import { computed } from 'vue'
import { Activity, CircleEllipsis, GitBranchPlus, ShieldCheck } from 'lucide-vue-next'
import type { AnalysisAgentApprovalRequest, AnalysisAgentToolCall } from '@/ai/types'

type AgentWorkspaceFlowState = {
  status: 'idle' | 'planning' | 'waiting' | 'ready' | 'running' | 'completed' | 'failed'
  title: string
  description: string
  badge: string
}

const props = defineProps<{
  flow: AgentWorkspaceFlowState
  workflowName: string
  workflowId: string | null
  headline: string
  approvalRequests: AnalysisAgentApprovalRequest[]
  toolCalls: AnalysisAgentToolCall[]
  versionCount: number
  loopRunning: boolean
  autoApplyStatus: 'idle' | 'applied' | 'failed'
}>()

const runtimeTone = computed(() => {
  if (props.flow.status === 'failed') return 'failed'
  if (props.flow.status === 'completed') return 'completed'
  if (props.flow.status === 'running') return 'running'
  if (props.flow.status === 'waiting') return 'waiting'
  return 'idle'
})

const approvalSummary = computed(() => {
  const blockingCount = props.approvalRequests.filter((item) => item.blocking).length
  if (!props.approvalRequests.length) return '无需补充'
  if (blockingCount > 0) return `${blockingCount} 项阻塞`
  return `${props.approvalRequests.length} 项待确认`
})

const mcpToolCount = computed(() =>
  props.toolCalls.filter((item) => item.toolName.startsWith('workflow_')).length,
)

const autoApplyLabel = computed(() => {
  if (props.autoApplyStatus === 'applied') return '已同步画布'
  if (props.autoApplyStatus === 'failed') return '同步失败'
  return props.loopRunning ? '待输出结论' : '待运行'
})

const metrics = computed(() => [
  {
    key: 'approval',
    label: '审批队列',
    value: approvalSummary.value,
    icon: ShieldCheck,
  },
  {
    key: 'mcp',
    label: 'MCP 工具',
    value: `${mcpToolCount.value || props.toolCalls.length} 次`,
    icon: CircleEllipsis,
  },
  {
    key: 'versions',
    label: '版本快照',
    value: props.versionCount ? `${props.versionCount} 个` : '未生成',
    icon: GitBranchPlus,
  },
  {
    key: 'apply',
    label: '同步状态',
    value: autoApplyLabel.value,
    icon: Activity,
  },
])
</script>

<template>
  <section
    data-testid="agent-runtime-panel"
    class="agent-runtime-panel"
    :class="`is-${runtimeTone}`"
  >
    <div class="agent-runtime-panel__header">
      <div>
        <p class="agent-runtime-panel__eyebrow">当前运行态</p>
        <strong>{{ props.flow.title }}</strong>
      </div>
      <span class="agent-runtime-panel__badge">{{ props.flow.badge }}</span>
    </div>

    <p class="agent-runtime-panel__description">{{ props.flow.description }}</p>

    <dl class="agent-runtime-panel__metrics">
      <div
        v-for="metric in metrics"
        :key="metric.key"
        class="agent-runtime-panel__metric"
      >
        <dt>
          <component :is="metric.icon" :size="14" />
          <span>{{ metric.label }}</span>
        </dt>
        <dd>{{ metric.value }}</dd>
      </div>
    </dl>

    <div class="agent-runtime-panel__footer">
      <div>
        <span>当前工作流</span>
        <strong>{{ props.workflowName || '未命名工作流' }}</strong>
      </div>
      <div>
        <span>运行摘要</span>
        <strong>{{ props.headline || (props.workflowId ? '等待分析启动' : '请先保存工作流') }}</strong>
      </div>
    </div>
  </section>
</template>

<style scoped>
.agent-runtime-panel {
  --agent-runtime-border: #dbe4ef;
  --agent-runtime-background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.98) 0%, rgba(248, 250, 252, 0.96) 100%);
  display: grid;
  gap: 14px;
  padding: 16px;
  border-radius: 22px;
  border: 1px solid var(--agent-runtime-border);
  background: var(--agent-runtime-background);
  box-shadow:
    0 24px 40px -34px rgba(15, 23, 42, 0.3),
    inset 0 1px 0 rgba(255, 255, 255, 0.88);
}

.agent-runtime-panel.is-running {
  --agent-runtime-border: #bfdbfe;
  --agent-runtime-background:
    linear-gradient(180deg, rgba(239, 246, 255, 0.98) 0%, rgba(248, 250, 252, 0.96) 100%);
}

.agent-runtime-panel.is-completed {
  --agent-runtime-border: #bbf7d0;
  --agent-runtime-background:
    linear-gradient(180deg, rgba(240, 253, 244, 0.98) 0%, rgba(248, 250, 252, 0.96) 100%);
}

.agent-runtime-panel.is-failed {
  --agent-runtime-border: #fecaca;
  --agent-runtime-background:
    linear-gradient(180deg, rgba(254, 242, 242, 0.98) 0%, rgba(248, 250, 252, 0.96) 100%);
}

.agent-runtime-panel.is-waiting {
  --agent-runtime-border: #fde68a;
  --agent-runtime-background:
    linear-gradient(180deg, rgba(255, 251, 235, 0.98) 0%, rgba(248, 250, 252, 0.96) 100%);
}

.agent-runtime-panel__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.agent-runtime-panel__eyebrow {
  margin: 0 0 6px;
  color: #64748b;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.agent-runtime-panel__header strong {
  color: #0f172a;
  font-size: 16px;
  letter-spacing: -0.03em;
}

.agent-runtime-panel__badge {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 30px;
  padding: 0 12px;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.92);
  color: #f8fafc;
  font-size: 11px;
  font-weight: 800;
}

.agent-runtime-panel__description {
  margin: 0;
  color: #475569;
  font-size: 12px;
  line-height: 1.7;
}

.agent-runtime-panel__metrics {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin: 0;
}

.agent-runtime-panel__metric {
  display: grid;
  gap: 6px;
  padding: 12px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.82);
  border: 1px solid rgba(219, 228, 239, 0.92);
}

.agent-runtime-panel__metric dt {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  color: #64748b;
  font-size: 11px;
  font-weight: 700;
}

.agent-runtime-panel__metric dd {
  margin: 0;
  color: #0f172a;
  font-size: 13px;
  font-weight: 800;
  line-height: 1.5;
}

.agent-runtime-panel__footer {
  display: grid;
  gap: 10px;
  padding-top: 14px;
  border-top: 1px dashed rgba(148, 163, 184, 0.45);
}

.agent-runtime-panel__footer div {
  display: grid;
  gap: 4px;
}

.agent-runtime-panel__footer span {
  color: #64748b;
  font-size: 11px;
  font-weight: 700;
}

.agent-runtime-panel__footer strong {
  color: #0f172a;
  font-size: 12px;
  line-height: 1.6;
}

@media (max-width: 560px) {
  .agent-runtime-panel__metrics {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
