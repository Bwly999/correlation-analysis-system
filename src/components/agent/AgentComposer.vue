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
        placeholder="直接描述你想处理的事情，例如：先读取当前工作流和工具清单，再告诉我下一步可以怎么改。"
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
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 20px 24px 24px;
  border-top: 1px solid #e2e8f0;
  background: rgba(255, 255, 255, 0.8);
  backdrop-filter: blur(8px);
}

.agent-composer__approval-bar {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  font-size: 11px;
  color: #9a3412;
  margin-bottom: 4px;
}

.agent-composer__approval-bar span {
  border-radius: 999px;
  background: #fff7ed;
  border: 1px solid #ffedd5;
  padding: 4px 10px;
  font-weight: 600;
}

.agent-composer__shell {
  border-radius: 20px;
  border: 1px solid #e2e8f0;
  background: #ffffff;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  box-shadow: 
    0 10px 15px -3px rgba(0, 0, 0, 0.05),
    0 4px 6px -4px rgba(0, 0, 0, 0.05);
  transition: all 0.2s ease;
}

.agent-composer__shell:focus-within {
  border-color: #3b82f6;
  box-shadow: 
    0 0 0 3px rgba(59, 130, 246, 0.1),
    0 10px 15px -3px rgba(0, 0, 0, 0.05);
}

.agent-composer__input {
  width: 100%;
  min-height: 80px;
  resize: none;
  border: none;
  outline: none;
  background: transparent;
  color: #1e293b;
  font-size: 14px;
  line-height: 1.6;
  font-family: inherit;
}

.agent-composer__input::placeholder {
  color: #94a3b8;
}

.agent-composer__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-top: 4px;
}

.agent-composer__quick-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.agent-composer__icon-btn,
.agent-composer__sync-btn {
  height: 32px;
  border-radius: 10px;
  border: 1px solid #e2e8f0;
  background: #ffffff;
  color: #64748b;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
  padding: 0 10px;
  font-size: 12px;
  font-weight: 600;
}

.agent-composer__icon-btn {
  width: 32px;
  padding: 0;
}

.agent-composer__icon-btn:hover:not(:disabled),
.agent-composer__sync-btn:hover:not(:disabled) {
  border-color: #cbd5e1;
  color: #1e293b;
  background: #f8fafc;
}

.agent-composer__submit {
  height: 34px;
  padding: 0 16px;
  border-radius: 10px;
  border: none;
  background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
  color: #ffffff;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 4px 6px -1px rgba(37, 99, 235, 0.2);
}

.agent-composer__submit:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 10px 15px -3px rgba(37, 99, 235, 0.3);
  filter: brightness(1.05);
}

.agent-composer__submit:active:not(:disabled) {
  transform: translateY(0);
}

.agent-composer__icon-btn:disabled,
.agent-composer__sync-btn:disabled,
.agent-composer__submit:disabled {
  cursor: not-allowed;
  opacity: 0.4;
  filter: grayscale(1);
  box-shadow: none;
}
</style>
