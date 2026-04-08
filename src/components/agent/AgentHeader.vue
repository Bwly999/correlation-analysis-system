<script setup lang="ts">
import { computed } from 'vue'
import { Bot, Square, Trash2, FileText, RotateCcw } from 'lucide-vue-next'
import type { AnalysisAgentSessionState } from '@/ai/types'

const props = defineProps<{
  session: AnalysisAgentSessionState | null
}>()

const emit = defineEmits<{
  clear: []
  newSession: []
  focusReport: []
}>()

const statusLabel = computed(() => {
  if (!props.session) return '待命'
  if (props.session.phase === 'waiting_for_input') return '等待确认'
  if (props.session.phase === 'completed') return '已完成'
  if (props.session.phase === 'failed') return '失败'
  if (props.session.phase === 'executing') return '分析中'
  return '规划中'
})
</script>

<template>
  <header class="agent-header">
    <div class="agent-header__identity">
      <span class="agent-header__badge">
        <Bot :size="16" />
      </span>
      <div>
        <strong>分析代理</strong>
        <p>{{ session?.userGoal || '聊天式提问，直接输出分析过程与结论' }}</p>
      </div>
    </div>
    <div class="agent-header__meta">
      <span class="agent-header__status">{{ statusLabel }}</span>
      <div class="agent-header__actions">
        <button type="button" @click="emit('focusReport')">
          <FileText :size="14" />
          <span>查看报告</span>
        </button>
        <button type="button" @click="emit('newSession')">
          <RotateCcw :size="14" />
          <span>新会话</span>
        </button>
        <button type="button" @click="emit('clear')">
          <Trash2 :size="14" />
          <span>清空</span>
        </button>
      </div>
    </div>
  </header>
</template>

<style scoped>
.agent-header {
  display: grid;
  gap: 14px;
  padding: 18px;
  border-bottom: 1px solid #dbe4ef;
  background:
    radial-gradient(120% 140% at 100% 0%, rgba(37, 99, 235, 0.12) 0%, rgba(255, 255, 255, 0) 50%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.96) 0%, rgba(248, 250, 252, 0.96) 100%);
}

.agent-header__identity {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 12px;
}

.agent-header__badge {
  width: 38px;
  height: 38px;
  border-radius: 14px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: #0f172a;
  color: #ffffff;
  box-shadow: 0 16px 30px -20px rgba(15, 23, 42, 0.75);
}

.agent-header__identity strong {
  display: block;
  color: #0f172a;
  font-size: 15px;
}

.agent-header__identity p {
  margin: 4px 0 0;
  color: #475569;
  font-size: 12px;
  line-height: 1.6;
}

.agent-header__meta {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
}

.agent-header__status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border-radius: 999px;
  border: 1px solid #bfdbfe;
  background: #eff6ff;
  color: #1d4ed8;
  padding: 6px 10px;
  font-size: 11px;
  font-weight: 800;
}

.agent-header__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.agent-header__actions button {
  height: 34px;
  padding: 0 12px;
  border-radius: 12px;
  border: 1px solid #dbe4ef;
  background: #ffffff;
  color: #334155;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 700;
}
</style>
