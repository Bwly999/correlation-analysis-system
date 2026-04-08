<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { SendHorizonal } from 'lucide-vue-next'
import type { AnalysisAgentApprovalRequest } from '@/ai/types'

const props = defineProps<{
  prompt: string
  approvalRequests: AnalysisAgentApprovalRequest[]
  disabled?: boolean
}>()

const emit = defineEmits<{
  submit: [value: string]
  updatePrompt: [value: string]
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
      <button type="button" class="agent-composer__submit" :disabled="!canSubmit" @click="submit">
        <SendHorizonal :size="14" />
        <span>发送</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.agent-composer {
  display: grid;
  gap: 10px;
  padding: 16px 18px 18px;
  border-top: 1px solid #dbe4ef;
  background: rgba(255, 255, 255, 0.96);
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
  background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
  padding: 12px;
  display: grid;
  gap: 10px;
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

.agent-composer__submit {
  justify-self: end;
  height: 36px;
  padding: 0 14px;
  border-radius: 12px;
  border: 1px solid #1d4ed8;
  background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
  color: #ffffff;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
}

.agent-composer__submit:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}
</style>
