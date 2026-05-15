<script setup lang="ts">
/**
 * Pi Agent 主面板 - 包含消息列表和输入框
 */
import { usePiAgentStore } from '../../stores/piAgentStore'
import PiAgentMessageList from './PiAgentMessageList.vue'

const store = usePiAgentStore()

function handleSend() {
  if (store.canSend) {
    store.sendMessage()
  }
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    handleSend()
  }
}
</script>

<template>
  <div class="pi-agent-panel">
    <!-- 头部 -->
    <div class="panel-header">
      <span class="header-title">Pi Agent</span>
      <span class="header-status" :class="[`status-${store.status}`]">
        {{ store.status === 'idle' ? '就绪' : store.status === 'running' ? '处理中...' : store.status === 'completed' ? '完成' : store.status === 'failed' ? '失败' : '连接中...' }}
      </span>
    </div>

    <!-- 消息列表 -->
    <PiAgentMessageList />

    <!-- 输入区域 -->
    <div class="panel-input">
      <textarea
        v-model="store.inputText"
        class="input-textarea"
        placeholder="输入消息..."
        rows="2"
        :disabled="store.status === 'connecting'"
        @keydown="handleKeydown"
      />
      <button
        class="send-button"
        :disabled="!store.canSend"
        @click="handleSend"
      >
        发送
      </button>
    </div>
  </div>
</template>

<style scoped>
.pi-agent-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: white;
  border: 1px solid var(--p-surface-200, #e2e8f0);
  border-radius: 8px;
  overflow: hidden;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border-bottom: 1px solid var(--p-surface-200, #e2e8f0);
  background: var(--p-surface-50, #f8fafc);
}

.header-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--p-surface-800, #1e293b);
}

.header-status {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 10px;
}

.status-idle {
  background: var(--p-surface-100, #f1f5f9);
  color: var(--p-surface-600, #475569);
}

.status-connecting {
  background: #fef3c7;
  color: #92400e;
}

.status-running {
  background: #dbeafe;
  color: #1e40af;
}

.status-completed {
  background: #d1fae5;
  color: #065f46;
}

.status-failed {
  background: #fee2e2;
  color: #991b1b;
}

.panel-input {
  display: flex;
  gap: 8px;
  padding: 10px 12px;
  border-top: 1px solid var(--p-surface-200, #e2e8f0);
  background: var(--p-surface-50, #f8fafc);
}

.input-textarea {
  flex: 1;
  resize: none;
  border: 1px solid var(--p-surface-300, #cbd5e1);
  border-radius: 6px;
  padding: 8px 10px;
  font-size: 13px;
  line-height: 1.4;
  outline: none;
  transition: border-color 0.2s;
}

.input-textarea:focus {
  border-color: var(--p-primary-color, #2563eb);
}

.input-textarea:disabled {
  background: var(--p-surface-100, #f1f5f9);
  cursor: not-allowed;
}

.send-button {
  align-self: flex-end;
  padding: 8px 16px;
  background: var(--p-primary-color, #2563eb);
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s;
}

.send-button:hover:not(:disabled) {
  background: var(--p-primary-600, #1d4ed8);
}

.send-button:disabled {
  background: var(--p-surface-300, #cbd5e1);
  cursor: not-allowed;
}
</style>
