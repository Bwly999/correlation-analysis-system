<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import Drawer from 'primevue/drawer'
import Tabs from 'primevue/tabs'
import Tab from 'primevue/tab'
import TabList from 'primevue/tablist'
import TabPanels from 'primevue/tabpanels'
import TabPanel from 'primevue/tabpanel'
import { FolderOpen, Pin, PinOff, RefreshCcw } from 'lucide-vue-next'
import { useAgentObservabilityStore } from '@/stores/agentObservabilityStore'
import AgentObservabilityOverviewTab from './AgentObservabilityOverviewTab.vue'
import AgentObservabilityTimelineTab from './AgentObservabilityTimelineTab.vue'
import AgentObservabilityToolsTab from './AgentObservabilityToolsTab.vue'
import AgentObservabilityMessagesTab from './AgentObservabilityMessagesTab.vue'
import AgentObservabilityProjectionTab from './AgentObservabilityProjectionTab.vue'
import AgentObservabilityErrorsTab from './AgentObservabilityErrorsTab.vue'
import AgentObservabilityReplayControls from './AgentObservabilityReplayControls.vue'

const props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
}>()

const store = useAgentObservabilityStore()
const activeTab = ref('overview')

const tabItems = [
  { value: 'overview', label: '概览' },
  { value: 'timeline', label: '时间线' },
  { value: 'tools', label: '工具' },
  { value: 'messages', label: '原始消息' },
  { value: 'projection', label: 'Projection' },
  { value: 'errors', label: '错误' },
]

const currentCursorSeq = computed(() => store.replay?.state.cursorSeq ?? 0)
const replayMarkerCount = computed(() => store.replay?.replayMarkers.length ?? 0)
const canJumpPrev = computed(() => currentCursorSeq.value > 1)
const canJumpNext = computed(() => {
  const totalEvents = store.trace?.eventCount ?? 0
  return totalEvents > 0 && currentCursorSeq.value < totalEvents
})
const hasReplayData = computed(() => Boolean(store.replay?.state))
const healthSummary = computed(() => {
  if (!store.health) return '尚未读取健康状态'
  return `活跃 Trace ${store.health.activeTraceCount} 条 · 写盘失败 ${store.health.writeFailures} 次`
})

const loadObservabilityPayload = async () => {
  if (!store.effectiveSessionId) return
  await store.loadHealth().catch(() => undefined)
  await store.loadTrace().catch(() => undefined)
  await store.loadReplay().catch(() => undefined)
}

const jumpPrev = async () => {
  if (!canJumpPrev.value) return
  await store.jumpToSeq(currentCursorSeq.value - 1)
}

const jumpNext = async () => {
  if (!canJumpNext.value) return
  await store.jumpToSeq(currentCursorSeq.value + 1)
}

const openAtSeq = async (seq: number) => {
  await store.jumpToSeq(seq)
}

watch(
  () => props.visible,
  async (visible) => {
    store.setDrawerVisible(visible)
    if (!visible) return
    await loadObservabilityPayload()
  },
  { immediate: true },
)

watch(
  () => store.effectiveSessionId,
  async (sessionId, previousSessionId) => {
    if (!props.visible || !sessionId || sessionId === previousSessionId) return
    await loadObservabilityPayload()
  },
)

onMounted(async () => {
  if (!props.visible) return
  await loadObservabilityPayload()
})
</script>

