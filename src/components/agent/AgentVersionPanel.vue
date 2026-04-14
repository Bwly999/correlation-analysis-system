<script setup lang="ts">
import { computed } from 'vue'
import { CalendarClock, GitBranchPlus, RotateCcw } from 'lucide-vue-next'
import type { WorkflowVersionDetail, WorkflowVersionMetadata } from '@/utils/storage'

const props = defineProps<{
  workflowId: string | null
  workflowName: string
  versions: WorkflowVersionMetadata[]
  selectedVersionDetail: WorkflowVersionDetail | null
  loading: boolean
  detailLoading: boolean
  rollbacking: boolean
}>()

const emit = defineEmits<{
  selectVersion: [versionId: string]
  rollback: [versionId: string]
}>()

const selectedVersionId = computed(() => props.selectedVersionDetail?.id ?? '')
const previewNodeLabels = computed(() =>
  (props.selectedVersionDetail?.workflow.nodes ?? [])
    .map((node) => node.data.label || node.label || node.id)
    .slice(0, 4),
)

const formatVersionTime = (timestamp: number) =>
  new Date(timestamp).toLocaleString('zh-CN', { hour12: false })

const getSourceLabel = (source: WorkflowVersionMetadata['source']) =>
  source === 'rollback' ? '回滚版本' : '保存版本'

const handleRollback = () => {
  if (!props.selectedVersionDetail) return
  emit('rollback', props.selectedVersionDetail.id)
}
</script>

<template>
  <section data-testid="agent-version-panel" class="agent-version-panel">
    <div class="agent-version-panel__header">
      <div>
        <p class="agent-version-panel__eyebrow">版本历史</p>
        <strong>{{ props.workflowName || '未命名工作流' }}</strong>
      </div>
      <span class="agent-version-panel__badge">{{ props.versions.length }} 个版本</span>
    </div>

    <p class="agent-version-panel__description">
      每次保存与回滚都会生成新快照，便于对照分析代理自动改动前后的流程差异。
    </p>

    <div v-if="!props.workflowId" class="agent-version-panel__placeholder">
      先保存当前工作流，系统才会开始记录版本历史。
    </div>

    <div v-else-if="props.loading" class="agent-version-panel__placeholder">
      正在读取版本历史...
    </div>

    <div v-else-if="!props.versions.length" class="agent-version-panel__placeholder">
      当前还没有版本快照，下一次保存后会自动生成首个版本。
    </div>

    <div v-else class="agent-version-panel__content">
      <div class="agent-version-panel__list">
        <button
          v-for="version in props.versions"
          :key="version.id"
          :data-testid="`agent-version-item-${version.id}`"
          type="button"
          class="agent-version-panel__item"
          :class="{ 'is-selected': selectedVersionId === version.id }"
          @click="emit('selectVersion', version.id)"
        >
          <div class="agent-version-panel__item-top">
            <span class="agent-version-panel__item-tag">{{ getSourceLabel(version.source) }}</span>
            <span class="agent-version-panel__item-id">#{{ version.id.slice(-6) }}</span>
          </div>
          <strong>{{ formatVersionTime(version.createdAt) }}</strong>
          <span>{{ formatVersionTime(version.workflowUpdatedAt) }} 更新</span>
        </button>
      </div>

      <div class="agent-version-panel__detail">
        <div v-if="props.detailLoading" class="agent-version-panel__placeholder">
          正在读取版本详情...
        </div>

        <div
          v-else-if="props.selectedVersionDetail"
          data-testid="agent-version-detail"
          class="agent-version-panel__detail-card"
        >
          <div class="agent-version-panel__detail-head">
            <div>
              <span>{{ getSourceLabel(props.selectedVersionDetail.source) }}</span>
              <strong>{{ formatVersionTime(props.selectedVersionDetail.createdAt) }}</strong>
            </div>
            <button
              data-testid="agent-version-rollback"
              type="button"
              class="agent-version-panel__rollback"
              :disabled="props.rollbacking"
              @click="handleRollback"
            >
              <RotateCcw :size="14" />
              <span>{{ props.rollbacking ? '正在回滚...' : '回滚版本' }}</span>
            </button>
          </div>

          <dl class="agent-version-panel__stats">
            <div>
              <dt><GitBranchPlus :size="14" /> 节点规模</dt>
              <dd>{{ props.selectedVersionDetail.workflow.nodes.length }} 个节点</dd>
            </div>
            <div>
              <dt><CalendarClock :size="14" /> 连线规模</dt>
              <dd>{{ props.selectedVersionDetail.workflow.edges.length }} 条连线</dd>
            </div>
          </dl>

          <div class="agent-version-panel__snapshot">
            <span>快照节点</span>
            <ul>
              <li
                v-for="label in previewNodeLabels"
                :key="label"
              >
                {{ label }}
              </li>
            </ul>
          </div>
        </div>

        <div v-else class="agent-version-panel__placeholder">
          选择左侧版本后，可在这里预览节点快照并执行回滚。
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.agent-version-panel {
  display: grid;
  gap: 14px;
  padding: 16px;
  border-radius: 22px;
  border: 1px solid #dbe4ef;
  background:
    radial-gradient(circle at top right, rgba(219, 234, 254, 0.66), transparent 42%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.98) 0%, rgba(248, 250, 252, 0.98) 100%);
  box-shadow:
    0 24px 40px -34px rgba(15, 23, 42, 0.28),
    inset 0 1px 0 rgba(255, 255, 255, 0.88);
}

