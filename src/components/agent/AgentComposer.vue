<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Cpu, RefreshCcw, SendHorizonal } from 'lucide-vue-next'
import type { AnalysisAgentApprovalRequest } from '@/ai/types'

const props = defineProps<{
  prompt: string
  approvalRequests: AnalysisAgentApprovalRequest[]
  disabled?: boolean
  canSyncCanvas?: boolean
}>()

const emit = defineEmits<{
  submit: [value: string]
  updatePrompt: [value: string]
  openModelSettings: []
  syncCanvas: []
}>()

const draft = ref(props.prompt)

watch(
  () => props.prompt,
  (value) => {
    draft.value = value
  },
)

const canSubmit = computed(() => !props.disabled && draft.value.trim().length > 0)

const handleInput = (event: Event) => {
  const value = (event.target as HTMLTextAreaElement).value
  draft.value = value
  emit('updatePrompt', value)
}

const submit = () => {
  if (!canSubmit.value) return
  emit('submit', draft.value.trim())
}
</script>

<template>
  <div class="agent-composer">
    <div v-if="approvalRequests.length" class="agent-composer__approval-bar">
      <span>待确认：</span>
      <span v-for="item in approvalRequests" :key="item.key">{{ item.label }}</span>
    </div>
    <div class="agent-composer__shell">
      <textarea
        :value="draft"
        class="agent-composer__input"
        placeholder="直接描述你的分析问题，例如：帮我分析哪些变量和销量最相关。"
        @input="handleInput"
      />

      <div class="agent-composer__footer">
        <div class="agent-composer__quick-actions">
          <button
            data-testid="agent-composer-model-toggle"
            type="button"
            class="agent-composer__icon-btn"
            title="模型配置"
            @click="emit('openModelSettings')"
          >
            <Cpu :size="16" />
          </button>

          <button
            v-if="canSyncCanvas"
            data-testid="agent-composer-sync"
            type="button"
            class="agent-composer__sync-btn"
            :disabled="disabled"
            @click="emit('syncCanvas')"
          >
            <RefreshCcw :size="14" />
            <span>同步画布</span>
          </button>
        </div>

        <button type="button" class="agent-composer__submit" :disabled="!canSubmit" @click="submit">
          <SendHorizonal :size="14" />
          <span>发送</span>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.agent-composer {
  display: grid;
  gap: 10px;
  padding: 16px 18px 18px;
  border-top: 1px solid #dbe4ef;
  background: #ffffff;
}

.agent-composer__approval-bar {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  font-size: 11px;
  color: #9a3412;
}

.agent-composer__approval-bar span {
  border-radius: 999px;
  background: #fff7ed;
  padding: 4px 8px;
}

.agent-composer__shell {
  border-radius: 20px;
  border: 1px solid #dbe4ef;
  background: #ffffff;
  padding: 12px;
  display: grid;
  gap: 10px;
  box-shadow: 0 16px 26px -26px rgba(15, 23, 42, 0.28);
}

.agent-composer__input {
  width: 100%;
  min-height: 84px;
  resize: vertical;
  border: none;
  outline: none;
  background: transparent;
  color: #0f172a;
  font-size: 13px;
  line-height: 1.6;
}

.agent-composer__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.agent-composer__quick-actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.agent-composer__icon-btn,
.agent-composer__sync-btn {
  height: 36px;
  border-radius: 12px;
  border: 1px solid #dbe4ef;
  background: #ffffff;
  color: #475569;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  cursor: pointer;
  transition: all 0.18s ease;
  padding: 0 12px;
  font-size: 12px;
  font-weight: 700;
}

.agent-composer__icon-btn {
  width: 36px;
  padding: 0;
}

.agent-composer__icon-btn:hover,
.agent-composer__sync-btn:hover {
  border-color: #c4d3e4;
  color: #0f172a;
  background: #f8fbff;
}

.agent-composer__submit {
  justify-self: end;
  height: 36px;
  padding: 0 14px;
  border-radius: 12px;
  border: 1px solid #1d4ed8;
  background: #2563eb;
  color: #ffffff;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
  transition: transform 0.18s ease, box-shadow 0.18s ease, background-color 0.18s ease;
}

.agent-composer__submit:hover:not(:disabled) {
  background: #1d4ed8;
  transform: translateY(-1px);
  box-shadow: 0 16px 24px -20px rgba(37, 99, 235, 0.55);
}

.agent-composer__icon-btn:disabled,
.agent-composer__sync-btn:disabled,
.agent-composer__submit:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}
</style>