<template>
  <Drawer
    data-testid="agent-observability-drawer"
    :visible="props.visible"
    :modal="false"
    :dismissable="false"
    position="right"
    class="!w-full md:!w-[34rem] lg:!w-[42rem]"
    @update:visible="emit('update:visible', $event)"
  >
    <template #header>
      <div class="agent-observability-header">
        <div class="agent-observability-header__meta">
          <strong>Agent 调试台</strong>
          <p>{{ store.effectiveSessionId || '当前没有可观测会话' }}</p>
          <span>{{ healthSummary }}</span>
        </div>
        <div class="agent-observability-header__actions">
          <button type="button" class="agent-observability-action" @click="loadObservabilityPayload()">
            <RefreshCcw :size="14" />
            <span>刷新</span>
          </button>
          <button type="button" class="agent-observability-action" @click="store.toggleLockCurrentSession()">
            <component :is="store.isLocked ? PinOff : Pin" :size="14" />
            <span>{{ store.isLocked ? '解除锁定' : '锁定会话' }}</span>
          </button>
        </div>
      </div>
    </template>

    <div class="agent-observability-body">
      <div class="agent-observability-summary-card">
        <div class="agent-observability-summary-card__grid">
          <div>
            <strong>当前序列</strong>
            <span>{{ currentCursorSeq || 0 }}</span>
          </div>
          <div>
            <strong>事件总数</strong>
            <span>{{ store.trace?.eventCount ?? 0 }}</span>
          </div>
          <div>
            <strong>回放锚点</strong>
            <span>{{ replayMarkerCount }}</span>
          </div>
          <div>
            <strong>最新状态</strong>
            <span>{{ store.trace?.latestStatus || '未知' }}</span>
          </div>
        </div>
        <div class="agent-observability-summary-card__footer">
          <span class="agent-observability-log-path">{{ store.files?.rootDir || store.health?.logRootDir || '尚未生成日志目录' }}</span>
          <button
            v-if="store.files?.rootDir"
            type="button"
            class="agent-observability-action agent-observability-action--subtle"
            :title="store.files.rootDir"
          >
            <FolderOpen :size="14" />
            <span>日志目录</span>
          </button>
        </div>
      </div>

      <div v-if="store.errorMessage" class="agent-observability-error-banner">
        {{ store.errorMessage }}
      </div>

      <AgentObservabilityReplayControls
        v-if="hasReplayData"
        :cursor-seq="currentCursorSeq"
        @jump-prev="jumpPrev"
        @jump-next="jumpNext"
      />

      <Tabs v-model:value="activeTab" class="agent-observability-tabs">
        <TabList>
          <Tab v-for="item in tabItems" :key="item.value" :value="item.value">
            {{ item.label }}
          </Tab>
        </TabList>
        <TabPanels>
          <TabPanel value="overview">
            <AgentObservabilityOverviewTab
              :trace="store.trace"
              :files="store.files"
              :health="store.health"
            />
          </TabPanel>
          <TabPanel value="timeline">
            <AgentObservabilityTimelineTab
              :trace="store.trace"
              @jump-to-seq="openAtSeq"
            />
          </TabPanel>
          <TabPanel value="tools">
            <AgentObservabilityToolsTab
              :trace="store.trace"
              :replay="store.replay"
            />
          </TabPanel>
          <TabPanel value="messages">
            <AgentObservabilityMessagesTab
              :trace="store.trace"
            />
          </TabPanel>
          <TabPanel value="projection">
            <AgentObservabilityProjectionTab
              :trace="store.trace"
              :replay="store.replay"
            />
          </TabPanel>
          <TabPanel value="errors">
            <AgentObservabilityErrorsTab
              :trace="store.trace"
              :replay="store.replay"
            />
          </TabPanel>
        </TabPanels>
      </Tabs>
    </div>
  </Drawer>
</template>

<style scoped>
.agent-observability-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  width: 100%;
}

.agent-observability-header__meta {
  display: grid;
  gap: 4px;
}

.agent-observability-header__meta strong {
  color: #0f172a;
  font-size: 16px;
}

.agent-observability-header__meta p {
  margin: 0;
  color: #334155;
  font-size: 12px;
  font-weight: 700;
  word-break: break-all;
}

.agent-observability-header__meta span {
  color: #64748b;
  font-size: 11px;
}

.agent-observability-header__actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.agent-observability-action {
  height: 34px;
  padding: 0 12px;
  border-radius: 12px;
  border: 1px solid #dbe4ef;
  background: #fff;
  color: #334155;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 700;
}

.agent-observability-action--subtle {
  height: 30px;
  padding: 0 10px;
}

.agent-observability-body {
  display: grid;
  gap: 16px;
}

.agent-observability-summary-card {
  display: grid;
  gap: 12px;
  padding: 14px;
  border-radius: 18px;
  border: 1px solid #dbe4ef;
  background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
}

.agent-observability-summary-card__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.agent-observability-summary-card__grid div {
  display: grid;
  gap: 4px;
}

.agent-observability-summary-card__grid strong {
  color: #64748b;
  font-size: 11px;
}

.agent-observability-summary-card__grid span {
  color: #0f172a;
  font-size: 13px;
  font-weight: 700;
}

.agent-observability-summary-card__footer {
  display: grid;
  gap: 8px;
}

.agent-observability-log-path {
  color: #475569;
  font-size: 12px;
  word-break: break-all;
}

.agent-observability-error-banner {
  padding: 12px 14px;
  border-radius: 14px;
  border: 1px solid #fecaca;
  background: #fff1f2;
  color: #b91c1c;
  font-size: 12px;
  font-weight: 700;
}

.agent-observability-tabs :deep(.p-tablist-tab-list) {
  gap: 6px;
  border: none;
  background: transparent;
  flex-wrap: wrap;
}

.agent-observability-tabs :deep(.p-tab) {
  border-radius: 999px;
  border: 1px solid #dbe4ef;
  background: #fff;
  color: #334155;
  font-size: 12px;
  font-weight: 700;
  padding: 8px 14px;
}

.agent-observability-tabs :deep(.p-tab-active) {
  border-color: #2563eb;
  color: #2563eb;
  background: #eff6ff;
}

.agent-observability-tabs :deep(.p-tabpanels) {
  padding: 0;
  background: transparent;
}

.agent-observability-tabs :deep(.p-tabpanel) {
  padding: 0;
}
</style>