.agent-version-panel__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.agent-version-panel__eyebrow {
  margin: 0 0 6px;
  color: #64748b;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.agent-version-panel__header strong {
  color: #0f172a;
  font-size: 16px;
  letter-spacing: -0.03em;
}

.agent-version-panel__badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 30px;
  padding: 0 12px;
  border-radius: 999px;
  background: #eff6ff;
  color: #1d4ed8;
  font-size: 11px;
  font-weight: 800;
}

.agent-version-panel__description {
  margin: 0;
  color: #475569;
  font-size: 12px;
  line-height: 1.7;
}

.agent-version-panel__content {
  display: grid;
  gap: 12px;
}

.agent-version-panel__list {
  display: grid;
  gap: 10px;
}

.agent-version-panel__item {
  display: grid;
  gap: 6px;
  padding: 12px 14px;
  border-radius: 18px;
  border: 1px solid #dbe4ef;
  background: rgba(255, 255, 255, 0.8);
  color: #334155;
  text-align: left;
  cursor: pointer;
  transition:
    transform 0.18s ease,
    border-color 0.18s ease,
    box-shadow 0.18s ease;
}

.agent-version-panel__item:hover {
  transform: translateY(-1px);
  border-color: #bfdbfe;
  box-shadow: 0 18px 26px -28px rgba(37, 99, 235, 0.5);
}

.agent-version-panel__item.is-selected {
  border-color: #93c5fd;
  background: #eff6ff;
}

.agent-version-panel__item-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.agent-version-panel__item-tag {
  display: inline-flex;
  align-items: center;
  min-height: 22px;
  padding: 0 10px;
  border-radius: 999px;
  background: #e2e8f0;
  color: #0f172a;
  font-size: 11px;
  font-weight: 700;
}

.agent-version-panel__item-id {
  color: #64748b;
  font-size: 11px;
  font-family: "Consolas", "SFMono-Regular", "Liberation Mono", monospace;
}

.agent-version-panel__item strong {
  color: #0f172a;
  font-size: 13px;
}

.agent-version-panel__item span {
  font-size: 11px;
  line-height: 1.6;
}

.agent-version-panel__detail-card,
.agent-version-panel__placeholder {
  padding: 14px;
  border-radius: 18px;
  border: 1px dashed #cbd5e1;
  background: rgba(255, 255, 255, 0.74);
  color: #475569;
  font-size: 12px;
  line-height: 1.7;
}

.agent-version-panel__detail-card {
  display: grid;
  gap: 14px;
  border-style: solid;
}

.agent-version-panel__detail-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.agent-version-panel__detail-head div {
  display: grid;
  gap: 4px;
}

.agent-version-panel__detail-head span {
  color: #64748b;
  font-size: 11px;
  font-weight: 700;
}

.agent-version-panel__detail-head strong {
  color: #0f172a;
  font-size: 14px;
}

.agent-version-panel__rollback {
  height: 34px;
  padding: 0 12px;
  border-radius: 12px;
  border: 1px solid #dbe4ef;
  background: #0f172a;
  color: #f8fafc;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 700;
}

.agent-version-panel__rollback:disabled {
  cursor: wait;
  opacity: 0.72;
}

.agent-version-panel__stats {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin: 0;
}

.agent-version-panel__stats div {
  display: grid;
  gap: 6px;
  padding: 12px;
  border-radius: 16px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
}

.agent-version-panel__stats dt {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  color: #64748b;
  font-size: 11px;
  font-weight: 700;
}

.agent-version-panel__stats dd {
  margin: 0;
  color: #0f172a;
  font-size: 13px;
  font-weight: 800;
}

.agent-version-panel__snapshot {
  display: grid;
  gap: 8px;
}

.agent-version-panel__snapshot span {
  color: #64748b;
  font-size: 11px;
  font-weight: 700;
}

.agent-version-panel__snapshot ul {
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.agent-version-panel__snapshot li {
  padding: 10px 12px;
  border-radius: 14px;
  background: #f8fafc;
  color: #0f172a;
  font-size: 12px;
  line-height: 1.6;
  border: 1px solid #e2e8f0;
}

@media (max-width: 560px) {
  .agent-version-panel__stats {
    grid-template-columns: minmax(0, 1fr);
  }

  .agent-version-panel__detail-head {
    display: grid;
  }

  .agent-version-panel__rollback {
    width: 100%;
    justify-content: center;
  }
}
</style>
